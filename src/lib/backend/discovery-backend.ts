/**
 * {@link SonosBackend} on top of the `sonos-discovery` package.
 *
 * This is the only file that knows that library. It translates its player objects and its
 * event names into the adapter's own vocabulary; the behaviour is meant to be identical to
 * what `main.ts` did directly before the facade was introduced.
 */
import SonosDiscovery from 'sonos-discovery';
import type { SonosFavorite, SonosPlayer, SonosPlayerState, SonosQueueItem } from 'sonos-discovery';

import {
    browseMedia,
    hasHomeTheater,
    htAudioInLabel,
    isHtAudioSilent,
    parseHtAudioIn,
    soapGetPositionInfo,
    soapGetZoneInfo,
    streamContentFromDidl,
    tvAudioFormat,
} from '../content-directory';
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
} from './types';

/** The small logger surface {@link SmapiHub} needs; the adapter's own logger satisfies it */
interface SmapiLog {
    warn: (message: string) => void;
    info: (message: string) => void;
    debug: (message: string) => void;
}

/** Event names of the library mapped onto the adapter's own ones */
const EVENT_NAMES: Record<string, SonosBackendEvent> = {
    'topology-change': 'topology-change',
    'transport-state': 'transport-state',
    'group-volume': 'group-volume',
    'volume-change': 'volume',
    'group-mute': 'group-mute',
    'mute-change': 'mute',
    favorites: 'favorites',
    'list-change': 'favorites',
};

/**
 * IP address out of the base URL of a player
 *
 * @param baseUrl `http://<ip>:1400`
 * @param underscores replace the dots, so that the result can be used as a channel name
 */
function ipOf(baseUrl: string, underscores: boolean): string | null {
    const match = baseUrl.match(/http:\/\/([.\d]+):?/);

    if (match?.[1]) {
        return underscores ? match[1].replace(/[.\s]+/g, '_') : match[1];
    }

    return null;
}

/** Browse results arrive either as an array or as a dictionary, depending on the call */
function toList(items: Record<string, SonosFavorite> | SonosFavorite[] | null | undefined): SonosMediaEntry[] {
    if (!items) {
        return [];
    }

    if (Array.isArray(items)) {
        return items;
    }

    return Object.keys(items)
        .map(key => items[key])
        .filter((item): item is SonosFavorite => Boolean(item));
}

class DiscoveryDevice implements SonosDevice {
    /** Bookkeeping of this adapter, the library does not maintain it */
    public volume = 0;
    /** Bookkeeping of this adapter, the library does not maintain it */
    public muted = false;

    public readonly uuid: string;
    public readonly ip: string | null;
    public readonly channel: string | null;

    constructor(
        private readonly player: SonosPlayer,
        private readonly backend: DiscoveryBackend,
    ) {
        this.uuid = player.uuid;
        this.ip = ipOf(player.baseUrl, false);
        this.channel = ipOf(player.baseUrl, true);
    }

    /** The underlying player, for the backend itself */
    get raw(): SonosPlayer {
        return this.player;
    }

    get roomName(): string {
        return this.player.roomName;
    }

    get baseUrl(): string {
        return this.player.baseUrl;
    }

    get coordinator(): SonosDevice {
        const coordinator = this.player.coordinator;
        if (!coordinator || coordinator.uuid === this.uuid) {
            return this;
        }
        return this.backend.getDeviceByUuid(coordinator.uuid) || this;
    }

    get isGroupMember(): boolean {
        return Boolean(this.player.coordinator && this.player.coordinator.uuid !== this.uuid);
    }

    get groupMembers(): SonosDevice[] {
        const master = this.coordinator.uuid;
        return this.backend.devices.filter(device => device.coordinator.uuid === master);
    }

    get state(): SonosDeviceState {
        return this.player.state;
    }

    get groupState(): SonosGroupState {
        return this.player.groupState;
    }

    get transportUri(): string {
        return String(this.player.avTransportUri || this.player.state?.currentTrack?.uri || '');
    }

    get transportUriMetadata(): string {
        return typeof this.player.avTransportUriMetadata === 'string' ? this.player.avTransportUriMetadata : '';
    }

    // playback ------------------------------------------------------------

    async play(): Promise<void> {
        await this.player.play();
    }

