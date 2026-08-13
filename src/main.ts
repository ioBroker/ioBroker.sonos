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

import * as utils from '@iobroker/adapter-core';
import SonosDiscovery from 'sonos-discovery';
import type { SonosFavorite, SonosPlayer, SonosPlayerState, SonosQueueItem } from 'sonos-discovery';

import { TTS } from './lib/tts';
import { getChannelStates } from './lib/states';

const DEFAULT_IMAGE = `${__dirname}/../img/no-cover.png`;

/** Information about one sonos device */
interface ChannelInfo {
    uuid: string;
    player: SonosPlayer | null;
    duration: number;
    elapsed: number;
    obj: ioBroker.Object | null;
    elapsedTimer?: NodeJS.Timeout | null;
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
 * Extract the IP address of a player out of its base URL
 *
 * @param player sonos player
 * @param noReplace if true, the dots will not be replaced by underscores
 */
function getIp(player: SonosPlayer, noReplace?: boolean): string | null {
    const m = player.baseUrl.match(/http:\/\/([.\d]+):?/);

    if (m?.[1]) {
        return noReplace ? m[1] : m[1].replace(/[.\s]+/g, '_');
    }

    return null;
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
    /** All known devices with the IP address (dots replaced by underscores) as key */
    private channels: Record<string, ChannelInfo> = {};
    private discovery: SonosDiscovery | null = null;
    private lastCover: string | null = null;
    private cacheDir = '';
    private currentFileNum = 0;
    private readonly queues: Record<string, SonosQueueItem[]> = {};

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

                if (this.channels[ip]?.timerVolume) {
                    clearTimeout(this.channels[ip].timerVolume);
                    this.channels[ip].timerVolume = null;
                }
            });

            this.log.info('terminating');

            if (this.discovery) {
                this.discovery.players?.forEach(player => {
                    if (player.tts) {
                        player.tts.destroy();
                        player.tts = null;
                    }
                });

                this.discovery.dispose();
                this.discovery = null;
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
            player = this.discovery?.getPlayerByUUID(this.channels[id.channel].uuid) || null;
            this.channels[id.channel].player = player;
        }

        if (!player) {
            this.log.warn(`SONOS "${id.channel}"/"${this.channels[id.channel].uuid}" not found`);
            this.discovery?.players.forEach(p => this.log.debug(`UUID: ${p.uuid} in ${p.roomName} / ${p.baseUrl}`));
            return;
        }

        let promise: Promise<unknown> | undefined;

        if (id.state === 'state_simple') {
            promise = value ? player.play() : player.pause();
        } else if (id.state === 'current_track_number') {
            promise = player.trackSeek(value);
        } else if (id.state === 'shuffle') {
            promise = player.shuffle(!!value);
        } else if (id.state === 'crossfade') {
            promise = player.crossfade(!!value);
        } else if (id.state === 'repeat') {
            if (value === 0 || value === '0') {
                promise = player.repeat('none');
            } else if (value === 1 || value === '1') {
                promise = player.repeat('all');
            } else if (value === 2 || value === '2') {
                promise = player.repeat('one');
            } else {
                promise = player.repeat(value);
            }
        } else if (id.state === 'play') {
            if (value) {
                promise = player.play();
            }
        } else if (id.state === 'stop') {
            if (value) {
                promise = player.pause();
            }
        } else if (id.state === 'pause') {
            if (value) {
                promise = player.pause();
            }
        } else if (id.state === 'next') {
            if (value) {
                promise = player.nextTrack();
            }
        } else if (id.state === 'prev') {
            if (value) {
                promise = player.previousTrack();
            }
        } else if (id.state === 'seek') {
            let percent = parseFloat(value);
            if (percent < 0) {
                percent = 0;
            }
            if (percent > 100) {
                percent = 100;
            }
            promise = player.timeSeek(Math.round((this.channels[id.channel].duration * percent) / 100));
        } else if (id.state === 'current_elapsed') {
            promise = player.timeSeek(parseInt(value, 10));
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
            promise = player.timeSeek(seconds);
        } else if (id.state === 'muted') {
            promise = value ? player.mute() : player.unMute();
        } else if (id.state === 'volume') {
            promise = player.setVolume(value);
        } else if (id.state === 'treble') {
            promise = player.setTreble(value);
        } else if (id.state === 'bass') {
            promise = player.setBass(value);
        } else if (id.state === 'state') {
            // stop, play, pause, next, previous, mute, unmute
            if (value && typeof value === 'string') {
                switch (value.toLowerCase()) {
                    case 'stop':
                        promise = player.pause();
                        break;
                    case 'play':
                        promise = player.play();
                        break;
                    case 'pause':
                        promise = player.pause();
                        break;
                    case 'next':
                        promise = player.nextTrack();
                        break;
                    case 'previous':
                        promise = player.previousTrack();
                        break;
                    case 'mute':
                        promise = player.mute();
                        break;
                    case 'unmute':
                        promise = player.unMute();
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
                promise = player
                    .replaceWithFavorite(favorite)
                    .then(() => player.play())
                    .then(async () => {
                        await this.setState(
                            { device: 'root', channel: id.channel, state: 'current_album' },
                            { val: favorite, ack: true },
                        );
                        await this.setState(
                            { device: 'root', channel: id.channel, state: 'current_artist' },
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
                promise = player
                    .replaceWithPlaylist(playlist)
                    .then(() => player.play())
                    .then(async () => {
                        await this.setState(
                            { device: 'root', channel: id.channel, state: 'current_album' },
                            { val: playlist, ack: true },
                        );
                        await this.setState(
                            { device: 'root', channel: id.channel, state: 'current_artist' },
                            { val: playlist, ack: true },
                        );
                    })
                    .catch(error => this.log.error(`Cannot replaceWithPlaylist: ${error}`));
            }
        } else if (id.state === 'tts') {
            this.log.debug(`Play TTS file ${value} on ${id.channel}`);
            void this.text2speech(value, id.channel);
        } else if (id.state === 'add_to_group') {
            promise = this.addToGroup(value, player);
        } else if (id.state === 'remove_from_group') {
            promise = this.removeFromGroup(value, player);
        } else if (id.state === 'coordinator') {
            if (value === id.channel) {
                promise = player.becomeCoordinatorOfStandaloneGroup();
            } else {
                const coordinator = this.getPlayerByName(value);
                promise = coordinator
                    ? player.setAVTransport(`x-rincon:${coordinator.uuid}`)
                    : Promise.reject(new Error(`Player "${value}" not found`));
            }
        } else if (id.state === 'group_volume') {
            try {
                promise = player.setGroupVolume(value);
            } catch (err) {
                this.log.warn(`Cannot set group volume: ${err}`);
            }
        } else if (id.state === 'group_muted') {
            promise = value ? player.muteGroup() : player.unMuteGroup();
        } else {
            this.log.warn(`try to control unknown id ${JSON.stringify(id)}`);
        }

        promise?.then(() => this.log.debug('command done')).catch(e => this.log.error(`Cannot execute command: ${e}`));
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

            default:
                this.log.warn(`Unknown command: ${obj.command}`);
                break;
        }

        if (!wait && obj.callback) {
            this.sendTo(obj.from, obj.command, obj.message, obj.callback);
        }
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

        this.discovery?.players.forEach(player =>
            result.push({
                roomName: player.roomName,
                ip: getIp(player, true),
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

            if (obj?.native && this.discovery) {
                const url = `http${obj.native.secure ? 's' : ''}://${this.discovery.localEndpoint}:${
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
    private forEachPlayer(sonosIp: string | undefined, callback: (player: SonosPlayer) => void): void {
        if (!this.discovery) {
            return;
        }

        for (const player of this.discovery.players) {
            player._address = player._address || getIp(player);

            if (sonosIp && player._address !== sonosIp) {
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
        this.forEachPlayer(sonosIp, player => player.tts?.immediatelyStopTTS());
    }

    private playOnSonos(uri: string, sonosUuid: string, volume: number | string | null): void {
        const player = this.discovery?.getPlayerByUUID(sonosUuid);

        if (!player) {
            return;
        }

        player.tts = player.tts || new TTS(this, player);
        player.tts.add(uri, volume);
    }

    //////////////////
    // Group management

    private getPlayerByName(name: string): SonosPlayer | undefined {
        return this.discovery?.players.find(
            player =>
                player.roomName === name || getIp(player) === name || player._address === name || player.uuid === name,
        );
    }

    private addToGroup(playerNameToAdd: string, coordinator: SonosPlayer | string): Promise<unknown> {
        const coordinatorPlayer = typeof coordinator === 'string' ? this.getPlayerByName(coordinator) : coordinator;
        const playerToAdd = this.getPlayerByName(playerNameToAdd);

        if (!coordinatorPlayer || !playerToAdd) {
            return Promise.reject(new Error(`Cannot add "${playerNameToAdd}" to group: player not found`));
        }

        return playerToAdd.setAVTransport(`x-rincon:${coordinatorPlayer.uuid}`);
    }

    private removeFromGroup(leavingName: string, coordinator: SonosPlayer | string): Promise<unknown> {
        const coordinatorPlayer = typeof coordinator === 'string' ? this.getPlayerByName(coordinator) : coordinator;
        const leavingPlayer = this.getPlayerByName(leavingName);

        if (!coordinatorPlayer || !leavingPlayer) {
            return Promise.reject(new Error(`Cannot remove "${leavingName}" from group: player not found`));
        }

        if (leavingPlayer.coordinator === coordinatorPlayer) {
            return leavingPlayer.becomeCoordinatorOfStandaloneGroup();
        }

        if (coordinatorPlayer.coordinator === leavingPlayer) {
            return coordinatorPlayer.becomeCoordinatorOfStandaloneGroup();
        }

        return Promise.resolve();
    }

    // State of sonos device was changed
    private async takeSonosState(ip: string, sonosState: SonosPlayerState): Promise<void> {
        await this.setState({ device: 'root', channel: ip, state: 'alive' }, { val: true, ack: true });

        const player = this.discovery?.getPlayerByUUID(this.channels[ip].uuid);

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
            if (ps.playing && this.channels[ip].duration > 0) {
                if (!this.channels[ip].elapsedTimer) {
                    this.channels[ip].elapsedTimer = setInterval(
                        () => this.updateElapsed(ip),
                        this.config.elapsedInterval || 5000,
                    );
                }
            } else if (this.channels[ip].elapsedTimer) {
                clearInterval(this.channels[ip].elapsedTimer);
                this.channels[ip].elapsedTimer = null;
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

        if (sonosState.currentTrack.type === 'radio') {
            await this.setState({ device: 'root', channel: ip, state: 'current_type' }, { val: 1, ack: true });
            await this.setState(
                { device: 'root', channel: ip, state: 'current_station' },
                { val: sonosState.currentTrack.stationName || '', ack: true },
            );
        } else {
            await this.setState(
                { device: 'root', channel: ip, state: 'current_type' },
                { val: sonosState.currentTrack.type === 'line_in' ? 2 : 0, ack: true },
            );
            await this.setState({ device: 'root', channel: ip, state: 'current_station' }, { val: '', ack: true });
        }

        await this.setState(
            { device: 'root', channel: ip, state: 'current_title' },
            { val: sonosState.currentTrack.title || '', ack: true },
        );
        await this.setState(
            { device: 'root', channel: ip, state: 'current_album' },
            { val: sonosState.currentTrack.album || '', ack: true },
        );
        await this.setState(
            { device: 'root', channel: ip, state: 'current_artist' },
            { val: sonosState.currentTrack.artist || '', ack: true },
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
        if (player._address) {
            await this.updateHtmlQueue(player._address, sonosState.trackNo);
        }

        if (this.lastCover !== sonosState.currentTrack.albumArtUri) {
            await this.updateCover(ip, sonosState.currentTrack.albumArtUri);
            this.lastCover = sonosState.currentTrack.albumArtUri || null;
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

        if (player.tts) {
            if (stableState && (ps.paused || ps.stopped)) {
                player.tts.playingEnded();
            } else if (ps.playing) {
                player.tts.playingStarted();
            }
        }
    }

    /** Update the elapsed time while playing */
    private updateElapsed(ip: string): void {
        const channel = this.channels[ip];

        if (!channel) {
            return;
        }

        channel.elapsed += (this.config.elapsedInterval || 5000) / 1000;

        if (channel.elapsed > channel.duration) {
            channel.elapsed = channel.duration;
        }

        void this.setState(
            { device: 'root', channel: ip, state: 'seek' },
            { val: Math.round((channel.elapsed / channel.duration) * 1000) / 10, ack: true },
        );
        void this.setState(
            { device: 'root', channel: ip, state: 'current_elapsed' },
            { val: channel.elapsed, ack: true },
        );
        void this.setState(
            { device: 'root', channel: ip, state: 'current_elapsed_s' },
            { val: toFormattedTime(channel.elapsed), ack: true },
        );
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

        const player = this.discovery?.getPlayerByUUID(this.channels[ip].uuid);
        const hostname = player ? getIp(player, true) : null;

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

    private async takeSonosFavorites(ip: string, favorites: Record<string, SonosFavorite>): Promise<void> {
        let sFavorites = '';
        const aFavorites: string[] = [];
        const _hFavorites: string[] = [];

        _hFavorites.push('<table class="sonosFavoriteTable">');

        Object.keys(favorites).forEach(favorite => {
            const title = favorites[favorite].title;

            if (title) {
                sFavorites += (sFavorites ? ', ' : '') + title;
                aFavorites.push(title);
                _hFavorites.push(
                    `<tr class="sonosFavoriteRow" onclick="vis.setValue('${this.namespace}.root.${ip}.favorites_set', '${title}')"><td class="sonosFavoriteNumber">${
                        Number(favorite) + 1
                    }</td><td class="sonosFavoriteCover"><img src="${
                        favorites[favorite].albumArtUri
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
        if (!this.discovery) {
            return;
        }

        const favorites = await this.discovery.getFavorites();

        // Go through all players
        for (const player of this.discovery.players) {
            if (!player) {
                continue;
            }
            player._address = player._address || getIp(player);

            const ip = player._address;

            if (ip && this.channels[ip]) {
                await this.takeSonosFavorites(ip, favorites);
            }
        }
    }

    private async processSonosEvents(event: string, data: any): Promise<void> {
        if (!this.discovery) {
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
            for (const player of this.discovery.players) {
                if (player.roomName !== data.roomName) {
                    continue;
                }

                const ip = this.getIpOfPlayer(player.uuid);

                if (ip) {
                    this.channels[ip].uuid = player.uuid;
                    await this.setState(
                        { device: 'root', channel: ip, state: 'group_volume' },
                        { val: data.newVolume, ack: true },
                    );
                    player._volume = data.newVolume;
                    this.log.debug(`group-volume: Volume for ${player.baseUrl}: ${data.newVolume}`);
                }
            }
        } else if (event === 'group-mute') {
            const player = this.discovery.getPlayerByUUID(data.uuid);
            const ip = this.getIpOfPlayer(data.uuid);

            if (player && ip) {
                this.channels[ip].uuid = data.uuid;
                await this.setState({ device: 'root', channel: ip, state: 'muted' }, { val: data.newMute, ack: true });
                player._isMuted = data.newMute;
                this.log.debug(`mute: Mute for ${player.baseUrl}: ${data.newMute}`);
                await this.setState(
                    { device: 'root', channel: ip, state: 'group_muted' },
                    { val: player.groupState.mute, ack: true },
                );
                this.log.debug(`group_muted: groupMuted for ${player.baseUrl}: ${player.groupState.mute}`);
            }
        } else if (event === 'volume') {
            const player = this.discovery.getPlayerByUUID(data.uuid);
            const ip = this.getIpOfPlayer(data.uuid);

            if (player && ip) {
                this.channels[ip].uuid = data.uuid;
                await this.setState(
                    { device: 'root', channel: ip, state: 'volume' },
                    { val: data.newVolume, ack: true },
                );
                player._volume = data.newVolume;
                this.log.debug(`volume: Volume for ${player.baseUrl}: ${data.newVolume}`);
            }
        } else if (event === 'treble' || event === 'bass') {
            // node-sonos-discovery is not emitting any events on treble/bass changes yet, so it is not
            // possible to get the externally set values, yet.
        } else if (event === 'mute') {
            const player = this.discovery.getPlayerByUUID(data.uuid);
            const ip = this.getIpOfPlayer(data.uuid);

            if (player && ip) {
                this.channels[ip].uuid = data.uuid;
                await this.setState({ device: 'root', channel: ip, state: 'muted' }, { val: data.newMute, ack: true });
                player._isMuted = data.newMute;
                this.log.debug(`mute: Mute for ${player.baseUrl}: ${data.newMute}`);
            }
        } else if (event === 'favorites') {
            try {
                await this.updateFavorites();
            } catch (err) {
                this.log.error(`Cannot getFavorites: ${err}`);
            }
        } else if (event === 'queue') {
            const player = this.discovery.getPlayerByUUID(data.uuid);
            const ip = this.getIpOfPlayer(data.uuid);

            if (player && ip) {
                this.channels[ip].uuid = data.uuid;
                await this.takeSonosQueue(ip, player, data.queue);
            }

            if (player) {
                try {
                    await this.updateFavorites();
                } catch (err) {
                    this.log.error(`Cannot getFavorites: ${err}`);
                }
            }
        } else {
            this.log.debug(`${event} ${typeof data === 'object' ? JSON.stringify(data) : data}`);
        }
    }

    private async processTopologyChange(data: any): Promise<void> {
        if (typeof data.length === 'undefined') {
            const ip = this.getIpOfPlayer(data.uuid);

            if (ip) {
                this.channels[ip].uuid = data.uuid;
                await this.setState({ device: 'root', channel: ip, state: 'alive' }, { val: true, ack: true });
            }
            return;
        }

        for (const group of data) {
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
            }
        }
    }

    private async takeSonosQueue(ip: string, player: SonosPlayer, queue: SonosQueueItem[]): Promise<void> {
        const _text: string[] = [];
        const _html: string[] = [];

        _html.push('<table class="sonosQueueTable">');

        for (let q = 0; q < queue.length; q++) {
            _text.push(`${queue[q].artist} - ${queue[q].title}`);
            _html.push(`
                        <tr class="sonosQueueRow" onclick="vis.setValue('${this.namespace}.root.${
                            player._address
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
        const player = this.discovery?.getPlayerByUUID(uuid);

        if (!player) {
            return null;
        }

        player._address = player._address || getIp(player);

        const ip = player._address;

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

        this.discovery = new SonosDiscovery({
            household: null,
            log: this.log,
            cacheDir: this.cacheDir,
            port: this.config.webserverPort,
        });

        // from here the code is mostly from https://github.com/jishi/node-sonos-web-controller/blob/master/server.js
        const events: Record<string, string> = {
            'topology-change': 'topology-change',
            'transport-state': 'transport-state',
            'group-volume': 'group-volume',
            'volume-change': 'volume',
            'group-mute': 'group-mute',
            'mute-change': 'mute',
            favorites: 'favorites',
            'list-change': 'favorites',
        };

        Object.keys(events).forEach(sonosEvent =>
            this.discovery?.on(sonosEvent, data =>
                this.processSonosEvents(events[sonosEvent], data).catch(e =>
                    this.log.error(`Cannot process ${sonosEvent}: ${e}`),
                ),
            ),
        );

        this.discovery.on('queue-change', (player: SonosPlayer) =>
            player
                .getQueue()
                .then(queue => {
                    this.queues[player.uuid] = queue;
                    return this.processSonosEvents('queue', { uuid: player.uuid, queue });
                })
                .catch(e => this.log.error(`Cannot loadQueue: ${e}`)),
        );

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
