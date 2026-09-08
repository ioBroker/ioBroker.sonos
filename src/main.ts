/**
 *      ioBroker Sonos Adapter
 *      Copyright (c) 12'2013-2026 Bluefox <dogafox@gmail.com>
 *      MIT License
 *
 *      derived from https://github.com/jishi/node-sonos-web-controller by Jimmy Shimizu
 */
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as os from 'node:os';

import * as utils from '@iobroker/adapter-core';
import { DiscoveryBackend } from './lib/backend/discovery-backend';
import { SvrooijBackend } from './lib/backend/svrooij-backend';
import type { SonosBackend, SonosDevice } from './lib/backend/sonos-backend';
import type {
    SonosBackendEvent,
    SonosDeviceState,
    SonosMediaEntry,
    SonosQueueEntry,
    SonosTopologyEvent,
} from './lib/backend/types';

import { TTS } from './lib/tts';
import { getChannelStates } from './lib/states';
import {
    getMediaRoot,
    isDirectPlayUri,
    isLineInStreamUri,
    isTvStreamUri,
    matchesMusicService,
    mediaItem,
    nowPlayingLabels,
    streamContentFromDidl,
    tvAudioFormat,
    tvStreamUri,
} from './lib/content-directory';
import type { MediaBrowseItem, MediaBrowseResult } from './lib/content-directory';
import { encodeSmapiId, parseSmapiId } from './lib/smapi';

const DEFAULT_IMAGE = `${__dirname}/../img/no-cover.png`;
const TV_IMAGE = `${__dirname}/../img/tv-cover.png`;

/** Information about one sonos device */
interface ChannelInfo {
    uuid: string;
    player: SonosDevice | null;
    duration: number;
    elapsed: number;
    obj: ioBroker.Object | null;
    elapsedTimer?: NodeJS.Timeout | null;
    tvFormatTimer?: NodeJS.Timeout | null;
    timerVolume?: NodeJS.Timeout | null;
}

/** Playback state of a player, extracted from the sonos playbackState */
interface PlaybackState {
    playing: boolean;
    paused: boolean;
    transitioning: boolean;
    stopped: boolean;
}

interface EnumRow {
    id: string;
    value?: any;
}

/** One device, found by the discovery */
interface FoundDevice {
    roomName: string;
    ip: string | null;
}

interface RecentTrack {
    title: string;
    artist: string;
    album: string;
    station: string;
    cover: string;
    uri: string;
    ts: number;
}

const RECENT_TRACKS_MAX = 25;

/** How often the HDMI audio format is re-read while the TV input is playing */
const TV_FORMAT_POLL_MS = 5000;
/** Debounce for {@link Sonos.resolveTvFormat}, so an event burst does not hit the speaker repeatedly */
const TV_FORMAT_CACHE_MS = 2000;

/** Grouping URI used when a player is a slave (`x-rincon:RINCON_...`) */
function isGroupingUri(uri: string | undefined): boolean {
    return /^x-rincon:RINCON_/i.test(String(uri || ''));
}

/** HDMI / line-in start with SetAVTransportURI. Play/Pause/Seek return HTTP 500. */
const TV_NO_TRANSPORT = new Set([
    'play',
    'pause',
    'stop',
    'next',
    'prev',
    'seek',
    'current_elapsed',
    'current_elapsed_s',
    'current_track_number',
    'shuffle',
    'repeat',
    'crossfade',
    'state_simple',
]);

/**
 * Convert seconds into "[h:]mm:ss"
 *
 * @param time time in seconds
 */
function toFormattedTime(time: number): string {
    const hours = Math.floor(time / 3600);
    const min = Math.floor(time / 60) % 60;
    const sec = time % 60;

    return `${hours ? `${hours}:` : ''}${min < 10 ? `0${min}` : min}:${sec < 10 ? `0${sec}` : sec}`;
}

/**
 * Find the ID of an enum (room) by its name
 *
 * @param enums rows of the enum object view
 * @param name name of the room, reported by sonos
 */
function enumName2Id(enums: EnumRow[], name: string): string {
    name = name.toLowerCase();

    for (let e = 0; e < enums.length; e++) {
        const common = enums[e]?.value?.common;

        if (common?.name) {
            if (typeof common.name === 'object') {
                for (const lang in common.name) {
                    if (common.name[lang]?.toLowerCase() === name) {
                        return enums[e].id;
                    }
                }
            } else if (common.name.toLowerCase() === name) {
                return enums[e].id;
            }
        }

        // very old enums have the name directly in the object
        const legacyName = enums[e]?.value?.name;

        if (legacyName) {
            if (typeof legacyName === 'object') {
                for (const lang in legacyName) {
                    if (legacyName[lang]?.toLowerCase() === name) {
                        return enums[e].id;
                    }
                }
            } else if (legacyName.toLowerCase() === name) {
                return enums[e].id;
            }
        }
    }

    return '';
}

/**
 * Convert the sonos playback state into flags
 *
 * @param playbackState playback state, reported by sonos
 */
function getPlaybackState(playbackState: string): PlaybackState {
    return {
        playing: playbackState === 'PLAYING',
        paused: playbackState === 'PAUSED_PLAYBACK',
        transitioning: playbackState === 'TRANSITIONING',
        stopped: playbackState === 'STOPPED',
    };
}

