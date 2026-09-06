/**
 * {@link SonosBackend} on top of `@svrooij/sonos`.
 *
 * The other implementation, `discovery-backend.ts`, wraps a library that keeps an aggregated
 * state per player. This one does not get that for free: `@svrooij/sonos` delivers typed
 * events per device and per service, so the state the adapter needs is assembled here from
 * the AVTransport and RenderingControl events plus a position read.
 */
import * as os from 'node:os';

import type { SonosDevice as SvrDevice } from '@svrooij/sonos';
import { MetaDataHelper, SonosManager } from '@svrooij/sonos';
import { PlayMode } from '@svrooij/sonos/lib/models';
import type { BrowseResponse, Track } from '@svrooij/sonos/lib/models';
import type { AVTransportServiceEvent, RenderingControlServiceEvent } from '@svrooij/sonos/lib/services';

import { htAudioInLabel, isHtAudioSilent, mediaItem, streamContentFromDidl, tvAudioFormat } from '../content-directory';
import { SmapiHub } from '../smapi';

import type { MusicServiceAccess, SonosBackend, SonosDevice } from './sonos-backend';
import type {
    MediaBrowseItem,
    SonosBackendEvent,
    SonosBackendEventMap,
    SonosDeviceState,
    SonosGroupState,
    SonosMediaEntry,
    SonosMusicService,
    SonosQueueEntry,
    SonosTrack,
    SonosZoneGroup,
} from './types';

/** The small logger surface {@link SmapiHub} needs */
interface SmapiLog {
    warn: (message: string) => void;
    info: (message: string) => void;
    debug: (message: string) => void;
}

/** `h:mm:ss` into seconds; the speakers answer with that format everywhere */
export function toSeconds(time: string | undefined): number {
    if (!time) {
        return 0;
    }
    return String(time)
        .split(':')
        .reverse()
        .reduce((sum, part, index) => sum + (parseInt(part, 10) || 0) * Math.pow(60, index), 0);
}