    async pause(): Promise<void> {
        await this.player.pause();
    }

    async next(): Promise<void> {
        await this.player.nextTrack();
    }

    async previous(): Promise<void> {
        await this.player.previousTrack();
    }

    async seekTime(seconds: number): Promise<void> {
        await this.player.timeSeek(seconds);
    }

    async seekTrack(trackNo: number): Promise<void> {
        await this.player.trackSeek(trackNo);
    }

    async setShuffle(enabled: boolean): Promise<void> {
        await this.player.shuffle(enabled);
    }

    async setRepeat(mode: string): Promise<void> {
        await this.player.repeat(mode);
    }

    async setCrossfade(enabled: boolean): Promise<void> {
        await this.player.crossfade(enabled);
    }

    // volume and sound ----------------------------------------------------

    async setVolume(volume: number): Promise<void> {
        await this.player.setVolume(volume);
    }

    async setMute(muted: boolean): Promise<void> {
        await (muted ? this.player.mute() : this.player.unMute());
    }

    async setGroupVolume(volume: number): Promise<void> {
        await this.player.setGroupVolume(volume);
    }

    async setGroupMute(muted: boolean): Promise<void> {
        await (muted ? this.player.muteGroup() : this.player.unMuteGroup());
    }

    async setBass(value: number): Promise<void> {
        await this.player.setBass(value);
    }

    async setTreble(value: number): Promise<void> {
        await this.player.setTreble(value);
    }

    async setNightMode(enabled: boolean): Promise<void> {
        await this.player.nightMode(enabled);
    }

    async setSpeechEnhancement(enabled: boolean): Promise<void> {
        await this.player.speechEnhancement(enabled);
    }

    // sources -------------------------------------------------------------

    async setTransportUri(uri: string, metadata?: string): Promise<void> {
        await this.player.setAVTransport(uri, metadata);
    }

    async playFavorite(title: string): Promise<void> {
        await this.player.replaceWithFavorite(title);
        await this.player.play();
    }

    async playPlaylist(title: string): Promise<void> {
        await this.player.replaceWithPlaylist(title);
        await this.player.play();
    }

    // queue ---------------------------------------------------------------

    async getQueue(): Promise<SonosQueueEntry[]> {
        return await this.player.getQueue();
    }

    async addToQueue(uri: string, metadata?: string): Promise<number> {
        const result = await this.player.addURIToQueue(uri, metadata);
        return parseInt(String(result?.firsttracknumberenqueued), 10);
    }

    async removeFromQueue(trackNo: number): Promise<void> {
        await this.player.removeTrackFromQueue(trackNo);
    }

    async clearQueue(): Promise<void> {
        await this.player.clearQueue();
    }

    // grouping ------------------------------------------------------------

    async leaveGroup(): Promise<void> {
        await this.player.becomeCoordinatorOfStandaloneGroup();
    }

    // browsing ------------------------------------------------------------

    async browse(objectId: string): Promise<MediaBrowseItem[]> {
        return await browseMedia(this.baseUrl, objectId);
    }

    async hasTvInput(): Promise<boolean> {
        return await hasHomeTheater(this.baseUrl);
    }

    /**
     * The speaker knows the format in two places: `HTAudioIn` of GetZoneInfo carries a code,
     * and the position info carries the `streamContent` the soundbar shows. The first one is
     * authoritative, the second fills in where the code has no label.
     */
    async tvAudioFormat(): Promise<string> {
        try {
            const code = parseHtAudioIn(await soapGetZoneInfo(this.baseUrl));
            if (code != null) {
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
            return tvAudioFormat(streamContentFromDidl(await soapGetPositionInfo(this.baseUrl)));
        } catch {
            return '';
        }
    }
}

export class DiscoveryBackend implements SonosBackend {
    private readonly discovery: SonosDiscovery;
    private readonly smapi: SmapiHub;
    public readonly music: MusicServiceAccess;
    /** One wrapper per player, so that identity and the bookkeeping survive */
    private readonly wrappers = new Map<string, DiscoveryDevice>();