class Sonos extends utils.Adapter {
    /** IDs of all "alive" states, that must be set to false by unload */
    private readonly aliveIds: string[] = [];
    /** True after playlists were loaded at least once */
    private playlistsLoaded = false;
    /** All known devices with the IP address (dots replaced by underscores) as key */
    private channels: Record<string, ChannelInfo> = {};
    private backend: SonosBackend | null = null;
    private lastCover: Record<string, string | null> = {};
    private lastTvFormat: Record<string, string> = {};
    private lastTvFormatFetch: Record<string, number> = {};
    /** Last value written to `current_artist` while on the TV input, keyed by channel */
    private lastTvFormatWritten: Record<string, string> = {};
    private readonly lastHistoryKey: Record<string, string> = {};
    private cacheDir = '';
    private currentFileNum = 0;
    private readonly queues: Record<string, SonosQueueEntry[]> = {};
    /** Running announcement per device uuid. It used to be attached to the player object itself. */
    private readonly tts: Record<string, TTS> = {};

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'sonos',
            error: (err: any): boolean => {
                // Identify unhandled errors originating from callbacks in scripts
                // These are not caught by wrapping the execution code in try-catch
                if (err) {
                    const errStr = err.toString();
                    if (
                        errStr.includes('EHOSTUNREACH') ||
                        errStr.includes('ECONNRESET') ||
                        errStr.includes('EAI_AGAIN')
                    ) {
                        return true;
                    }
                }
                return false;
            },
        });

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    private async onReady(): Promise<void> {
        try {
            await this.clearLegacyBinaryStates();
        } catch (e: any) {
            this.log.warn(`Could not clear legacy binary states: ${e.message}`);
        }

        // the "root" device object is created by js-controller from "instanceObjects" in io-package.json
        await this.main();
    }

    private onUnload(callback: () => void): void {
        try {
            this.aliveIds.forEach(id => this.setState(id, false, true));

            Object.keys(this.channels).forEach(ip => {
                if (this.channels[ip]?.elapsedTimer) {
                    clearInterval(this.channels[ip].elapsedTimer);
                    this.channels[ip].elapsedTimer = null;
                }
                if (this.channels[ip]?.tvFormatTimer) {
                    clearInterval(this.channels[ip].tvFormatTimer);
                    this.channels[ip].tvFormatTimer = null;
                }

                if (this.channels[ip]?.timerVolume) {
                    clearTimeout(this.channels[ip].timerVolume);
                    this.channels[ip].timerVolume = null;
                }
            });

            this.log.info('terminating');

            if (this.backend) {
                Object.keys(this.tts).forEach(uuid => {
                    this.tts[uuid].destroy();
                    delete this.tts[uuid];
                });

                this.backend.dispose();
                this.backend = null;
            }

            callback();
        } catch {
            callback();
        }
    }

    // id = sonos.0.192_168_1_55.state
    private onStateChange(_id: string, state: ioBroker.State | null | undefined): void {
        if (!state || state.ack) {
            return;
        }

        this.log.info(`try to control id ${_id} with ${JSON.stringify(state)}`);

        // Try to find the object
        const id = this.idToDCS(_id);

        if (!id?.channel || !this.channels[id.channel]) {
            return;
        }

        let value: any = state.val;

        if (value === 'false') {
            value = false;
        }
        if (value === 'true') {
            value = true;
        }
        if (parseInt(value) === value) {
            value = parseInt(value);
        }

        let player = this.channels[id.channel].player;

        if (!player) {
            player = this.backend?.getDeviceByUuid(this.channels[id.channel].uuid) || null;
            this.channels[id.channel].player = player;
        }

        if (!player) {
            this.log.warn(`SONOS "${id.channel}"/"${this.channels[id.channel].uuid}" not found`);
            this.backend?.devices.forEach(p => this.log.debug(`UUID: ${p.uuid} in ${p.roomName} / ${p.baseUrl}`));
            return;
        }

        // Only grouped members send transport to the master. A standalone room
        // (or the group coordinator itself) always controls its own playback.
        const media = player.coordinator;
        const mediaIp = media.channel || id.channel;
        const onTv = isTvStreamUri(media.transportUri) || isTvStreamUri(player.transportUri);

        if (onTv && TV_NO_TRANSPORT.has(id.state)) {
            this.log.warn(`Ignored "${id.state}" on ${id.channel}: the TV input has no transport control`);
            return;
        }
        if (onTv && id.state === 'state') {
            const action = String(value || '').toLowerCase();
            if (['play', 'pause', 'stop', 'next', 'previous'].includes(action)) {
                this.log.warn(`Ignored state="${action}" on ${id.channel}: the TV input has no transport control`);
                return;
            }
        }

        let promise: Promise<unknown> | undefined;

        if (id.state === 'state_simple') {
            promise = value ? media.play() : media.pause();
        } else if (id.state === 'current_track_number') {
            promise = media.seekTrack(value);
        } else if (id.state === 'shuffle') {
            promise = media.setShuffle(!!value);
        } else if (id.state === 'crossfade') {
            promise = media.setCrossfade(!!value);
        } else if (id.state === 'repeat') {
            if (value === 0 || value === '0') {
                promise = media.setRepeat('none');
            } else if (value === 1 || value === '1') {
                promise = media.setRepeat('all');
            } else if (value === 2 || value === '2') {
                promise = media.setRepeat('one');
            } else {
                promise = media.setRepeat(value);
            }
        } else if (id.state === 'play') {
            if (value) {
                promise = media.play();
            }
        } else if (id.state === 'stop') {
            if (value) {
                promise = media.pause();
            }
        } else if (id.state === 'pause') {
            if (value) {
                promise = media.pause();
            }
        } else if (id.state === 'next') {
            if (value) {
                promise = media.next();
            }
        } else if (id.state === 'prev') {
            if (value) {
                promise = media.previous();
            }
        } else if (id.state === 'seek') {
            let percent = parseFloat(value);
            if (percent < 0) {
                percent = 0;
            }
            if (percent > 100) {
                percent = 100;
            }
            const duration = this.channels[mediaIp]?.duration || this.channels[id.channel].duration;
            promise = media.seekTime(Math.round((duration * percent) / 100));
        } else if (id.state === 'current_elapsed') {
            promise = media.seekTime(parseInt(value, 10));
        } else if (id.state === 'current_elapsed_s') {
            const parts = value.toString().split(':');
            let seconds;
            if (parts.length === 3) {
                seconds = parseInt(parts[0]) * 3600;
                seconds += parseInt(parts[1]) * 60;
                seconds = parseInt(parts[2]);
            } else if (parts.length === 2) {
                seconds = parseInt(parts[0]) * 60;
                seconds += parseInt(parts[1]);
            } else if (parts.length === 1) {
                seconds = parseInt(parts[0]);
            } else {
                this.log.error(`Invalid elapsed time: ${value}`);
                return;
            }
            promise = media.seekTime(seconds);
        } else if (id.state === 'muted') {
            promise = player.setMute(!!value);
        } else if (id.state === 'volume') {
            promise = player.setVolume(value);
        } else if (id.state === 'treble') {
            promise = player.setTreble(value);
        } else if (id.state === 'bass') {
            promise = player.setBass(value);
        } else if (id.state === 'night_mode') {
            promise = player.setNightMode(!!value);
        } else if (id.state === 'speech_enhancement') {
            promise = player.setSpeechEnhancement(!!value);
        } else if (id.state === 'state') {
            // stop, play, pause, next, previous, mute, unmute
            if (value && typeof value === 'string') {
                switch (value.toLowerCase()) {
                    case 'stop':
                        promise = media.pause();
                        break;
                    case 'play':
                        promise = media.play();
                        break;
                    case 'pause':
                        promise = media.pause();
                        break;
                    case 'next':
                        promise = media.next();
                        break;
                    case 'previous':
                        promise = media.previous();
                        break;
                    case 'mute':
                        promise = player.setMute(true);
                        break;
                    case 'unmute':
                        promise = player.setMute(false);
                        break;
                    default:
                        this.log.warn(`Unknown state: ${value}`);
                        break;
                }
            } else {
                this.log.warn(`Invalid state: ${value}`);
            }
        } else if (id.state === 'favorites_set') {
            const favorite = (value || '').toString().trim();

            if (!favorite) {
                this.log.warn('favorites_set called without valid favorite name - ignored');
            } else {
                promise = media
                    .playFavorite(favorite)
                    .then(async () => {
                        await this.setState(
                            { device: 'root', channel: mediaIp, state: 'current_album' },
                            { val: favorite, ack: true },
                        );
                        await this.setState(
                            { device: 'root', channel: mediaIp, state: 'current_artist' },
                            { val: favorite, ack: true },
                        );
                    })
                    .catch(error => this.log.error(`Cannot replaceWithFavorite: ${error}`));
            }
        } else if (id.state === 'playlist_set') {
            const playlist = (value || '').toString().trim();

            if (!playlist) {
                this.log.warn('playlist_set called without valid playlist name - ignored');
            } else {
                promise = media
                    .playPlaylist(playlist)
                    .then(async () => {
                        await this.setState(
                            { device: 'root', channel: mediaIp, state: 'current_album' },
                            { val: playlist, ack: true },
                        );
                        await this.setState(
                            { device: 'root', channel: mediaIp, state: 'current_artist' },
                            { val: playlist, ack: true },
                        );
                    })
                    .catch(error => this.log.error(`Cannot replaceWithPlaylist: ${error}`));
            }
        } else if (id.state === 'tts') {
            this.log.debug(`Play TTS file ${value} on ${id.channel}`);
            void this.text2speech(value, id.channel);
        } else if (id.state === 'add_to_group') {
            promise = this.addToGroup(value, media);
        } else if (id.state === 'remove_from_group') {
            promise = this.removeFromGroup(value, media);
        } else if (id.state === 'coordinator') {
            if (value === id.channel) {
                promise = player.leaveGroup();
            } else {
                const coordinator = this.getPlayerByName(value);
                promise = coordinator
                    ? player.setTransportUri(`x-rincon:${coordinator.uuid}`)
                    : Promise.reject(new Error(`Player "${value}" not found`));
            }
        } else if (id.state === 'group_volume') {
            try {
                promise = media.setGroupVolume(value);
            } catch (err) {
                this.log.warn(`Cannot set group volume: ${err}`);
            }
        } else if (id.state === 'group_muted') {
            promise = media.setGroupMute(!!value);
        } else if (id.state === 'play_uri') {
            const uri = String(value || '').trim();
            if (uri && !isGroupingUri(uri)) {
                promise = this.startAvTransport(media, uri);
            }
        } else if (id.state === 'media_browse') {
            promise = this.handleMediaBrowse(media, mediaIp, String(value || ''), player);
        } else if (id.state === 'media_play') {
            promise = this.handleMediaPlay(media, String(value || ''), player);
        } else {
            this.log.warn(`try to control unknown id ${JSON.stringify(id)}`);
        }

        promise
            ?.then(() => this.log.debug(`command done: ${id.state} on ${id.channel}`))
            .catch(e => this.log.error(`Cannot execute command ${id.state} on ${id.channel}: ${e}`));
    }

    // New message arrived. obj is array with current messages
    private onMessage(obj: ioBroker.Message): void {
        if (!obj) {
            return;
        }

        let wait = false;

        switch (obj.command) {
            case 'send':
                if (obj.message) {
                    void this.text2speech(obj.message as string);
                }
                break;

            case 'browse':
                if (obj.callback) {
                    wait = true;
                    this.browseDevices(obj).catch(e => this.log.error(`Cannot browse: ${e}`));
                }
                break;

            case 'sonos:getRooms':
                if (obj.callback) {
                    // Used by the ioBroker.devices widgets to fill their room picker. The shape
                    // `{ value, label }` is what the json-config `selectSendTo` control expects.
                    // `value` is the channel name (the IP with underscores), because every state
                    // of a player lives under `sonos.<instance>.root.<value>`.
                    this.sendTo(obj.from, obj.command, this.getRoomList(), obj.callback);
                    wait = true;
                }
                break;

            default:
                this.log.warn(`Unknown command: ${obj.command}`);
                break;
        }

        if (!wait && obj.callback) {
            this.sendTo(obj.from, obj.command, obj.message, obj.callback);
        }
    }

    /**
     * The configured players as `{ value, label }` pairs.
     *
     * `value` is the channel name - the IP address with the dots replaced by underscores, which
     * is how the adapter names the channels under `root`. `label` is the configured name, falling
     * back to the IP address, exactly like the `common.name` of the channel object.
     */
    private getRoomList(): { value: string; label: string }[] {
        return (this.config.devices || [])
            .filter(device => device.ip)
            .map(device => ({
                value: device.ip.replace(/[.\s]+/g, '_'),
                label: device.name?.trim() || device.ip,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }

    /** Merge the devices, found by the discovery, into the configured devices and answer the message */
    private async browseDevices(obj: ioBroker.Message): Promise<void> {
        const list = this.browse();

        // get all rooms
        const rooms = await this.getObjectViewAsync('system', 'enum', {
            startkey: 'enum.rooms.',
            endkey: 'enum.rooms.香',
        });

        // merge data together
        let message: { devices: ioBroker.SonosDeviceConfig[] } = { devices: [] };

        if (obj.message) {
            if (typeof obj.message === 'object') {
                message = obj.message as { devices: ioBroker.SonosDeviceConfig[] };
            } else {
                try {
                    message = JSON.parse(obj.message as string);
                } catch {
                    // ignore
                    message = { devices: [] };
                }
            }
        }

        const devices = message.devices || [];

        // merge devices
        list.forEach(item => {
            if (item.ip && !devices.find(it => it.ip === item.ip)) {
                devices.push({
                    name: item.roomName,
                    room: enumName2Id(rooms.rows, item.roomName),
                    ip: item.ip,
                });
            }
        });

        this.sendTo(obj.from, obj.command, { native: { devices } }, obj.callback);
    }

    /** Get all devices, that are currently known by the discovery */
    private browse(): FoundDevice[] {
        const result: FoundDevice[] = [];

        this.backend?.devices.forEach(player =>
            result.push({
                roomName: player.roomName,
                ip: player.ip,
            }),
        );

        return result;
    }

    /** Clear legacy binary states, as we migrated to files */
    private async clearLegacyBinaryStates(): Promise<void> {
        const coverStates = await this.getStatesAsync('*.cover_png');
        const ttsStates = await this.getStatesAsync('TTS.tts*');

        for (const id of [...Object.keys(coverStates), ...Object.keys(ttsStates)]) {
            await this.delObjectAsync(id);
        }
    }

    private async createSonosChannel(name: string | undefined, ip: string, room?: string): Promise<{ id: string }> {
        const states = getChannelStates();
        const id = ip.replace(/[.\s]+/g, '_');

        const obj = await this.createChannelAsync(
            'root',
            id,
            {
                role: 'media.music',
                name: name || ip,
            },
            {
                ip,
            },
        );

        if (room) {
            await this.addChannelToEnumAsync('room', room, 'root', id);
        }

        for (const state of Object.keys(states)) {
            await this.createStateAsync('root', id, state, states[state]);
        }

        return obj;
    }

    /**
     * Create the states of a channel, that do not exist: e.g. if they were deleted manually
     * or if they were added in a newer version of the adapter
     *
     * @param id ID of the channel (IP address with underscores)
     */
    private async checkChannelStates(id: string): Promise<void> {
        let existingStates: ioBroker.StateObject[];

        try {
            existingStates = await this.getStatesOfAsync('root', id);
        } catch (err: any) {
            this.log.error(`Cannot read states of root.${id}: ${err.message}`);
            return;
        }

        const prefix = `${this.namespace}.root.${id}.`;
        const existingIds = (existingStates || []).map(obj => obj._id.substring(prefix.length));
        const states = getChannelStates();
        const missingIds = Object.keys(states).filter(state => !existingIds.includes(state));

        if (missingIds.length) {
            this.log.info(`Create missing states of root.${id}: ${missingIds.join(', ')}`);

            for (const state of missingIds) {
                await this.createStateAsync('root', id, state, states[state]);
            }
        }
    }

    private async syncConfig(): Promise<void> {
        this.channels = {};

        const devices = await this.getDevicesAsync();

        this.log.debug(`Initialize known devices: ${JSON.stringify(devices)}`);

        if (!devices?.length) {
            for (const device of this.config.devices || []) {
                if (!device.ip) {
                    continue;
                }
                const obj = await this.createSonosChannel(device.name, device.ip, device.room);
                const _obj = await this.getObjectAsync(obj.id);

                if (_obj) {
                    this.channels[(_obj.native.ip as string).replace(/[.\s]+/g, '_')] = {
                        uuid: '',
                        player: null,
                        duration: 0,
                        elapsed: 0,
                        obj: _obj,
                    };
                }
            }
            return;
        }

        // Go through all devices
        for (const device of devices) {
            const _channels = await this.getChannelsOfAsync(device.common.name as string);
            const configToDelete: string[] = [];
            const configToAdd: string[] = (this.config.devices || []).map(item => item.ip);

            if (_channels) {
                this.log.debug(`Channels of ${device.common.name as string}: ${JSON.stringify(_channels)}`);

                for (const channel of _channels) {
                    this.log.debug(`Process channel: ${channel._id}`);
                    const ip: string = channel.native.ip;
                    const id = ip.replace(/[.\s]+/g, '_');
                    const pos = configToAdd.indexOf(ip);

                    if (pos === -1) {
                        configToDelete.push(ip);
                        continue;
                    }

                    // the channel exists, but some of its states could be missing
                    await this.checkChannelStates(id);
                    configToAdd.splice(pos, 1);

                    // Check name and room
                    for (const configDevice of this.config.devices || []) {
                        if (configDevice.ip !== ip) {
                            continue;
                        }

                        if (channel.common.name !== (configDevice.name || configDevice.ip)) {
                            await this.extendObjectAsync(channel._id, {
                                common: {
                                    name: configDevice.name || configDevice.ip,
                                },
                                type: 'channel',
                            });
                        }

                        if (configDevice.room) {
                            // BF 2021.12.20: there is an error in js-controller 3.3
                            this.addChannelToEnum('room', configDevice.room, 'root', id);
                            // When js-controller 4.x will be common, replace it with
                            // await this.addChannelToEnumAsync('room', configDevice.room, 'root', id);
                        } else {
                            try {
                                await this.deleteChannelFromEnumAsync('room', 'root', id);
                            } catch (err: any) {
                                this.log.error(`Cannot delete channel from enum: ${err.message}`);
                            }
                        }
                    }

                    this.channels[id] = {
                        uuid: '',
                        player: null,
                        duration: 0,
                        elapsed: 0,
                        obj: channel,
                    };

                    await this.setState(`root.${id}.alive`, false, true);
                    this.aliveIds.push(`root.${id}.alive`);
                }
            }

            for (const configDevice of this.config.devices || []) {
                if (configDevice.ip && configToAdd.includes(configDevice.ip)) {
                    const obj = await this.createSonosChannel(configDevice.name, configDevice.ip, configDevice.room);
                    const _obj = await this.getObjectAsync(obj.id);

                    if (_obj) {
                        const sId = (_obj.native.ip as string).replace(/[.\s]+/g, '_');
                        this.aliveIds.push(`root.${sId}.alive`);

                        this.channels[sId] = {
                            uuid: '',
                            player: null,
                            duration: 0,
                            elapsed: 0,
                            obj: _obj,
                        };
                    }
                }
            }

            for (const ip of configToDelete) {
                if (ip) {
                    const _id = ip.replace(/[.\s]+/g, '_');
                    await this.deleteChannelFromEnumAsync('room', 'root', _id);
                    await this.deleteChannelAsync('root', _id);
                }
            }
        }
    }

    private async text2speech(fileName: string, sonosIp?: string): Promise<void> {
        // Extract volume
        let volume: string | null = null;

        fileName = String(fileName ?? '');

        const pos = fileName.indexOf(';');
        if (pos !== -1) {
            volume = fileName.substring(0, pos);
            fileName = fileName.substring(pos + 1);
        }

        fileName = fileName.trim();

        if (sonosIp) {
            sonosIp = sonosIp.replace(/[.\s]+/g, '_');
        }

        if (!fileName) {
            // an empty value stops the running announcement
            this.log.debug('Stop TTS');
            this.stopTTS(sonosIp);
            return;
        }

        // play http/https urls directly on sonos device
        if (fileName.match(/^https?:\/\//)) {
            this.playOnAllPlayers(fileName, sonosIp, volume);
            return;
        }

        if (!this.config.webServer) {
            this.log.warn('Web server must be enabled to play local TTS files');
            return;
        }

        const parts = fileName.split('.');
        const dest = `tts${this.currentFileNum++}.${parts.pop()}`;

        if (this.currentFileNum > 10) {
            this.currentFileNum = 0;
        }

        const id = `/TTS/${this.namespace}/${dest}`;

        // Upload this file to objects DB
        try {
            const data = fs.readFileSync(fileName);

            await this.writeFileAsync(this.name, id, data);
            const obj = await this.getForeignObjectAsync(this.config.webServer);

            if (obj?.native && this.backend) {
                const url = `http${obj.native.secure ? 's' : ''}://${this.backend.localEndpoint}:${
                    obj.native.port as number
                }/files/${this.name}${id}`;

                this.playOnAllPlayers(url, sonosIp, volume);
            }
        } catch (e: any) {
            this.log.error(`Cannot play ${fileName}: ${e.message || e}`);
        }
    }

    /**
     * Execute a callback for one specific player or for all players
     *
     * @param sonosIp IP address (with underscores) of one player or undefined for all players
     * @param callback function, that will be called for every matching player
     */
    private forEachPlayer(sonosIp: string | undefined, callback: (player: SonosDevice) => void): void {
        if (!this.backend) {
            return;
        }

        for (const player of this.backend.devices) {
            if (sonosIp && player.channel !== sonosIp) {
                continue;
            }

            callback(player);
        }
    }

    /**
     * Play an URI on all players or on one specific player
     *
     * @param uri URI of the file to play
     * @param sonosIp IP address (with underscores) of one player or undefined for all players
     * @param volume volume to play with
     */
    private playOnAllPlayers(uri: string, sonosIp: string | undefined, volume: string | null): void {
        this.forEachPlayer(sonosIp, player => setTimeout(() => this.playOnSonos(uri, player.uuid, volume), 100));
    }

    /**
     * Stop the running announcement on all players or on one specific player
     *
     * @param sonosIp IP address (with underscores) of one player or undefined for all players
     */
    private stopTTS(sonosIp: string | undefined): void {
        this.forEachPlayer(sonosIp, player => this.tts[player.uuid]?.immediatelyStopTTS());
    }

    private playOnSonos(uri: string, sonosUuid: string, volume: number | string | null): void {
        const player = this.backend?.getDeviceByUuid(sonosUuid);

        if (!player) {
            return;
        }

        this.tts[player.uuid] ||= new TTS(this, player);
        this.tts[player.uuid].add(uri, volume);
    }

    //////////////////
    // Group management

    private getPlayerByName(name: string): SonosDevice | undefined {
        return this.backend?.devices.find(
            player =>
                player.roomName === name || player.channel === name || player.channel === name || player.uuid === name,
        );
    }

    private addToGroup(playerNameToAdd: string, coordinator: SonosDevice | string): Promise<unknown> {
        const coordinatorPlayer = typeof coordinator === 'string' ? this.getPlayerByName(coordinator) : coordinator;
        const playerToAdd = this.getPlayerByName(playerNameToAdd);

        if (!coordinatorPlayer || !playerToAdd) {
            return Promise.reject(new Error(`Cannot add "${playerNameToAdd}" to group: player not found`));
        }

        return playerToAdd.setTransportUri(`x-rincon:${coordinatorPlayer.uuid}`);
    }

    private removeFromGroup(leavingName: string, coordinator: SonosDevice | string): Promise<unknown> {
        const coordinatorPlayer = typeof coordinator === 'string' ? this.getPlayerByName(coordinator) : coordinator;
        const leavingPlayer = this.getPlayerByName(leavingName);

        if (!coordinatorPlayer || !leavingPlayer) {
            return Promise.reject(new Error(`Cannot remove "${leavingName}" from group: player not found`));
        }

        if (leavingPlayer.coordinator === coordinatorPlayer) {
            return leavingPlayer.leaveGroup();
        }

        if (coordinatorPlayer.coordinator === leavingPlayer) {
            return coordinatorPlayer.leaveGroup();
        }

        return Promise.resolve();
    }

    // State of sonos device was changed
    private async takeSonosState(ip: string, sonosState: SonosDeviceState): Promise<void> {
        await this.setState({ device: 'root', channel: ip, state: 'alive' }, { val: true, ack: true });

        const player = this.backend?.getDeviceByUuid(this.channels[ip].uuid);

        if (!player) {
            this.log.debug(`Cannot find player for ${ip}`);
            return;
        }

        const ps = getPlaybackState(sonosState.playbackState);
        const playMode = sonosState.playMode;

        this.log.debug(`>  playbackState: ${sonosState.playbackState} - ${sonosState.currentTrack?.title || ''}`);

        const stableState = !ps.transitioning;

        // If some stable state
        if (stableState) {
            await this.setState({ device: 'root', channel: ip, state: 'state_simple' }, { val: ps.playing, ack: true });
            await this.setState(
                { device: 'root', channel: ip, state: 'state' },
                { val: ps.paused ? 'pause' : ps.playing ? 'play' : 'stop', ack: true },
            );

            // if duration is 0 (type is radio):
            // - no changes expected and a state update is not necessary!
            // - division by 0
            // A slave gets its elapsed time from the coordinator's tick, so only the
            // coordinator (or a standalone player) needs a timer.
            if (ps.playing && this.channels[ip].duration > 0 && !this.isGroupSlave(ip)) {
                if (!this.channels[ip].elapsedTimer) {
                    this.channels[ip].elapsedTimer = setInterval(
                        () => this.updateElapsed(ip),
                        this.config.elapsedInterval || 5000,
                    );
                }
            } else {
                this.stopElapsedTimer(ip);
            }
        }

        // [hraab]
        // type: radio|track|line_in
        // when radio:
        //   radioShowMetaData (current show, contains an id separated by comma)
        //   streamInfo (kind of currently played title and artist info)
        //   title (== station)
        //
        // Still work to do:
        // - Tracks w/o Album name keeps album name from previous track or some random album.
        //   Don't know if this is already wrong from SONOS API.

        const meta = typeof player.transportUriMetadata === 'string' ? player.transportUriMetadata : '';
        let playing = this.playbackDisplay(sonosState, meta);
        if (isTvStreamUri(sonosState.currentTrack.uri)) {
            const format = await this.resolveTvFormat(player, sonosState.currentTrack, meta);
            playing = { ...playing, artist: format };
            this.startTvFormatWatch(ip);
        } else {
            this.stopTvFormatWatch(ip);
            delete this.lastTvFormat[player.uuid];
            delete this.lastTvFormatFetch[player.uuid];
            delete this.lastTvFormatWritten[ip];
        }

        await this.setState({ device: 'root', channel: ip, state: 'current_type' }, { val: playing.type, ack: true });
        await this.setState(
            { device: 'root', channel: ip, state: 'current_station' },
            { val: playing.station, ack: true },
        );
        await this.setState({ device: 'root', channel: ip, state: 'current_title' }, { val: playing.title, ack: true });
        await this.setState({ device: 'root', channel: ip, state: 'current_album' }, { val: playing.album, ack: true });
        await this.setState(
            { device: 'root', channel: ip, state: 'current_artist' },
            { val: playing.artist, ack: true },
        );

        // elapsed time
        await this.setState(
            { device: 'root', channel: ip, state: 'current_duration' },
            { val: sonosState.currentTrack.duration, ack: true },
        );
        await this.setState(
            { device: 'root', channel: ip, state: 'current_duration_s' },
            { val: toFormattedTime(sonosState.currentTrack.duration), ack: true },
        );

        // Track number
        await this.setState(
            { device: 'root', channel: ip, state: 'current_track_number' },
            { val: sonosState.trackNo, ack: true },
        );

        // Update html-queue: highlight current track
        if (player.channel) {
            await this.updateHtmlQueue(player.channel, sonosState.trackNo);
        }

        const tvCover = isTvStreamUri(sonosState.currentTrack.uri);
        const coverKey = tvCover ? 'tv' : sonosState.currentTrack.albumArtUri || '';
        if (this.lastCover[ip] !== coverKey) {
            if (tvCover) {
                await this.syncCoverFileToStorage(TV_IMAGE, ip);
            } else {
                await this.updateCover(ip, sonosState.currentTrack.albumArtUri);
            }
            this.lastCover[ip] = coverKey || null;
        }

        this.channels[ip].elapsed = sonosState.elapsedTime;
        this.channels[ip].duration = sonosState.currentTrack.duration;

        // only if duration !== 0, see above
        if (this.channels[ip].duration > 0) {
            await this.setState(
                { device: 'root', channel: ip, state: 'current_elapsed' },
                { val: sonosState.elapsedTime, ack: true },
            );
            await this.setState(
                { device: 'root', channel: ip, state: 'seek' },
                {
                    val: Math.round((this.channels[ip].elapsed / this.channels[ip].duration) * 1000) / 10,
                    ack: true,
                },
            );
            await this.setState(
                { device: 'root', channel: ip, state: 'current_elapsed_s' },
                { val: sonosState.elapsedTimeFormatted, ack: true },
            );
        }

        await this.setState({ device: 'root', channel: ip, state: 'volume' }, { val: sonosState.volume, ack: true });
        await this.setState(
            { device: 'root', channel: ip, state: 'night_mode' },
            { val: Boolean(sonosState.equalizer?.nightMode), ack: true },
        );
        await this.setState(
            { device: 'root', channel: ip, state: 'speech_enhancement' },
            { val: Boolean(sonosState.equalizer?.speechEnhancement), ack: true },
        );

        if (sonosState.groupState) {
            await this.setState(
                { device: 'root', channel: ip, state: 'muted' },
                { val: sonosState.groupState.mute, ack: true },
            );
        }

        if (playMode) {
            await this.setState(
                { device: 'root', channel: ip, state: 'shuffle' },
                { val: playMode.shuffle, ack: true },
            );
            await this.setState(
                { device: 'root', channel: ip, state: 'repeat' },
                { val: playMode.repeat === 'all' ? 1 : playMode.repeat === 'one' ? 2 : 0, ack: true },
            );
            await this.setState(
                { device: 'root', channel: ip, state: 'crossfade' },
                { val: playMode.crossfade, ack: true },
            );
        }

        const tts = this.tts[player.uuid];

        if (tts) {
            if (stableState && (ps.paused || ps.stopped)) {
                tts.playingEnded();
            } else if (ps.playing) {
                tts.playingStarted();
            }
        }

        const coverState = await this.getStateAsync(`root.${ip}.current_cover`);
        const coverUrl = String(coverState?.val || '');
        const isCoordinator = !player.coordinator || player.coordinator.uuid === player.uuid;

        if (!tts && (isCoordinator || !isGroupingUri(sonosState.currentTrack.uri))) {
            await this.appendRecentTrack(ip, sonosState, coverUrl);
        }

        if (isCoordinator && !tts) {
            await this.copyPlaybackToGroupMembers(ip, sonosState, ps, coverUrl, playing);
        }
    }

    private playbackDisplay(
        sonosState: SonosDeviceState,
        metadata?: string,
    ): {
        type: number;
        title: string;
        artist: string;
        album: string;
        station: string;
    } {
        const track = sonosState.currentTrack;
        const display = nowPlayingLabels(track, { tv: 'TV', tvHdmi: 'HDMI', lineIn: 'Line-In' }, { metadata });
        const uri = track.uri;
        const tv = isTvStreamUri(uri);
        const lineIn = isLineInStreamUri(uri) || track.type === 'line_in';

        if (track.type === 'radio' && !tv && !lineIn) {
            return {
                type: 1,
                title: display.title,
                artist: display.artist,
                album: display.album,
                station: track.stationName || display.station,
            };
        }
        if (tv || lineIn) {
            return { type: 2, ...display };
        }
        return { type: 0, title: display.title, artist: display.artist, album: display.album, station: '' };
    }

    private startTvFormatWatch(ip: string): void {
        const channel = this.channels[ip];
        if (!channel || channel.tvFormatTimer) {
            return;
        }
        channel.tvFormatTimer = setInterval(() => {
            void this.refreshTvFormat(ip);
        }, TV_FORMAT_POLL_MS);
    }

    private stopTvFormatWatch(ip: string): void {
        const channel = this.channels[ip];
        if (channel?.tvFormatTimer) {
            clearInterval(channel.tvFormatTimer);
            channel.tvFormatTimer = null;
        }
    }

    private async refreshTvFormat(ip: string): Promise<void> {
        const channel = this.channels[ip];
        const player = channel?.player || (channel?.uuid ? this.backend?.getDeviceByUuid(channel.uuid) : undefined);
        const uri = player ? player.transportUri : '';
        if (!player || !isTvStreamUri(uri)) {
            this.stopTvFormatWatch(ip);
            return;
        }

        const meta = typeof player.transportUriMetadata === 'string' ? player.transportUriMetadata : '';
        const format = await this.resolveTvFormat(player, player.state?.currentTrack || {}, meta);
        if (this.lastTvFormatWritten[ip] === format) {
            return;
        }
        this.lastTvFormatWritten[ip] = format;

        await this.setState({ device: 'root', channel: ip, state: 'current_artist' }, { val: format, ack: true });
        for (const memberIp of this.getGroupMemberIps(ip)) {
            if (memberIp === ip || !this.channels[memberIp]) {
                continue;
            }
            await this.setState(
                { device: 'root', channel: memberIp, state: 'current_artist' },
                { val: format, ack: true },
            );
        }
    }

    private async resolveTvFormat(
        player: SonosDevice,
        track: { title?: string; artist?: string },
        metadata: string,
    ): Promise<string> {
        const now = Date.now();
        if (
            (this.lastTvFormatFetch[player.uuid] || 0) + TV_FORMAT_CACHE_MS > now &&
            Object.prototype.hasOwnProperty.call(this.lastTvFormat, player.uuid)
        ) {
            return this.lastTvFormat[player.uuid];
        }
        this.lastTvFormatFetch[player.uuid] = now;

        // What the track and the transport metadata already say, before asking the speaker
        const fromEvent =
            tvAudioFormat(track.title) || tvAudioFormat(streamContentFromDidl(metadata)) || tvAudioFormat(track.artist);

        try {
            const format = (await player.tvAudioFormat()) || fromEvent;
            this.lastTvFormat[player.uuid] = format || '';
            return format || '';
        } catch (err) {
            this.log.debug(`TV audio format: ${err}`);
            return fromEvent || this.lastTvFormat[player.uuid] || '';
        }
    }

    private recentKey(sonosState: SonosDeviceState, metadata?: string): string {
        const playing = this.playbackDisplay(sonosState, metadata);
        return `${playing.title}|${playing.artist}|${playing.album}`;
    }

    private async appendRecentTrack(ip: string, sonosState: SonosDeviceState, coverUrl: string): Promise<void> {
        const playing = this.playbackDisplay(sonosState);
        const title = playing.title.trim();
        if (!title || !this.channels[ip] || isGroupingUri(sonosState.currentTrack.uri)) {
            return;
        }

        const key = this.recentKey(sonosState);
        if (this.lastHistoryKey[ip] === key) {
            return;
        }
        this.lastHistoryKey[ip] = key;

        let list: RecentTrack[] = [];
        const current = await this.getStateAsync(`root.${ip}.recent_tracks`);
        if (Array.isArray(current?.val)) {
            list = current.val as RecentTrack[];
        } else if (current?.val) {
            try {
                const parsed = JSON.parse(String(current.val));
                if (Array.isArray(parsed)) {
                    list = parsed;
                }
            } catch {
                list = [];
            }
        }

        const entry: RecentTrack = {
            title,
            artist: playing.artist,
            album: playing.album,
            station: playing.station,
            cover: coverUrl,
            uri: sonosState.currentTrack.uri || '',
            ts: Date.now(),
        };

        list = [entry, ...list.filter(item => `${item.title}|${item.artist}|${item.album}` !== key)].slice(
            0,
            RECENT_TRACKS_MAX,
        );

        await this.setState(
            { device: 'root', channel: ip, state: 'recent_tracks' },
            { val: JSON.stringify(list), ack: true },
        );
    }

    private async copyPlaybackToGroupMembers(
        coordinatorIp: string,
        sonosState: SonosDeviceState,
        ps: PlaybackState,
        coverUrl: string,
        display?: {
            type: number;
            title: string;
            artist: string;
            album: string;
            station: string;
        },
    ): Promise<void> {
        const membersState = await this.getStateAsync(`root.${coordinatorIp}.membersChannels`);
        const members = String(membersState?.val || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);

        if (members.length < 2) {
            return;
        }

        const queue = await this.getStateAsync(`root.${coordinatorIp}.queue`);
        const queueArray = await this.getStateAsync(`root.${coordinatorIp}.queue_array`);
        const queueHtml = await this.getStateAsync(`root.${coordinatorIp}.queue_html`);
        const playMode = sonosState.playMode;
        const playing = display || this.playbackDisplay(sonosState);

        for (const memberIp of members) {
            if (!memberIp || memberIp === coordinatorIp || !this.channels[memberIp]) {
                continue;
            }

            if (!ps.transitioning) {
                await this.setState(
                    { device: 'root', channel: memberIp, state: 'state_simple' },
                    { val: ps.playing, ack: true },
                );
                await this.setState(
                    { device: 'root', channel: memberIp, state: 'state' },
                    { val: ps.paused ? 'pause' : ps.playing ? 'play' : 'stop', ack: true },
                );
            }

            await this.setState(
                { device: 'root', channel: memberIp, state: 'current_type' },
                { val: playing.type, ack: true },
            );
            await this.setState(
                { device: 'root', channel: memberIp, state: 'current_station' },
                { val: playing.station, ack: true },
            );
            await this.setState(
                { device: 'root', channel: memberIp, state: 'current_title' },
                { val: playing.title, ack: true },
            );
            await this.setState(
                { device: 'root', channel: memberIp, state: 'current_album' },
                { val: playing.album, ack: true },
            );
            await this.setState(
                { device: 'root', channel: memberIp, state: 'current_artist' },
                { val: playing.artist, ack: true },
            );
            await this.setState(
                { device: 'root', channel: memberIp, state: 'current_duration' },
                { val: sonosState.currentTrack.duration, ack: true },
            );
            await this.setState(
                { device: 'root', channel: memberIp, state: 'current_duration_s' },
                { val: toFormattedTime(sonosState.currentTrack.duration), ack: true },
            );
            await this.setState(
                { device: 'root', channel: memberIp, state: 'current_track_number' },
                { val: sonosState.trackNo, ack: true },
            );
            await this.setState(
                { device: 'root', channel: memberIp, state: 'current_cover' },
                { val: coverUrl, ack: true },
            );

            this.channels[memberIp].elapsed = sonosState.elapsedTime;
            this.channels[memberIp].duration = sonosState.currentTrack.duration;

            if (sonosState.currentTrack.duration > 0) {
                await this.setState(
                    { device: 'root', channel: memberIp, state: 'current_elapsed' },
                    { val: sonosState.elapsedTime, ack: true },
                );
                await this.setState(
                    { device: 'root', channel: memberIp, state: 'seek' },
                    {
                        val: Math.round((sonosState.elapsedTime / sonosState.currentTrack.duration) * 1000) / 10,
                        ack: true,
                    },
                );
                await this.setState(
                    { device: 'root', channel: memberIp, state: 'current_elapsed_s' },
                    { val: sonosState.elapsedTimeFormatted, ack: true },
                );
            }

            if (playMode) {
                await this.setState(
                    { device: 'root', channel: memberIp, state: 'shuffle' },
                    { val: playMode.shuffle, ack: true },
                );
                await this.setState(
                    { device: 'root', channel: memberIp, state: 'repeat' },
                    { val: playMode.repeat === 'all' ? 1 : playMode.repeat === 'one' ? 2 : 0, ack: true },
                );
                await this.setState(
                    { device: 'root', channel: memberIp, state: 'crossfade' },
                    { val: playMode.crossfade, ack: true },
                );
            }

            if (queue?.val !== undefined && queue.val !== null) {
                await this.setState(
                    { device: 'root', channel: memberIp, state: 'queue' },
                    { val: queue.val, ack: true },
                );
            }
            if (queueArray?.val !== undefined && queueArray.val !== null) {
                await this.setState(
                    { device: 'root', channel: memberIp, state: 'queue_array' },
                    { val: queueArray.val, ack: true },
                );
            }
            if (queueHtml?.val !== undefined && queueHtml.val !== null) {
                await this.setState(
                    { device: 'root', channel: memberIp, state: 'queue_html' },
                    { val: queueHtml.val, ack: true },
                );
            }

            await this.appendRecentTrack(memberIp, sonosState, coverUrl);
        }
    }

    /** After grouping changes, copy the master's now-playing onto members */
    private async syncGroupPlayback(coordinatorIp: string): Promise<void> {
        const uuid = this.channels[coordinatorIp]?.uuid;
        const player = uuid ? this.backend?.getDeviceByUuid(uuid) : undefined;
        if (!player || this.tts[player.uuid] || !player.state?.currentTrack) {
            return;
        }

        const coverState = await this.getStateAsync(`root.${coordinatorIp}.current_cover`);
        await this.copyPlaybackToGroupMembers(
            coordinatorIp,
            player.state,
            getPlaybackState(player.state.playbackState),
            String(coverState?.val || ''),
        );
    }

    private isGermanUi(): boolean {
        const lang = (this as unknown as { language?: string }).language;
        return String(lang || '')
            .toLowerCase()
            .startsWith('de');
    }

    private musicServiceInfo(name: string): { id?: number; type?: number } | undefined {
        const services = this.backend?.musicServices || {};
        const key = Object.keys(services).find(item => item.toLowerCase() === name.toLowerCase());
        if (key) {
            return services[key];
        }
        if (name.toLowerCase() === 'spotify') {
            return { id: 9, type: 2311 };
        }
        return undefined;
    }

    /** Where the music service tokens are kept; both backends use the same file */
    private getTokenFile(): string {
        let dir = path.join(os.tmpdir(), this.namespace);
        try {
            dir = utils.getAbsoluteInstanceDataDir(this);
        } catch {
            // unit tests / missing controller paths
        }
        return path.join(dir, 'smapi-tokens.json');
    }

    /**
     * Service catalog via SMAPI where the service offers one. Everything else is
     * listed from what the household already knows: saved Sonos favorites,
     * playlists and the recently played tracks of that room.
     */
    private async listServiceLibrary(
        player: SonosDevice,
        serviceName: string,
        german: boolean,
        query = '',
    ): Promise<MediaBrowseResult> {
        const items: MediaBrowseItem[] = [];
        let loginUrl: string | undefined;
        let loginHint: string | undefined;
        const info = this.musicServiceInfo(serviceName);
        const term = query.trim().toLowerCase();
        const blobOf = (item: { title?: string; uri?: string; albumArtUri?: string; metadata?: string }): string =>
            [item.title, item.uri, item.albumArtUri, item.metadata].filter(Boolean).join('\n');
        const matchesQuery = (item: { title?: string; artist?: string; album?: string }): boolean => {
            if (!term) {
                return true;
            }
            return [item.title, item.artist, item.album].some(part =>
                String(part || '')
                    .toLowerCase()
                    .includes(term),
            );
        };

        try {
            const smapi = await this.backend!.music.browse(serviceName, 'root', german);
            items.push(...smapi.items.filter(matchesQuery));
            loginUrl = smapi.loginUrl;
            loginHint = smapi.loginHint;
        } catch (err) {
            this.log.warn(`SMAPI browse ${serviceName}: ${err}`);
        }

        try {
            const favorites = (await this.backend?.getFavorites()) || [];
            for (const fav of favorites) {
                if (!fav.title || !matchesMusicService(blobOf(fav), serviceName, info) || !matchesQuery(fav)) {
                    continue;
                }
                items.push({
                    id: `favorite:${fav.title}`,
                    title: fav.title,
                    uri: fav.uri || '',
                    metadata: fav.metadata || '',
                    artist: german ? 'Favorit' : 'Favorite',
                    album: serviceName,
                    cover: fav.albumArtUri || '',
                    folder: false,
                    favorite: fav.title,
                });
            }
        } catch (err) {
            this.log.warn(`Cannot list ${serviceName} favorites: ${err}`);
        }

        try {
            if (this.backend?.getPlaylists) {
                const playlists = await this.backend.getPlaylists();
                for (const playlist of playlists) {
                    if (
                        !playlist.title ||
                        !matchesMusicService(blobOf(playlist), serviceName, info) ||
                        !matchesQuery(playlist)
                    ) {
                        continue;
                    }
                    items.push({
                        id: `playlist:${playlist.title}`,
                        title: playlist.title,
                        uri: playlist.uri || '',
                        metadata: playlist.metadata || '',
                        artist: 'Playlist',
                        album: serviceName,
                        cover: playlist.albumArtUri || '',
                        folder: false,
                        playlist: playlist.title,
                    });
                }
            }
        } catch (err) {
            this.log.warn(`Cannot list ${serviceName} playlists: ${err}`);
        }

        try {
            const recents = await this.loadRecentTracks(player.channel || player.channel);
            for (const recent of recents) {
                if (!recent.title || isGroupingUri(recent.uri)) {
                    continue;
                }
                if (!matchesMusicService(blobOf(recent), serviceName, info) || !matchesQuery(recent)) {
                    continue;
                }
                items.push({
                    id: `recent:${recent.uri || recent.title}`,
                    title: recent.title,
                    uri: recent.uri || '',
                    metadata: '',
                    artist: recent.artist || (german ? 'Zuletzt' : 'Recent'),
                    album: recent.album || serviceName,
                    cover: recent.cover || '',
                    folder: false,
                });
            }
        } catch (err) {
            this.log.warn(`Cannot list ${serviceName} recent tracks: ${err}`);
        }

        if (term) {
            loginUrl = undefined;
            loginHint = undefined;
        }

        if (!items.length) {
            const emptyTitle = term
                ? german
                    ? `Keine Treffer für „${query.trim()}“ in Favoriten, Playlists oder Zuletzt gehört.`
                    : `No matches for “${query.trim()}” in favorites, playlists or recently played.`
                : german
                  ? `${serviceName} ist als Quelle verfügbar. In der Sonos-App suchen und Favoriten oder Playlists speichern.`
                  : `${serviceName} is available as a source. Search in the Sonos app and save favorites or playlists.`;
            items.push(mediaItem({ id: '', title: emptyTitle }));
        }

        return {
            id: `service:${serviceName}`,
            title: serviceName,
            items,
            serviceName,
            searchable: true,
            loginUrl,
            loginHint,
        };
    }

    private async loadRecentTracks(ip: string | null | undefined): Promise<RecentTrack[]> {
        if (!ip) {
            return [];
        }
        const current = await this.getStateAsync(`root.${ip}.recent_tracks`);
        if (Array.isArray(current?.val)) {
            return current.val as RecentTrack[];
        }
        if (current?.val) {
            try {
                const parsed = JSON.parse(String(current.val));
                if (Array.isArray(parsed)) {
                    return parsed as RecentTrack[];
                }
            } catch {
                return [];
            }
        }
        return [];
    }

    private async handleMediaBrowse(
        player: SonosDevice,
        ip: string,
        objectId: string,
        sourcePlayer?: SonosDevice,
    ): Promise<void> {
        const id = objectId.trim() || 'root';
        const german = this.isGermanUi();
        const labels = {
            radio: 'TuneIn Radio',
            library: german ? 'Mediathek' : 'Music library',
            shares: german ? 'Netzlaufwerke' : 'Network shares',
            lineIn: 'Line-In',
            tv: 'TV',
            tvHdmi: 'HDMI',
        };

        let result: MediaBrowseResult;

        if (id === 'root') {
            // The TV entry belongs to the room the user selected, not to the group
            // coordinator, and only soundbars/amps have that input at all.
            const tvPlayer = sourcePlayer || player;
            let homeTheater = false;
            try {
                homeTheater = await tvPlayer.hasTvInput();
            } catch (err) {
                this.log.debug(`Cannot probe HDMI input of ${tvPlayer.roomName}: ${err}`);
            }
            result = getMediaRoot(this.backend?.musicServices, labels, tvPlayer.uuid, { homeTheater });
            result.title = german ? 'Quellen' : 'Sources';
        } else if (id.startsWith('smapi-search:')) {
            const rest = id.slice('smapi-search:'.length);
            const colon = rest.indexOf(':');
            const name = decodeURIComponent(colon === -1 ? rest : rest.slice(0, colon));
            const term = decodeURIComponent(colon === -1 ? '' : rest.slice(colon + 1));
            try {
                if (await this.backend!.music.hasCatalog(name)) {
                    const smapi = await this.backend!.music.search(name, term, german);
                    result = {
                        id,
                        title: term || name,
                        items: smapi.items,
                        serviceName: name,
                        searchable: true,
                        loginUrl: smapi.loginUrl,
                        loginHint: smapi.loginHint,
                    };
                } else {
                    result = await this.listServiceLibrary(player, name, german, term);
                    result.id = id;
                    result.title = term || name;
                }
            } catch (err) {
                this.log.warn(`SMAPI search ${name}: ${err}`);
                result = { id, title: name, items: [], serviceName: name, searchable: true };
            }
        } else if (id.startsWith('smapi-auth:')) {
            const name = decodeURIComponent(id.slice('smapi-auth:'.length));
            const ok = await this.backend!.music.completeLogin(name);
            if (ok) {
                result = await this.listServiceLibrary(player, name, german);
                result.id = encodeSmapiId(name, 'root');
            } else {
                result = {
                    id,
                    title: name,
                    items: [
                        mediaItem({
                            id: '',
                            title: german
                                ? 'Anmeldung noch nicht fertig. Seite im Browser abschließen und erneut tippen.'
                                : 'Sign-in is not finished yet. Complete it in the browser, then tap again.',
                        }),
                    ],
                    serviceName: name,
                    searchable: true,
                };
            }
        } else if (id.startsWith('smapi:')) {
            const parsed = parseSmapiId(id);
            if (!parsed) {
                result = { id, title: id, items: [] };
            } else {
                try {
                    const smapi = await this.backend!.music.browse(parsed.serviceName, parsed.itemId, german);
                    result = {
                        id,
                        title: parsed.serviceName,
                        items: smapi.items,
                        serviceName: parsed.serviceName,
                        searchable: true,
                        loginUrl: smapi.loginUrl,
                        loginHint: smapi.loginHint,
                    };
                } catch (err) {
                    this.log.warn(`SMAPI browse ${parsed.serviceName}: ${err}`);
                    result = {
                        id,
                        title: parsed.serviceName,
                        items: [],
                        serviceName: parsed.serviceName,
                        searchable: true,
                    };
                }
            }
        } else if (id.startsWith('service:')) {
            const name = id.slice('service:'.length);
            result = await this.listServiceLibrary(player, name, german);
        } else {
            try {
                result = { id, title: id, items: await player.browse(id) };
            } catch (err: any) {
                this.log.warn(`Cannot browse media ${id}: ${err.message || err}`);
                result = { id, title: id, items: [] };
            }
        }

        await this.setState(
            { device: 'root', channel: ip, state: 'media_browse_result' },
            { val: JSON.stringify(result), ack: true },
        );
    }

    /** Radio/SMAPI need Play after SetAVTransportURI. HDMI and line-in start on set and reject Play with HTTP 500. */
    private async startAvTransport(player: SonosDevice, uri: string, metadata = ''): Promise<void> {
        await player.setTransportUri(uri, metadata);
        if (isTvStreamUri(uri) || isLineInStreamUri(uri)) {
            return;
        }
        await player.play();
    }

    /** Switch the soundbar itself to HDMI. Play is not a valid AVTransport action for TV. */
    private async playTvInput(ht: SonosDevice): Promise<void> {
        const uri = tvStreamUri(ht.uuid);
        if (ht.transportUri === uri) {
            this.log.debug(`TV HDMI already selected on ${ht.roomName}`);
            return;
        }
        if (!(await ht.hasTvInput())) {
            this.log.warn(`${ht.roomName} has no HDMI/optical input - TV cannot be selected there`);
            return;
        }
        if (ht.isGroupMember) {
            await ht.leaveGroup();
        }
        await ht.setTransportUri(uri);
    }

    private async handleMediaPlay(player: SonosDevice, raw: string, sourcePlayer?: SonosDevice): Promise<void> {
        let uri = '';
        let metadata = '';
        const text = raw.trim();
        if (!text) {
            return;
        }

        if (text.startsWith('{')) {
            try {
                const parsed = JSON.parse(text) as {
                    uri?: string;
                    metadata?: string;
                    favorite?: string;
                    playlist?: string;
                    tv?: boolean;
                };
                if (parsed.favorite) {
                    await player.playFavorite(parsed.favorite);
                    return;
                }
                if (parsed.playlist) {
                    await player.playPlaylist(parsed.playlist);
                    return;
                }
                if (parsed.tv) {
                    await this.playTvInput(sourcePlayer || player);
                    return;
                }
                uri = String(parsed.uri || '').trim();
                metadata = String(parsed.metadata || '');
            } catch {
                uri = text;
            }
        } else {
            uri = text;
        }

        if (!uri || isGroupingUri(uri)) {
            return;
        }

        if (isTvStreamUri(uri)) {
            await this.playTvInput(sourcePlayer || player);
            return;
        }

        if (isDirectPlayUri(uri)) {
            await this.startAvTransport(player, uri, metadata);
            return;
        }

        await player.clearQueue();
        await player.addToQueue(uri, metadata);
        await player.setTransportUri(`x-rincon-queue:${player.uuid}#0`);
        await player.play();
    }

    /** Players that currently share playback with this coordinator (includes itself) */
    private getGroupMemberIps(coordinatorIp: string): string[] {
        const channel = this.channels[coordinatorIp];
        const player = channel?.player || (channel?.uuid ? this.backend?.getDeviceByUuid(channel.uuid) : undefined);

        if (!player) {
            return [coordinatorIp];
        }

        const ips = player.groupMembers
            .map(member => member.channel)
            .filter((ip): ip is string => Boolean(ip) && Boolean(this.channels[ip!]));

        return ips.length ? ips : [coordinatorIp];
    }

    /** True if the player belongs to a group and is not the coordinator of it */
    private isGroupSlave(ip: string): boolean {
        const channel = this.channels[ip];
        const player = channel?.player || (channel?.uuid ? this.backend?.getDeviceByUuid(channel.uuid) : undefined);
        return Boolean(player && player.isGroupMember);
    }

    private stopElapsedTimer(ip: string): void {
        const channel = this.channels[ip];
        if (channel?.elapsedTimer) {
            clearInterval(channel.elapsedTimer);
            channel.elapsedTimer = null;
        }
    }

    /** Update the elapsed time while playing */
    private updateElapsed(ip: string): void {
        const channel = this.channels[ip];

        if (!channel || channel.duration <= 0) {
            return;
        }

        // Slaves are fed by the coordinator's tick below. Without this every member of
        // a group would run its own timer and write to all members, so the number of
        // state writes per interval would grow with the square of the group size.
        if (this.isGroupSlave(ip)) {
            this.stopElapsedTimer(ip);
            return;
        }

        channel.elapsed += (this.config.elapsedInterval || 5000) / 1000;

        if (channel.elapsed > channel.duration) {
            channel.elapsed = channel.duration;
        }

        const seek = Math.round((channel.elapsed / channel.duration) * 1000) / 10;
        const elapsedS = toFormattedTime(channel.elapsed);

        for (const memberIp of this.getGroupMemberIps(ip)) {
            const member = this.channels[memberIp];
            if (!member) {
                continue;
            }
            member.elapsed = channel.elapsed;
            member.duration = channel.duration;
            void this.setState({ device: 'root', channel: memberIp, state: 'seek' }, { val: seek, ack: true });
            void this.setState(
                { device: 'root', channel: memberIp, state: 'current_elapsed' },
                { val: channel.elapsed, ack: true },
            );
            void this.setState(
                { device: 'root', channel: memberIp, state: 'current_elapsed_s' },
                { val: elapsedS, ack: true },
            );
        }
    }

    /**
     * Read the cover of the current track and store it in the ioBroker storage
     *
     * @param ip IP address (with underscores) of the player
     * @param albumArtUri URI of the cover on the sonos device
     */
    private async updateCover(ip: string, albumArtUri?: string): Promise<void> {
        let filePath = DEFAULT_IMAGE;

        if (albumArtUri) {
            const md5url = crypto.createHash('md5').update(albumArtUri).digest('hex');
            filePath = this.cacheDir + md5url;
        }

        if (fs.existsSync(filePath)) {
            this.log.debug('Cover exists. Try reading from fs');
            await this.syncCoverFileToStorage(filePath, ip);
            return;
        }

        this.log.debug('Cover file does not exist. Fetching via HTTP');

        const player = this.backend?.getDeviceByUuid(this.channels[ip].uuid);
        const hostname = player ? player.ip : null;

        if (!hostname || !albumArtUri) {
            return;
        }

        http.get(
            {
                hostname,
                port: 1400,
                path: albumArtUri,
            },
            res => {
                this.log.debug(`HTTP status code ${res.statusCode}`);

                if (res.statusCode === 200) {
                    const cacheStream = fs.createWriteStream(filePath);
                    res.pipe(cacheStream).on('finish', () => {
                        void this.syncCoverFileToStorage(filePath, ip);
                    });
                } else if (res.statusCode === 404) {
                    // no image exists! link it to the default image.
                    res.resume();
                    void this.syncCoverFileToStorage(DEFAULT_IMAGE, ip);
                } else {
                    res.resume();
                }

                res.on('end', () => this.log.debug('Response "end" event'));
            },
        ).on('error', e => this.log.warn(`Got error: ${e.message}`));
    }

    /**
     * Synchronize the cover file to ioBroker storage
     *
     * @param filePath path to read file from file system
     * @param ip ip of the player
     */
    private async syncCoverFileToStorage(filePath: string, ip: string): Promise<void> {
        let fileData: Buffer | null = null;

        try {
            fileData = fs.readFileSync(filePath);
        } catch (e: any) {
            this.log.warn(`Cannot read file: ${e.message}`);
        }

        // If error or null length file, read standard cover file
        if (!fileData) {
            try {
                fileData = fs.readFileSync(DEFAULT_IMAGE);
            } catch (e: any) {
                this.log.warn(`Cannot read file: ${e.message}`);
            }
        }

        if (fileData) {
            const storagePath = `coverImage/${ip}.png`;
            await this.writeFileAsync(this.name, storagePath, fileData);
            await this.setState(
                { device: 'root', channel: ip, state: 'current_cover' },
                { val: `/${this.name}/${storagePath}`, ack: true },
            );
        }
    }

    private async takeSonosFavorites(ip: string, favorites: SonosMediaEntry[]): Promise<void> {
        let sFavorites = '';
        const aFavorites: string[] = [];
        const _hFavorites: string[] = [];

        _hFavorites.push('<table class="sonosFavoriteTable">');

        favorites.forEach((favorite, index) => {
            const title = favorite.title;

            if (title) {
                sFavorites += (sFavorites ? ', ' : '') + title;
                aFavorites.push(title);
                _hFavorites.push(
                    `<tr class="sonosFavoriteRow" onclick="vis.setValue('${this.namespace}.root.${ip}.favorites_set', '${title}')"><td class="sonosFavoriteNumber">${
                        index + 1
                    }</td><td class="sonosFavoriteCover"><img src="${
                        favorite.albumArtUri || ''
                    }"></td><td class="sonosFavoriteTitle">${title}</td></tr>`,
                );
            }
        });

        _hFavorites.push('</table>');

        await this.setState({ device: 'root', channel: ip, state: 'favorites_list' }, { val: sFavorites, ack: true });
        await this.setState(
            { device: 'root', channel: ip, state: 'favorites_list_array' },
            { val: JSON.stringify(aFavorites), ack: true },
        );
        await this.setState(
            { device: 'root', channel: ip, state: 'favorites_list_html' },
            { val: _hFavorites.join(''), ack: true },
        );
    }

    /** Read the favorites from sonos and write them to all known players */
    private async updateFavorites(): Promise<void> {
        if (!this.backend) {
            return;
        }

        const favorites = await this.backend.getFavorites();

        // Go through all players
        for (const player of this.backend.devices) {
            if (!player) {
                continue;
            }
            const ip = player.channel;

            if (ip && this.channels[ip]) {
                await this.takeSonosFavorites(ip, favorites);
            }
        }
    }

    private async takeSonosPlaylists(ip: string, playlists: SonosMediaEntry[]): Promise<void> {
        const names = playlists.map(item => item.title).filter((title): title is string => Boolean(title));

        await this.setState(
            { device: 'root', channel: ip, state: 'playlist_list' },
            { val: names.join(', '), ack: true },
        );
        await this.setState(
            { device: 'root', channel: ip, state: 'playlist_list_array' },
            { val: JSON.stringify(names), ack: true },
        );
    }

    /** Read Sonos playlists and write them to all known players */
    private async updatePlaylists(): Promise<void> {
        if (!this.backend?.getPlaylists) {
            return;
        }

        const playlists = await this.backend.getPlaylists();

        for (const player of this.backend.devices) {
            if (!player) {
                continue;
            }
            const ip = player.channel;

            if (ip && this.channels[ip]) {
                await this.takeSonosPlaylists(ip, playlists);
            }
        }
    }

    /** Refresh favorites and playlists; errors are logged and do not abort the other list */
    private async updateMediaLists(): Promise<void> {
        try {
            await this.updateFavorites();
        } catch (err) {
            this.log.error(`Cannot getFavorites: ${err}`);
        }
        try {
            await this.updatePlaylists();
            this.playlistsLoaded = true;
        } catch (err) {
            this.log.error(`Cannot getPlaylists: ${err}`);
        }
    }

    private async processSonosEvents(event: string, data: any): Promise<void> {
        if (!this.backend) {
            return;
        }

        if (event === 'topology-change') {
            await this.processTopologyChange(data);
        } else if (event === 'transport-state') {
            const ip = this.getIpOfPlayer(data.uuid);

            if (ip) {
                this.channels[ip].uuid = data.uuid;
                await this.takeSonosState(ip, data.state);
            }
        } else if (event === 'group-volume') {
            const source = this.backend.getDeviceByUuid(data.uuid);
            const masterUuid = (source && source.coordinator)?.uuid;

            for (const player of this.backend.devices) {
                const itemMaster = player.coordinator;
                if (masterUuid && itemMaster.uuid !== masterUuid) {
                    continue;
                }
                if (!masterUuid && player.roomName !== data.roomName) {
                    continue;
                }

                const ip = this.getIpOfPlayer(player.uuid);

                if (ip) {
                    this.channels[ip].uuid = player.uuid;
                    await this.setState(
                        { device: 'root', channel: ip, state: 'group_volume' },
                        { val: data.newVolume, ack: true },
                    );
                    this.log.debug(`group-volume: Volume for ${player.baseUrl}: ${data.newVolume}`);
                }
            }
        } else if (event === 'group-mute') {
            const player = this.backend.getDeviceByUuid(data.uuid);
            const ip = this.getIpOfPlayer(data.uuid);

            if (player && ip) {
                this.channels[ip].uuid = data.uuid;
                await this.setState({ device: 'root', channel: ip, state: 'muted' }, { val: data.newMute, ack: true });
                player.muted = data.newMute;
                this.log.debug(`mute: Mute for ${player.baseUrl}: ${data.newMute}`);
                await this.setState(
                    { device: 'root', channel: ip, state: 'group_muted' },
                    { val: player.groupState.mute, ack: true },
                );
                this.log.debug(`group_muted: groupMuted for ${player.baseUrl}: ${player.groupState.mute}`);
            }
        } else if (event === 'volume') {
            const player = this.backend.getDeviceByUuid(data.uuid);
            const ip = this.getIpOfPlayer(data.uuid);

            if (player && ip) {
                this.channels[ip].uuid = data.uuid;
                await this.setState(
                    { device: 'root', channel: ip, state: 'volume' },
                    { val: data.newVolume, ack: true },
                );
                player.volume = data.newVolume;
                this.log.debug(`volume: Volume for ${player.baseUrl}: ${data.newVolume}`);
            }
        } else if (event === 'treble' || event === 'bass') {
            // node-sonos-discovery is not emitting any events on treble/bass changes yet, so it is not
            // possible to get the externally set values, yet.
        } else if (event === 'mute') {
            const player = this.backend.getDeviceByUuid(data.uuid);
            const ip = this.getIpOfPlayer(data.uuid);

            if (player && ip) {
                this.channels[ip].uuid = data.uuid;
                await this.setState({ device: 'root', channel: ip, state: 'muted' }, { val: data.newMute, ack: true });
                player.muted = data.newMute;
                this.log.debug(`mute: Mute for ${player.baseUrl}: ${data.newMute}`);
            }
        } else if (event === 'favorites') {
            await this.updateMediaLists();
        } else if (event === 'queue') {
            const player = this.backend.getDeviceByUuid(data.uuid);
            const ip = this.getIpOfPlayer(data.uuid);

            if (player && ip) {
                this.channels[ip].uuid = data.uuid;
                await this.takeSonosQueue(ip, player, data.queue);
            }

            if (player) {
                await this.updateMediaLists();
            }
        } else {
            this.log.debug(`${event} ${typeof data === 'object' ? JSON.stringify(data) : data}`);
        }
    }

    private async processTopologyChange(data: SonosTopologyEvent): Promise<void> {
        // a single device announced itself - only mark it alive
        if (!data.groups) {
            const ip = data.uuid ? this.getIpOfPlayer(data.uuid) : null;

            if (ip) {
                this.channels[ip].uuid = data.uuid!;
                await this.setState({ device: 'root', channel: ip, state: 'alive' }, { val: true, ack: true });
            }
            return;
        }

        for (const group of data.groups) {
            const ip = this.getIpOfPlayer(group.uuid);

            if (ip) {
                this.channels[ip].uuid = group.uuid;
                await this.setState({ device: 'root', channel: ip, state: 'alive' }, { val: true, ack: true });
            }

            const members: string[] = [];
            const membersChannels: string[] = [];

            for (const groupMember of group.members) {
                const memberIp = this.getIpOfPlayer(groupMember.uuid);

                if (memberIp) {
                    this.channels[memberIp].uuid = groupMember.uuid;
                    membersChannels.push(memberIp);
                    await this.setState(
                        { device: 'root', channel: memberIp, state: 'coordinator' },
                        { val: ip, ack: true },
                    );
                }

                if (groupMember.roomName) {
                    members.push(groupMember.roomName);
                }
            }

            if (ip && members.length) {
                await this.setState(
                    { device: 'root', channel: ip, state: 'members' },
                    { val: members.join(','), ack: true },
                );
            }

            if (ip && membersChannels.length) {
                await this.setState(
                    { device: 'root', channel: ip, state: 'membersChannels' },
                    { val: membersChannels.join(','), ack: true },
                );
                await this.syncGroupPlayback(ip);
            }
        }

        if (!this.playlistsLoaded && this.backend?.devices?.length) {
            await this.updateMediaLists();
        }
    }

    private async takeSonosQueue(ip: string, player: SonosDevice, queue: SonosQueueEntry[]): Promise<void> {
        const _text: string[] = [];
        const _html: string[] = [];
        // `queue` joins the tracks with a comma, so a UI cannot split it back reliably - a title
        // may contain one. `queue_array` therefore carries the same tracks entry by entry.
        const _array: { artist?: string; title?: string; album?: string; cover?: string }[] = [];

        _html.push('<table class="sonosQueueTable">');

        for (let q = 0; q < queue.length; q++) {
            _text.push(`${queue[q].artist} - ${queue[q].title}`);
            _array.push({
                artist: queue[q].artist,
                title: queue[q].title,
                album: queue[q].album,
                cover: queue[q].albumArtUri ? `${player.baseUrl}${queue[q].albumArtUri}` : undefined,
            });
            _html.push(`
                        <tr class="sonosQueueRow" onclick="vis.setValue('${this.namespace}.root.${
                            player.channel
                        }.current_track_number', ${q + 1})">
                        <td class="sonosQueueTrackNumber">${q + 1}</td>
                        <td class="sonosQueueTrackCover"><img src="${player.baseUrl}${queue[q].albumArtUri}"></td>
                        <td class="sonosQueueTrackArtist">${queue[q].artist}</td>
                        <td class="sonosQueueTrackAlbum">${queue[q].album}</td>
                        <td class="sonosQueueTrackTitle">${queue[q].title}</td>
                        </tr>
                        `);
        }

        _html.push('</table>');

        // Add script for auto-scroll playlist
        _html.push(`
                    <script>
                    let element = document.getElementById("currentTrack");
                    if (element != undefined) element.scrollIntoView({behavior: "auto", block: "start", inline: "nearest"});
                    </script>
                    `);

        const qtext = _text.join(', ');
        const qhtml = _html.join('');

        await this.setState({ device: 'root', channel: ip, state: 'queue' }, { val: qtext, ack: true });
        await this.setState(
            { device: 'root', channel: ip, state: 'queue_array' },
            { val: JSON.stringify(_array), ack: true },
        );
        this.log.debug(`queue for ${player.baseUrl}: ${qtext}`);
        await this.setState({ device: 'root', channel: ip, state: 'queue_html' }, { val: qhtml, ack: true });
        this.log.debug(`queue for ${player.baseUrl}: ${qhtml}`);
    }

    /**
     * Find the IP address of a known player and ensure, that a channel for it exists
     *
     * @param uuid UUID of the player
     * @returns the IP address (with underscores) or null if the player or the channel is unknown
     */
    private getIpOfPlayer(uuid: string): string | null {
        const ip = this.backend?.getDeviceByUuid(uuid)?.channel;

        return ip && this.channels[ip] ? ip : null;
    }

    /**
     * Update queue: highlight current track in html-queue
     *
     * @param playerIp IP address (with underscores) of the player
     * @param trackNumber number of the current track
     */
    private async updateHtmlQueue(playerIp: string, trackNumber: number): Promise<void> {
        // Get current html-queue
        const playerDp = `${this.namespace}.root.${playerIp}`;
        const state = await this.getStateAsync(`${playerDp}.queue_html`);

        if (!state?.val) {
            this.log.debug(`Update html-queue for ${playerIp}: html-queue is empty`);
            return;
        }

        this.log.debug(`Update html-queue for ${playerIp}: current html-queue is ${state.val as string}`);

        // Remove old highlighting
        let queue = (state.val as string).replace(
            'class="sonosQueueRow currentTrack" id="currentTrack"',
            'class="sonosQueueRow"',
        );

        // Get current track number
        this.log.debug(`Update html-queue for ${playerIp}: current track number is ${trackNumber}`);

        // Create RegEx pattern
        const regexPattern = `<tr class="sonosQueueRow" onclick="vis.setValue\\('sonos.[0-9].root.[0-9]{1,3}_[0-9]{1,3}_[0-9]{1,3}_[0-9]{1,3}.current_track_number', ${trackNumber}\\)">`;
        this.log.debug(`Update html-queue for ${playerIp}: RegEx pattern is ${regexPattern}`);

        // Match current track in queue
        const currentTrack = queue.match(new RegExp(regexPattern, 'gm'));

        if (!currentTrack) {
            this.log.debug(`Update html-queue for ${playerIp}: no RegEx match`);
            return;
        }

        this.log.debug(`Update html-queue for ${playerIp}: got match ${currentTrack.toString()}`);

        // Add id and class to current track
        const currentTrackHighlight = currentTrack
            .toString()
            .replace('class="sonosQueueRow"', 'class="sonosQueueRow currentTrack" id="currentTrack"');
        this.log.debug(
            `Update html-queue for ${playerIp}: new html string for current track is ${currentTrackHighlight}`,
        );

        // Replace html for current track in queue
        queue = queue.replace(currentTrack.toString(), currentTrackHighlight);
        this.log.debug(`Update html-queue ${playerIp}: new queue is ${queue}`);

        // set queue to dp
        await this.setState(`${playerDp}.queue_html`, { val: queue, ack: true });
    }

    private async main(): Promise<void> {
        this.config.fadeIn = parseInt(String(this.config.fadeIn), 10) || 0;
        this.config.fadeOut = parseInt(String(this.config.fadeOut), 10) || 0;

        await this.syncConfig();

        this.cacheDir = path.join(utils.getAbsoluteDefaultDataDir(), 'sonosCache') + path.sep;

        // create directory for cached files
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir);
        }

        // Two client libraries are shipped side by side while the new one is being proven out.
        // A tester who hits a problem flips this setting instead of downgrading the adapter.
        const tokenFile = this.getTokenFile();

        if (this.config.backend === 'svrooij') {
            this.log.info('Using the @svrooij/sonos backend (experimental)');
            this.backend = new SvrooijBackend({ tokenFile, log: this.log });
        } else {
            this.backend = new DiscoveryBackend({
                log: this.log,
                cacheDir: this.cacheDir,
                port: this.config.webserverPort,
                tokenFile,
            });
        }

        const events: SonosBackendEvent[] = [
            'topology-change',
            'transport-state',
            'group-volume',
            'group-mute',
            'volume',
            'mute',
            'favorites',
            // 'treble' and 'bass' are deliberately not subscribed: sonos-discovery never emits
            // them. The backend can deliver them, so a later backend can switch them on.
        ];

        events.forEach(event =>
            this.backend?.on(event, data =>
                this.processSonosEvents(event, data).catch(e => this.log.error(`Cannot process ${event}: ${e}`)),
            ),
        );

        // the backend already reads the queue, the adapter only caches it
        this.backend.on('queue', data => {
            this.queues[data.uuid] = data.queue;
            this.processSonosEvents('queue', data).catch(e => this.log.error(`Cannot loadQueue: ${e}`));
        });

        try {
            await this.backend.start();
        } catch (e) {
            this.log.error(`Cannot start the SONOS backend: ${e}`);
        }

        this.subscribeStates('*');
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Sonos(options);
} else {
    // otherwise start the instance directly
    (() => new Sonos())();
}