/** Seconds into `h:mm:ss`, the shape the adapter writes into `current_elapsed_s` */
export function toFormatted(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const mm = `${minutes}`.padStart(2, '0');
    const ss = `${secs}`.padStart(2, '0');
    return hours ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

/**
 * Shuffle and repeat are one enum here, but two independent states in ioBroker.
 * These two helpers fold and unfold it without losing either.
 */
export function fromPlayMode(mode: PlayMode | undefined): { shuffle: boolean; repeat: string } {
    switch (mode) {
        case PlayMode.RepeatAll:
            return { shuffle: false, repeat: 'all' };
        case PlayMode.RepeatOne:
            return { shuffle: false, repeat: 'one' };
        case PlayMode.Shuffle:
            return { shuffle: true, repeat: 'all' };
        case PlayMode.ShuffleNoRepeat:
            return { shuffle: true, repeat: 'none' };
        case PlayMode.SuffleRepeatOne:
            return { shuffle: true, repeat: 'one' };
        default:
            return { shuffle: false, repeat: 'none' };
    }
}

export function toPlayMode(shuffle: boolean, repeat: string): PlayMode {
    if (shuffle) {
        if (repeat === 'one') {
            return PlayMode.SuffleRepeatOne;
        }
        return repeat === 'all' ? PlayMode.Shuffle : PlayMode.ShuffleNoRepeat;
    }
    if (repeat === 'one') {
        return PlayMode.RepeatOne;
    }
    return repeat === 'all' ? PlayMode.RepeatAll : PlayMode.Normal;
}

/** `PLAYING` and friends; the adapter compares against these strings */
function transportState(state: string | undefined): string {
    return String(state || 'STOPPED').toUpperCase();
}

/** A parsed track of the library into the adapter's shape */
export function toTrack(track: Track | string | undefined, uri?: string): SonosTrack {
    if (!track || typeof track === 'string') {
        return { uri: uri || '', duration: 0 };
    }

    const upnpClass = String(track.UpnpClass || '').toLowerCase();
    const trackUri = track.TrackUri || uri || '';
    let type = 'track';
    if (upnpClass.includes('audiobroadcast')) {
        type = 'radio';
    } else if (trackUri.startsWith('x-rincon-stream:') || trackUri.startsWith('x-sonos-htastream:')) {
        type = 'line_in';
    }

    return {
        uri: trackUri,
        title: track.Title || '',
        artist: track.Artist || '',
        album: track.Album || '',
        albumArtUri: track.AlbumArtUri || '',
        duration: toSeconds(track.Duration),
        type,
    };
}

/**
 * Browse results come back as `Result`, which is the parsed track list when the parsing
 * variant of the call was used and the raw DIDL string otherwise.
 */
function toEntries(result: BrowseResponse): SonosMediaEntry[] {
    if (!Array.isArray(result?.Result)) {
        return [];
    }

    return result.Result.map(item => ({
        title: item.Title || '',
        uri: item.TrackUri || '',
        albumArtUri: item.AlbumArtUri || '',
        metadata: '',
    }));
}

/** Exported for the tests: the event folding is pure and worth covering directly. */
export class SvrooijDevice implements SonosDevice {
    public volume = 0;
    public muted = false;

    public readonly uuid: string;
    public readonly ip: string | null;
    public readonly channel: string | null;

    /** Assembled from the events; the adapter reads it synchronously */
    private cached: SonosDeviceState = {
        currentTrack: { uri: '', duration: 0 },
        playbackState: 'STOPPED',
        elapsedTime: 0,
        elapsedTimeFormatted: '0:00',
        trackNo: 0,
        volume: 0,
        mute: false,
        playMode: { shuffle: false, repeat: 'none', crossfade: false },
        groupState: { volume: 0, mute: false },
        equalizer: {},
    };

    private lastTransportUri = '';
    private lastTransportMetadata = '';
    /** The hardware does not change, so the probe is answered once */
    private homeTheater?: boolean;

    constructor(
        public readonly device: SvrDevice,
        private readonly backend: SvrooijBackend,
    ) {
        this.uuid = device.Uuid;
        this.ip = device.Host;
        this.channel = device.Host ? device.Host.replace(/[.\s]+/g, '_') : null;
    }

    get roomName(): string {
        return this.device.Name;
    }

    get baseUrl(): string {
        return `http://${this.device.Host}:${this.device.Port}`;
    }

    get coordinator(): SonosDevice {
        const uuid = this.device.Coordinator?.Uuid;
        if (!uuid || uuid === this.uuid) {
            return this;
        }
        return this.backend.getDeviceByUuid(uuid) || this;
    }

    get isGroupMember(): boolean {
        return Boolean(this.device.Coordinator && this.device.Coordinator.Uuid !== this.uuid);
    }

    get groupMembers(): SonosDevice[] {
        const master = this.coordinator.uuid;
        return this.backend.devices.filter(item => item.coordinator.uuid === master);
    }

    get state(): SonosDeviceState {
        return this.cached;
    }

    get groupState(): SonosGroupState {
        return this.cached.groupState || { volume: 0, mute: false };
    }

    get transportUri(): string {
        return this.lastTransportUri || this.cached.currentTrack.uri || '';
    }

    get transportUriMetadata(): string {
        return this.lastTransportMetadata;
    }

    /**
     * Fold an AVTransport event into the cached state.
     *
     * These events are partial: the speaker sends only what changed. Every field is therefore
     * kept unless the event actually carries it - overwriting with a default would make the
     * states flap, for instance back to STOPPED while playback continues.
     */
    applyTransportEvent(data: AVTransportServiceEvent): void {
        if (data.AVTransportURI !== undefined) {
            this.lastTransportUri = String(data.AVTransportURI);
        }
        // The library hands this over parsed whenever it can, but TTS has to put the exact
        // DIDL back after an announcement, so a parsed track is turned back into a string.
        if (data.AVTransportURIMetaData !== undefined) {
            this.lastTransportMetadata =
                typeof data.AVTransportURIMetaData === 'string'
                    ? data.AVTransportURIMetaData
                    : MetaDataHelper.TrackToMetaData(data.AVTransportURIMetaData, true);
        }

        const next: SonosDeviceState = { ...this.cached };

        if (data.CurrentTrackMetaData !== undefined || data.CurrentTrackURI !== undefined) {
            next.currentTrack = toTrack(data.CurrentTrackMetaData, data.CurrentTrackURI);
        }
        if (data.NextTrackMetaData !== undefined) {
            next.nextTrack = toTrack(data.NextTrackMetaData);
        }
        if (data.CurrentPlayMode !== undefined || data.CurrentCrossfadeMode !== undefined) {
            const mode = fromPlayMode(
                data.CurrentPlayMode ??
                    toPlayMode(Boolean(this.cached.playMode?.shuffle), this.cached.playMode?.repeat || 'none'),
            );
            next.playMode = {
                shuffle: mode.shuffle,
                repeat: mode.repeat,
                crossfade: data.CurrentCrossfadeMode ?? Boolean(this.cached.playMode?.crossfade),
            };
        }
        if (data.TransportState !== undefined) {
            next.playbackState = transportState(data.TransportState);
        }
        if (data.CurrentTrack !== undefined) {
            next.trackNo = data.CurrentTrack;
        }

        this.cached = next;
    }

    /** Fold a RenderingControl event into the cached state */
    applyRenderingEvent(data: RenderingControlServiceEvent): void {
        const volume = data.Volume?.Master;
        const mute = data.Mute?.Master;

        this.cached = {
            ...this.cached,
            volume: volume ?? this.cached.volume,
            mute: mute ?? this.cached.mute,
            equalizer: {
                ...this.cached.equalizer,
                bass: data.Bass ?? this.cached.equalizer?.bass,
                treble: data.Treble ?? this.cached.equalizer?.treble,
                loudness: data.Loudness ?? this.cached.equalizer?.loudness,
                nightMode: data.NightMode ?? this.cached.equalizer?.nightMode,
                speechEnhancement:
                    data.DialogLevel !== undefined
                        ? data.DialogLevel === '1' || String(data.DialogLevel).toLowerCase() === 'true'
                        : this.cached.equalizer?.speechEnhancement,
            },
        };

        if (volume !== undefined) {
            this.volume = volume;
        }
        if (mute !== undefined) {
            this.muted = mute;
        }
    }

    /**
     * Read the play position. The events do not carry it, but the adapter needs it for
     * `current_elapsed` and to decide whether the elapsed timer has to run.
     */
    async refreshPosition(): Promise<void> {
        try {
            const info = await this.device.AVTransportService.GetPositionInfo();
            const elapsed = toSeconds(info.RelTime);

            this.cached = {
                ...this.cached,
                elapsedTime: elapsed,
                elapsedTimeFormatted: toFormatted(elapsed),
                trackNo: info.Track ?? this.cached.trackNo,
                currentTrack: {
                    ...this.cached.currentTrack,
                    duration: toSeconds(info.TrackDuration) || this.cached.currentTrack.duration,
                },
            };
        } catch {
            // a failing position read must not drop the rest of the state
        }
    }

    /** Read the group volume and mute, which have their own service */
    async refreshGroupState(): Promise<void> {
        try {
            const [volume, mute] = await Promise.all([
                this.device.GroupRenderingControlService.GetGroupVolume({ InstanceID: 0 }),
                this.device.GroupRenderingControlService.GetGroupMute({ InstanceID: 0 }),
            ]);
            this.cached = {
                ...this.cached,
                groupState: {
                    volume: volume.CurrentVolume ?? 0,
                    mute: Boolean(mute.CurrentMute),
                },
            };
        } catch {
            // the group services are not answered by every model
        }
    }

    // playback ------------------------------------------------------------

    async play(): Promise<void> {
        await this.device.Play();
    }

    async pause(): Promise<void> {
        await this.device.Pause();
    }

    async next(): Promise<void> {
        await this.device.Next();
    }

    async previous(): Promise<void> {
        await this.device.Previous();
    }

    async seekTime(seconds: number): Promise<void> {
        await this.device.SeekPosition(toFormatted(Math.max(0, Math.round(seconds))));
    }

    async seekTrack(trackNo: number): Promise<void> {
        await this.device.SeekTrack(trackNo);
    }

    private async setPlayMode(shuffle: boolean, repeat: string): Promise<void> {
        await this.device.AVTransportService.SetPlayMode({
            InstanceID: 0,
            NewPlayMode: toPlayMode(shuffle, repeat),
        });
    }

    async setShuffle(enabled: boolean): Promise<void> {
        await this.setPlayMode(enabled, this.cached.playMode?.repeat || 'none');
    }

    async setRepeat(mode: string): Promise<void> {
        await this.setPlayMode(Boolean(this.cached.playMode?.shuffle), mode);
    }

    async setCrossfade(enabled: boolean): Promise<void> {
        await this.device.AVTransportService.SetCrossfadeMode({ InstanceID: 0, CrossfadeMode: enabled });
    }

    // volume and sound ----------------------------------------------------

    async setVolume(volume: number): Promise<void> {
        await this.device.SetVolume(volume);
    }

    async setMute(muted: boolean): Promise<void> {
        await this.device.RenderingControlService.SetMute({ InstanceID: 0, Channel: 'Master', DesiredMute: muted });
    }

    async setGroupVolume(volume: number): Promise<void> {
        await this.device.GroupRenderingControlService.SetGroupVolume({ InstanceID: 0, DesiredVolume: volume });
    }

    async setGroupMute(muted: boolean): Promise<void> {
        await this.device.GroupRenderingControlService.SetGroupMute({ InstanceID: 0, DesiredMute: muted });
    }

    async setBass(value: number): Promise<void> {
        await this.device.RenderingControlService.SetBass({ InstanceID: 0, DesiredBass: value });
    }

    async setTreble(value: number): Promise<void> {
        await this.device.RenderingControlService.SetTreble({ InstanceID: 0, DesiredTreble: value });
    }

    async setNightMode(enabled: boolean): Promise<void> {
        await this.device.SetNightMode(enabled);
    }

    async setSpeechEnhancement(enabled: boolean): Promise<void> {
        await this.device.SetSpeechEnhancement(enabled);
    }

    // sources -------------------------------------------------------------

    async setTransportUri(uri: string, metadata?: string): Promise<void> {
        await this.device.AVTransportService.SetAVTransportURI({
            InstanceID: 0,
            CurrentURI: uri,
            CurrentURIMetaData: metadata || '',
        });
    }

    /**
     * The library has no "play this favorite by name", so it is composed here: look the entry
     * up, then either point the player at it or put it into the queue - the same decision
     * `replaceWithFavorite` made in the other library.
     */
    private async playEntry(entry: SonosMediaEntry | undefined, what: string): Promise<void> {
        if (!entry?.uri) {
            throw new Error(`Unknown ${what}`);
        }

        const uri = entry.uri;
        // containers and streams are set directly, single tracks go through the queue
        if (/^(x-rincon-cpcontainer:|x-sonosapi-|x-rincon-mp3radio:|x-sonosprog-http:|pndrradio:|aac:)/i.test(uri)) {
            await this.setTransportUri(uri, entry.metadata);
        } else {
            await this.clearQueue();
            await this.addToQueue(uri, entry.metadata);
            await this.device.SwitchToQueue();
        }
        await this.play();
    }

    async playFavorite(title: string): Promise<void> {
        const favorites = await this.backend.getFavorites();
        await this.playEntry(
            favorites.find(item => item.title === title),
            `favorite "${title}"`,
        );
    }

    async playPlaylist(title: string): Promise<void> {
        const playlists = await this.backend.getPlaylists();
        await this.playEntry(
            playlists.find(item => item.title === title),
            `playlist "${title}"`,
        );
    }

    // queue ---------------------------------------------------------------

    async getQueue(): Promise<SonosQueueEntry[]> {
        const queue = await this.device.GetQueue();
        if (!Array.isArray(queue?.Result)) {
            return [];
        }
        return queue.Result.map(item => ({
            title: item.Title || '',
            artist: item.Artist || '',
            album: item.Album || '',
            albumArtUri: item.AlbumArtUri || '',
            uri: item.TrackUri || '',
        }));
    }

    async addToQueue(uri: string, metadata?: string): Promise<number> {
        const result = await this.device.AVTransportService.AddURIToQueue({
            InstanceID: 0,
            EnqueuedURI: uri,
            EnqueuedURIMetaData: metadata || '',
            DesiredFirstTrackNumberEnqueued: 0,
            EnqueueAsNext: false,
        });
        return result.FirstTrackNumberEnqueued;
    }

    async removeFromQueue(trackNo: number): Promise<void> {
        await this.device.AVTransportService.RemoveTrackFromQueue({
            InstanceID: 0,
            ObjectID: `Q:0/${trackNo}`,
            UpdateID: 0,
        });
    }

    async clearQueue(): Promise<void> {
        await this.device.AVTransportService.RemoveAllTracksFromQueue();
    }

    // grouping ------------------------------------------------------------

    async leaveGroup(): Promise<void> {
        await this.device.AVTransportService.BecomeCoordinatorOfStandaloneGroup();
    }

    // browsing ------------------------------------------------------------

    async browse(objectId: string): Promise<MediaBrowseItem[]> {
        const result = await this.device.ContentDirectoryService.BrowseParsed({
            ObjectID: objectId,
            BrowseFlag: 'BrowseDirectChildren',
            Filter: '*',
            StartingIndex: 0,
            RequestedCount: 200,
            SortCriteria: '',
        });

        if (!Array.isArray(result?.Result)) {
            return [];
        }

        return result.Result.map(item => {
            const uri = item.TrackUri || '';
            const isContainer = String(item.UpnpClass || '')
                .toLowerCase()
                .includes('object.container');

            return mediaItem({
                id: item.ItemId || uri || item.Title || '',
                title: item.Title || item.ItemId || '',
                uri,
                artist: item.Artist || '',
                album: item.Album || '',
                cover: item.AlbumArtUri || '',
                // line-in and the TV input are containers by class but playable, not browsable
                folder: isContainer && !uri.startsWith('x-rincon-stream:') && !uri.startsWith('x-sonos-htastream:'),
            });
        });
    }

    async hasTvInput(): Promise<boolean> {
        if (this.homeTheater === undefined) {
            try {
                const info = await this.device.GetZoneInfo();
                // only soundbars and amps report this field at all
                this.homeTheater = typeof info?.HTAudioIn === 'number';
            } catch {
                this.homeTheater = false;
            }
        }
        return this.homeTheater;
    }

    /** Same two sources as the other backend: the HTAudioIn code, then the stream content */
    async tvAudioFormat(): Promise<string> {
        try {
            const code = (await this.device.GetZoneInfo())?.HTAudioIn;
            if (typeof code === 'number') {
                if (isHtAudioSilent(code)) {
                    return '';
                }
                const label = htAudioInLabel(code);
                if (label) {
                    return label;
                }
            }
        } catch {
            // fall through to the position info
        }

        try {
            const info = await this.device.AVTransportService.GetPositionInfo();
            const meta = info?.TrackMetaData;
            return tvAudioFormat(typeof meta === 'string' ? streamContentFromDidl(meta) : '');
        } catch {
            return '';
        }
    }
}

export class SvrooijBackend implements SonosBackend {
    private readonly manager = new SonosManager();
    private readonly wrappers = new Map<string, SvrooijDevice>();
    private readonly listeners = new Map<SonosBackendEvent, ((data: any) => void)[]>();
    private services: Record<string, SonosMusicService> = {};
    private lastGroups = '';

    private endpoint = '';
    private readonly smapi: SmapiHub;
    public readonly music: MusicServiceAccess;

    /**
     * `SonosManager.Devices` throws while nothing has been discovered yet, and the adapter asks
     * for the device list at times when that is a perfectly normal state - during unload, or
     * before the first speaker answered.
     */
    private get known(): SvrDevice[] {
        try {
            return this.manager.Devices || [];
        } catch {
            return [];
        }
    }

    /**
     * `SmapiHub` is this adapter's own SMAPI client and is shared with the other backend.
     * It stays because it reads the accounts the user already linked in the SONOS app out of
     * the speaker, which `@svrooij/sonos` documents that it cannot do.
     */
    constructor(private readonly options: { localEndpoint?: string; tokenFile: string; log: SmapiLog }) {
        this.smapi = new SmapiHub(options.log, options.tokenFile);

        const anyBaseUrl = (): string => this.devices[0]?.baseUrl || '';
        this.music = {
            hasCatalog: name => this.smapi.hasSoapCatalog(anyBaseUrl(), name),
            browse: (name, objectId, german) => this.smapi.browse(anyBaseUrl(), name, objectId, german),
            search: (name, term, german) => this.smapi.search(anyBaseUrl(), name, term, german),
            completeLogin: name => this.smapi.completeLogin(anyBaseUrl(), name),
        };
    }

    /** Discover the household and start listening. Must be awaited before anything else. */
    async start(): Promise<void> {
        await this.manager.InitializeWithDiscovery(10);
        this.known.forEach(device => this.attach(device));
        this.manager.OnNewDevice(device => this.attach(device));

        const any = this.known[0];
        if (any) {
            try {
                const list = await any.MusicServicesService.ListAndParseAvailableServices(true);
                this.services = {};
                list.forEach(service => {
                    this.services[service.Name] = { id: service.Id, type: Number(service.ContainerType) || 0 };
                });
            } catch {
                // the household answers this only when it knows any service at all
            }
        }

        this.endpoint = this.resolveLocalEndpoint();

        await this.emitTopology();
    }

    get devices(): SonosDevice[] {
        return this.known.map(device => this.wrap(device));
    }

    get musicServices(): Record<string, SonosMusicService> {
        return this.services;
    }

    get localEndpoint(): string {
        return this.options.localEndpoint || this.endpoint;
    }

    /**
     * Address the speakers can reach this host at.
     *
     * `sonos-discovery` worked this out itself; here the interface that shares a subnet with a
     * speaker is picked, so a host with several interfaces answers with the right one.
     */
    private resolveLocalEndpoint(): string {
        const candidates: string[] = [];
        Object.values(os.networkInterfaces()).forEach((list?: os.NetworkInterfaceInfo[]) =>
            (list || []).forEach(entry => {
                if (entry.family === 'IPv4' && !entry.internal) {
                    candidates.push(entry.address);
                }
            }),
        );

        const speaker = this.known[0]?.Host;
        if (speaker) {
            const prefix = speaker.split('.').slice(0, 3).join('.');
            const sameSubnet = candidates.find(address => address.startsWith(`${prefix}.`));
            if (sameSubnet) {
                return sameSubnet;
            }
        }

        return candidates[0] || '127.0.0.1';
    }

    private wrap(device: SvrDevice): SvrooijDevice {
        let wrapper = this.wrappers.get(device.Uuid);
        if (!wrapper) {
            wrapper = new SvrooijDevice(device, this);
            this.wrappers.set(device.Uuid, wrapper);
        }
        return wrapper;
    }

    private emit<E extends SonosBackendEvent>(event: E, data: SonosBackendEventMap[E]): void {
        this.listeners.get(event)?.forEach(listener => listener(data));
    }

    /** Subscribe to everything one device can tell us and translate it */
    private attach(device: SvrDevice): void {
        const wrapper = this.wrap(device);

        device.Events.on('avtransport', data => {
            wrapper.applyTransportEvent(data);
            void wrapper.refreshPosition().then(() => {
                this.emit('transport-state', { uuid: wrapper.uuid, state: wrapper.state });
            });
        });

        device.Events.on('renderingcontrol', data => {
            const hadVolume = data.Volume?.Master !== undefined;
            const hadMute = data.Mute?.Master !== undefined;
            wrapper.applyRenderingEvent(data);

            if (hadVolume) {
                this.emit('volume', {
                    uuid: wrapper.uuid,
                    roomName: wrapper.roomName,
                    newVolume: wrapper.state.volume,
                });
            }
            if (hadMute) {
                this.emit('mute', { uuid: wrapper.uuid, roomName: wrapper.roomName, newMute: wrapper.state.mute });
            }
            if (data.Bass !== undefined) {
                this.emit('bass', { uuid: wrapper.uuid, value: data.Bass });
            }
            if (data.Treble !== undefined) {
                this.emit('treble', { uuid: wrapper.uuid, value: data.Treble });
            }
        });

        // grouping changes arrive per device; the topology is rebuilt from all of them
        device.Events.on('coordinator', () => void this.emitTopology());
        device.Events.on('groupname', () => void this.emitTopology());
    }

    /** Build the group list the adapter expects and emit it when it actually changed */
    private async emitTopology(): Promise<void> {
        const groups = new Map<string, SonosZoneGroup>();

        this.devices.forEach(device => {
            const master = device.coordinator;
            const group = groups.get(master.uuid) || { uuid: master.uuid, members: [] };
            group.members.push({ uuid: device.uuid, roomName: device.roomName });
            groups.set(master.uuid, group);
        });

        const list = [...groups.values()];
        const fingerprint = JSON.stringify(list);
        if (fingerprint === this.lastGroups) {
            return;
        }
        this.lastGroups = fingerprint;

        // the group volume is not evented, so it is refreshed together with the topology
        await Promise.all(this.devices.map(device => (device as SvrooijDevice).refreshGroupState()));

        this.emit('topology-change', { groups: list });
    }

    getDeviceByUuid(uuid: string): SonosDevice | undefined {
        const device = this.known.find(item => item.Uuid === uuid);
        return device ? this.wrap(device) : undefined;
    }

    getDeviceByChannel(channel: string): SonosDevice | undefined {
        return this.devices.find(device => device.channel === channel);
    }

    async getFavorites(): Promise<SonosMediaEntry[]> {
        const device = this.known[0];
        if (!device) {
            return [];
        }
        return toEntries(await device.GetFavorites());
    }

    async getPlaylists(): Promise<SonosMediaEntry[]> {
        const device = this.known[0];
        if (!device) {
            return [];
        }
        return toEntries(await device.ContentDirectoryService.BrowseParsedWithDefaults('SQ:'));
    }

    on<E extends SonosBackendEvent>(event: E, listener: (data: SonosBackendEventMap[E]) => void): void {
        const list = this.listeners.get(event) || [];
        list.push(listener as (data: any) => void);
        this.listeners.set(event, list);
    }

    dispose(): void {
        this.manager.CancelSubscription();
        this.known.forEach(device => device.CancelEvents());
        this.wrappers.clear();
    }
}