    constructor(options: { cacheDir: string; port?: number; log: SmapiLog; tokenFile: string }) {
        this.discovery = new SonosDiscovery({
            household: null,
            log: options.log,
            cacheDir: options.cacheDir,
            port: options.port,
        });

        this.smapi = new SmapiHub(options.log, options.tokenFile);

        // Which speaker is asked does not matter: the accounts belong to the household.
        const anyBaseUrl = (): string => this.devices[0]?.baseUrl || '';
        this.music = {
            hasCatalog: name => this.smapi.hasSoapCatalog(anyBaseUrl(), name),
            browse: (name, objectId, german) => this.smapi.browse(anyBaseUrl(), name, objectId, german),
            search: (name, term, german) => this.smapi.search(anyBaseUrl(), name, term, german),
            completeLogin: name => this.smapi.completeLogin(anyBaseUrl(), name),
        };
    }

    get devices(): SonosDevice[] {
        return (this.discovery.players || []).filter(Boolean).map(player => this.wrap(player));
    }

    get musicServices(): Record<string, SonosMusicService> {
        return this.discovery.availableServices || {};
    }

    get localEndpoint(): string {
        return this.discovery.localEndpoint;
    }

    private wrap(player: SonosPlayer): DiscoveryDevice {
        let wrapper = this.wrappers.get(player.uuid);
        if (!wrapper) {
            wrapper = new DiscoveryDevice(player, this);
            this.wrappers.set(player.uuid, wrapper);
        }
        return wrapper;
    }

    /** `sonos-discovery` starts discovering in its constructor, so there is nothing to await. */
    start(): Promise<void> {
        return Promise.resolve();
    }

    getDeviceByUuid(uuid: string): SonosDevice | undefined {
        const player = this.discovery.getPlayerByUUID(uuid);
        return player ? this.wrap(player) : undefined;
    }

    getDeviceByChannel(channel: string): SonosDevice | undefined {
        return this.devices.find(device => device.channel === channel);
    }

    async getFavorites(): Promise<SonosMediaEntry[]> {
        return toList(await this.discovery.getFavorites());
    }

    async getPlaylists(): Promise<SonosMediaEntry[]> {
        if (!this.discovery.getPlaylists) {
            return [];
        }
        return toList(await this.discovery.getPlaylists());
    }

    on<E extends SonosBackendEvent>(event: E, listener: (data: SonosBackendEventMap[E]) => void): void {
        const emit = (data: unknown): void => listener(data as SonosBackendEventMap[E]);

        // "transport-state" carries the player object itself. Reduce it to uuid and state, so
        // that no object of the library reaches the adapter.
        if (event === 'transport-state') {
            this.discovery.on('transport-state', (player: SonosPlayer) => {
                if (player?.uuid) {
                    emit({ uuid: player.uuid, state: player.state });
                }
            });
            return;
        }

        // "topology-change" is either the list of groups or the single device that announced
        // itself. Both shapes get a name here instead of being told apart by `data.length`.
        if (event === 'topology-change') {
            this.discovery.on('topology-change', (data: any) => {
                if (Array.isArray(data)) {
                    emit({
                        groups: data.map(group => ({
                            uuid: group.uuid,
                            members: (group.members || []).map((member: { uuid: string; roomName?: string }) => ({
                                uuid: member.uuid,
                                roomName: member.roomName,
                            })),
                        })),
                    });
                } else if (data?.uuid) {
                    emit({ uuid: data.uuid });
                }
            });
            return;
        }

        // The queue is not part of the event payload, so it is fetched here and the adapter
        // gets the same shape as for every other event.
        if (event === 'queue') {
            this.discovery.on('queue-change', (player: SonosPlayer) => {
                if (!player) {
                    return;
                }
                player
                    .getQueue()
                    .then((queue: SonosQueueItem[]) => emit({ uuid: player.uuid, queue }))
                    .catch(() => {
                        // a failing queue read must not kill the listener
                    });
            });
            return;
        }

        // treble and bass are emitted under their own names
        if (event === 'treble' || event === 'bass') {
            this.discovery.on(event, emit);
            return;
        }

        Object.keys(EVENT_NAMES)
            .filter(name => EVENT_NAMES[name] === event)
            .forEach(name => this.discovery.on(name, emit));
    }

    dispose(): void {
        this.wrappers.clear();
        this.discovery.dispose();
    }
}

/** Re-exported so that consumers do not need to know the library's types */
export type { SonosPlayerState };
