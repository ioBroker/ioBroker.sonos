/**
 *      ioBroker Sonos Adapter
 *      Copyright (c) 12'2013-2021 Bluefox <dogafox@gmail.com>
 *      MIT License
 *
 *      derived from https://github.com/jishi/node-sonos-web-controller by Jimmy Shimizu
 */
'use strict';
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const adapterName = require('./package.json').name.split('.').pop();
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const SonosDiscovery = require('sonos-discovery');
const TTS = require('./lib/tts');
const path = require('path');

const aliveIds = [];
let channels = {};
let lastCover = null;
let socketServer;

const DEFAULT_IMAGE = `${__dirname}/img/no-cover.png`;

let adapter;
function startAdapter(options) {
    options = options || {};
    options.name = adapterName;

    options.error = err => {
        // Identify unhandled errors originating from callbacks in scripts
        // These are not caught by wrapping the execution code in try-catch
        if (err) {
            const errStr = err.toString();
            if (errStr.includes('EHOSTUNREACH') || errStr.includes('ECONNRESET') || errStr.includes('EAI_AGAIN')) {
                return true;
            }
        }
        return false;
    };

    adapter = new utils.Adapter(options);

    // {'val': state, 'ack':false, 'ts':1408294295, 'from':'admin.0', 'lc':1408294295}
    // id = sonos.0.192_168_1_55.state
    adapter.on('stateChange', (_id, state) => {
        if (!state || state.ack) {
            return;
        }
        adapter.log.info(`try to control id ${_id} with ${JSON.stringify(state)}`);
        // Try to find the object
        const id = adapter.idToDCS(_id);

        if (id && id.channel && channels[id.channel]) {
            if (state.val === 'false') {
                state.val = false;
            }
            if (state.val === 'true') {
                state.val = true;
            }
            if (parseInt(state.val) === state.val) {
                state.val = parseInt(state.val);
            }

            let player = channels[id.channel].player;
            if (!player) {
                player = discovery.getPlayerByUUID(channels[id.channel].uuid);
                channels[id.channel].player = player;
            }

            let promise;
            if (player) {
                if (id.state === 'state_simple') {
                    if (!state.val) {
                        promise = player.pause();
                    } else {
                        promise = player.play();
                    }
                } else if (id.state === 'current_track_number') {
                    promise = player.trackSeek(state.val);
                } else if (id.state === 'shuffle') {
                    promise = player.shuffle(!!state.val);
                } else if (id.state === 'crossfade') {
                    promise = player.crossfade(!!state.val);
                } else if (id.state === 'repeat') {
                    if (state.val === 0 || state.val === '0') {
                        promise = player.repeat('none');
                    } else if (state.val === 1 || state.val === '1') {
                        promise = player.repeat('all');
                    } else if (state.val === 2 || state.val === '2') {
                        promise = player.repeat('one');
                    } else {
                        promise = player.repeat(state.val);
                    }
                } else if (id.state === 'play') {
                    if (state.val) {
                        promise = player.play(); // !! is toBoolean()
                    }
                } else if (id.state === 'stop') {
                    if (state.val) {
                        promise = player.pause(); // !! is toBoolean()
                    }
                } else if (id.state === 'pause') {
                    if (state.val) {
                        promise = player.pause(); // !! is toBoolean()
                    }
                } else if (id.state === 'next') {
                    if (state.val) {
                        promise = player.nextTrack(); // !! is toBoolean()
                    }
                } else if (id.state === 'prev') {
                    if (state.val) {
                        promise = player.previousTrack(); // !! is toBoolean()
                    }
                } else if (id.state === 'seek') {
                    state.val = parseFloat(state.val);
                    if (state.val < 0) {
                        state.val = 0;
                    }
                    if (state.val > 100) {
                        state.val = 100;
                    }
                    promise = player.timeSeek(Math.round((channels[id.channel].duration * state.val) / 100));
                } else if (id.state === 'current_elapsed') {
                    state.val = parseInt(state.val, 10);
                    promise = player.timeSeek(state.val);
                } else if (id.state === 'current_elapsed_s') {
                    const parts = state.val.toString().split(':');
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
                        return adapter.log.error(`Invalid elapsed time: ${state.val}`);
                    }
                    promise = player.timeSeek(seconds);
                } else if (id.state === 'muted') {
                    if (state.val) {
                        promise = player.mute(); // !! is toBoolean()
                    } else {
                        promise = player.unMute(); // !! is toBoolean()
                    }
                } else if (id.state === 'volume') {
                    promise = player.setVolume(state.val);
                } else if (id.state === 'treble') {
                    promise = player.setTreble(state.val);
                } else if (id.state === 'bass') {
                    promise = player.setBass(state.val);
                } else if (id.state === 'state') {
                    //stop,play,pause,next,previous,mute,unmute
                    if (state.val && typeof state.val === 'string') {
                        state.val = state.val.toLowerCase();
                        switch (state.val) {
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
                                adapter.log.warn(`Unknown state: ${state.val}`);
                                break;
                        }
                    } else {
                        adapter.log.warn(`Invalid state: ${state.val}`);
                    }
                } else if (id.state === 'favorites_set') {
                    promise = player
                        .replaceWithFavorite(state.val)
                        .then(() => player.play())
                        .then(() => {
                            adapter.setState(
                                { device: 'root', channel: id.channel, state: 'current_album' },
                                { val: state.val, ack: true }
                            );
                            adapter.setState(
                                {
                                    device: 'root',
                                    channel: id.channel,
                                    state: 'current_artist'
                                },
                                { val: state.val, ack: true }
                            );
                        })
                        .catch(error => adapter.log.error(`Cannot replaceWithFavorite: ${error}`));
                } else if (id.state === 'playlist_set') {
                    promise = player
                        .replaceWithPlaylist(state.val)
                        .then(() => player.play())
                        .then(() => {
                            adapter.setState(
                                { device: 'root', channel: id.channel, state: 'current_album' },
                                { val: state.val, ack: true }
                            );
                            adapter.setState(
                                {
                                    device: 'root',
                                    channel: id.channel,
                                    state: 'current_artist'
                                },
                                { val: state.val, ack: true }
                            );
                        })
                        .catch(error => adapter.log.error(`Cannot replaceWithPlaylist: ${error}`));
                } else if (id.state === 'tts') {
                    adapter.log.debug(`Play TTS file ${state.val} on ${id.channel}`);
                    text2speech(state.val, id.channel);
                } else if (id.state === 'add_to_group') {
                    promise = addToGroup(state.val, player); // xxxx
                } else if (id.state === 'remove_from_group') {
                    promise = removeFromGroup(state.val, player);
                } else if (id.state === 'coordinator') {
                    if (state.val === id.channel) {
                        promise = player.becomeCoordinatorOfStandaloneGroup();
                    } else {
                        promise = attachTo(player, getPlayerByName(state.val));
                    }
                } else if (id.state === 'group_volume') {
                    try {
                        promise = player.setGroupVolume(state.val);
                    } catch (err) {
                        adapter.log.warn(`Cannot set group volume: ${err}`);
                    }
                } else if (id.state === 'group_muted') {
                    if (state.val) {
                        promise = player.muteGroup(); // !! is toBoolean()
                    } else {
                        promise = player.unMuteGroup(); // !! is toBoolean()
                    }
                } else {
                    adapter.log.warn(`try to control unknown id ${JSON.stringify(id)}`);
                }

                promise && promise.then(() => adapter.log.debug('command done')).catch(e => adapter.log.error(e));
            } else {
                adapter.log.warn(`SONOS "${id.channel}"/"${channels[id.channel].uuid}" not found`);
                discovery.players.forEach(player =>
                    adapter.log.debug(`UUID: ${player.uuid} in ${player.roomName} / ${player.baseUrl}`)
                );
            }
        }
    });

    adapter.on('install', () => adapter.createDevice('root', {}));

    adapter.on('unload', callback => {
        try {
            if (adapter) {
                adapter.setState && aliveIds.forEach(id => adapter.setState(id, false, true));

                channels &&
                    Object.keys(channels).forEach(ip => {
                        if (channels[ip] && channels[ip].elapsedTimer) {
                            clearInterval(channels[ip].elapsedTimer);
                            channels[ip].elapsedTimer = null;
                        }

                        if (channels[ip] && channels[ip].timerVolume) {
                            clearTimeout(channels[ip].timerVolume);
                            channels[ip].timerVolume = null;
                        }
                    });

                adapter.log && adapter.log.info && adapter.log.info('terminating');
            }

            if (discovery) {
                if (discovery.players) {
                    for (let i = 0; i < discovery.players.length; i++) {
                        if (discovery.players[i] && discovery.players[i].tts) {
                            discovery.players[i].tts.destroy();
                            discovery.players[i].tts = null;
                        }
                    }
                }
                discovery.dispose();
                discovery = null;
            }

            callback();
        } catch {
            callback();
        }
    });

    adapter.on('ready', async () => {
        try {
            await clearLegacyBinaryStates();
        } catch (e) {
            adapter.log.warn(`Could not clear legacy binary states: ${e.message}`);
        }

        adapter.getObject(`${adapter.namespace}.root`, (err, obj) => {
            if (!obj || !obj.common || !obj.common.name) {
                adapter.createDevice('root', {}, () => main());
            } else {
                main();
            }
        });
    });

    // New message arrived. obj is array with current messages
    adapter.on('message', obj => {
        let wait = false;
        if (obj) {
            switch (obj.command) {
                case 'send':
                    obj.message && text2speech(obj.message);
                    break;

                case 'browse':
                    if (obj.callback) {
                        browse(async list => {
                            // get all rooms
                            const rooms = await adapter.getObjectViewAsync('system', 'enum', {
                                startkey: 'enum.rooms.',
                                endkey: 'enum.rooms.\u9999'
                            });

                            // merge data together
                            if (obj.message) {
                                if (typeof obj.message !== 'object') {
                                    try {
                                        obj.message = JSON.parse(obj.message);
                                    } catch {
                                        // ignore
                                        obj.message = { devices: [] };
                                    }
                                }
                            } else {
                                obj.message = { devices: [] };
                            }
                            const devices = obj.message.devices;
                            // merge devices
                            list.forEach(item => {
                                if (!devices.find(it => it.ip === item.ip)) {
                                    devices.push({
                                        name: item.roomName,
                                        room: enumName2Id(rooms.rows, item.roomName),
                                        ip: item.ip
                                    });
                                }
                            });

                            adapter.sendTo(obj.from, obj.command, { native: { devices } }, obj.callback);
                        });
                        wait = true;
                    }
                    break;

                /*case 'del':
                case 'delete':
                    wait = true;
                    if (obj.message) {
                        adapter.deleteChannel('root', obj.message, function (err) {
                            sonosInit();
                            if (obj.callback) adapter.sendTo(obj.from, obj.command, err, obj.callback);
                        });
                    } else {
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Invalid IP address: ' + obj.message, obj.callback);
                    }
                    break;
    */
                default:
                    adapter.log.warn(`Unknown command: ${obj.command}`);
                    break;
            }
        }

        if (!wait && obj.callback) {
            adapter.sendTo(obj.from, obj.command, obj.message, obj.callback);
        }

        return true;
    });

    return adapter;
}

function toFormattedTime(time) {
    let hours = Math.floor(time / 3600);
    hours = hours ? `${hours}:` : '';
    let min = Math.floor(time / 60) % 60;
    if (min < 10) {
        min = `0${min}`;
    }
    let sec = time % 60;
    if (sec < 10) {
        sec = `0${sec}`;
    }

    return `${hours + min}:${sec}`;
}

function enumName2Id(enums, name) {
    name = name.toLowerCase();
    for (let e = 0; e < enums.length; e++) {
        if (enums[e] && enums[e].value && enums[e].value.common && enums[e].value.common.name) {
            if (typeof enums[e].value.common.name === 'object') {
                for (const lang in enums[e].value.common.name) {
                    if (
                        enums[e].value.common.name.hasOwnProperty(lang) &&
                        enums[e].value.common.name[lang].toLowerCase() === name
                    ) {
                        return enums[e].id;
                    }
                }
            } else {
                if (enums[e].value.common.name && enums[e].value.common.name.toLowerCase() === name) {
                    return enums[e].id;
                }
            }
        }
        if (enums[e].value && enums[e].value.name) {
            if (typeof enums[e].value.name === 'object') {
                for (const lang in enums[e].value.name) {
                    if (enums[e].value.name.hasOwnProperty(lang) && enums[e].value.name[lang].toLowerCase() === name) {
                        return enums[e].id;
                    }
                }
            } else {
                if (enums[e].value.name.toLowerCase() === name) {
                    return enums[e].id;
                }
            }
        }
    }

    return '';
}

const newGroupStates = {
    add_to_group: {
        def: '',
        type: 'string',
        read: false,
        write: true,
        role: 'media',
        desc: 'Add a Player to a Group (Player to remove, Coordinator)'
    },
    remove_from_group: {
        def: '',
        type: 'string',
        read: false,
        write: true,
        role: 'media',
        desc: 'Remove a Player to a Group (Player to remove, Coordinator)'
    },
    coordinator: {
        // master of group
        def: '',
        type: 'string',
        read: true,
        write: true,
        role: 'media.coordinator',
        desc: 'Indicates coordinator of group'
    },
    group_volume: {
        type: 'number',
        read: true,
        write: true,
        role: 'level.volume.group',
        min: 0,
        max: 100,
        desc: 'State and control of group volume'
    },
    group_muted: {
        def: false,
        type: 'boolean',
        read: true,
        write: true,
        role: 'media.mute.group',
        desc: 'Group is muted'
    },
    members: {
        // indicator.reachable -    if player alive (read only)
        type: 'string',
        read: true,
        write: false,
        role: 'indicator.members',
        desc: 'Group members'
    },
    membersChannels: {
        // indicator.reachable -    if player alive (read only)
        type: 'string',
        read: true,
        write: false,
        role: 'indicator.members',
        desc: 'Group members Channels'
    },
    playlist_set: {
        // media.playlist.set -    select Sonos playlist (write only)
        def:    '',
        type:   'string',
        read:   false,
        write:  true,
        role:   'media.playlist.set',
        desc:   'Set Sonos playlist to play',
        name:   'Playlist set'
    }
};

async function createChannel(name, ip, room) {
    const states = {
        state_simple: {
            // media.state -            Text state of player: stop, play, pause (read, write)
            def: false,
            type: 'boolean',
            read: true,
            write: true,
            role: 'media.state',
            desc: 'Play or pause',
            name: 'Binary play/pause state'
        },
        play: {
            // play command
            type: 'boolean',
            read: false,
            write: true,
            role: 'button.play',
            desc: 'play',
            name: 'Play button'
        },
        stop: {
            // stop command
            type: 'boolean',
            read: false,
            write: true,
            role: 'button.stop',
            desc: 'stop',
            name: 'Stop button'
        },
        pause: {
            // pause command
            type: 'boolean',
            read: false,
            write: true,
            role: 'button.pause',
            desc: 'pause',
            name: 'Pause button'
        },
        prev: {
            // prev command
            type: 'boolean',
            read: false,
            write: true,
            role: 'button.prev',
            desc: 'prev',
            name: 'Previous button'
        },
        next: {
            // next command
            type: 'boolean',
            read: false,
            write: true,
            role: 'button.next',
            desc: 'next',
            name: 'Next button'
        },
        seek: {
            // seek command and indication
            type: 'number',
            read: true,
            write: true,
            unit: '%',
            min: 0,
            max: 100,
            role: 'media.seek',
            desc: 'Seek position in percent',
            name: 'Seek position'
        },
        state: {
            // media.state -            Text state of player: stop, play, pause (read, write)
            def: 'stop',
            type: 'string',
            read: true,
            write: true,
            values: 'stop,play,pause,next,previous,mute,unmute',
            role: 'media.state',
            desc: 'Play, stop, or pause, next, previous, mute, unmute',
            name: 'String state'
        },
        volume: {
            // level.volume -           volume level (read, write)
            type: 'number',
            read: true,
            write: true,
            role: 'level.volume',
            min: 0,
            max: 100,
            desc: 'State and control of volume',
            name: 'Player volume'
        },
        treble: {
            // level.treble -           treble level (only write)
            type: 'number',
            read: false,
            write: true,
            role: 'level.treble',
            min: -10,
            max: 10,
            desc: 'State and control of treble',
            name: 'Player treble'
        },
        bass: {
            // level.bass -           bass level (only write)
            type: 'number',
            read: false,
            write: true,
            role: 'level.bass',
            min: -10,
            max: 10,
            desc: 'State and control of bass',
            name: 'Player bass'
        },
        muted: {
            // media.muted -            is muted (read only)
            def: false,
            type: 'boolean',
            read: true,
            write: true,
            role: 'media.mute',
            desc: 'Is muted',
            name: 'Player mute'
        },
        current_title: {
            // media.current.title -    current title (read only)
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'media.title',
            desc: 'Title of current played song',
            name: 'Current title'
        },
        current_artist: {
            // media.current.artist -   current artist (read only)
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'media.artist',
            desc: 'Artist of current played song',
            name: 'Current artist'
        },
        current_album: {
            // media.current.album -    current album (read only)
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'media.album',
            desc: 'Album of current played song',
            name: 'Current album'
        },
        current_cover: {
            // media.current.cover -    current url to album cover (read only)
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'media.cover',
            desc: 'Cover image of current played song',
            name: 'Current cover URL'
        },
        current_duration: {
            // media.current.duration - duration as HH:MM:SS (read only)
            def: 0,
            type: 'number',
            read: true,
            write: false,
            unit: 'seconds',
            role: 'media.duration',
            desc: 'Duration of current played song in seconds',
            name: 'Current song duration'
        },
        current_duration_s: {
            // media.current.duration - duration in seconds (read only)
            def: '00:00',
            type: 'string',
            read: true,
            write: false,
            unit: 'interval',
            role: 'media.duration.text',
            desc: 'Duration of current played song as HH:MM:SS',
            name: 'Current duration'
        },
        current_type: {
            // media.type -            type of stream (read only)
            def: 0,
            type: 'number',
            read: true,
            write: false,
            role: 'media.type',
            states: { 0: 'track', 1: 'radio', 2: 'line_in' },
            desc: 'Type of Stream (0 = track, 1 = radio, 2 = line_in)',
            name: 'Current stream type'
        },
        current_station: {
            // media.current.station -   current station (read only)
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'media.station',
            desc: 'Radio station currently played',
            name: 'Current radio station'
        },
        current_track_number: {
            // media.trackNo -   current track number
            def: 1,
            type: 'number',
            read: true,
            write: true,
            role: 'media.trackNo',
            desc: 'Current track number',
            name: 'Current track number'
        },
        alive: {
            // indicator.reachable -    if player alive (read only)
            type: 'boolean',
            read: true,
            write: false,
            role: 'indicator.reachable',
            desc: 'If sonos alive or not',
            name: 'Connection status'
        },
        current_elapsed: {
            // media.current.elapsed -  elapsed time in seconds
            def: 0,
            type: 'number',
            read: true,
            write: true,
            unit: 'seconds',
            role: 'media.elapsed',
            desc: 'Elapsed time of current played song in seconds',
            name: 'Elapsed time in seconds'
        },
        current_elapsed_s: {
            // media.current.elapsed -  elapsed time in HH:MM:SS
            def: '00:00',
            type: 'string',
            read: true,
            write: true,
            unit: 'interval',
            role: 'media.elapsed.text',
            desc: 'Elapsed time of current played song as HH:MM:SS',
            name: 'Elapsed time as text'
        },
        favorites_list: {
            // media.favorites.list -   list of favorites channel (read only)
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'media.favorites.list',
            desc: 'List of favorites song or stations, divided by comma',
            name: 'Favorites list'
        },
        favorites_list_array: {
            // media.favorites.array -   list of favorite channels in JSON format (read only)
            def: '',
            type: 'array',
            read: true,
            write: false,
            role: 'media.favorites.array',
            desc: 'Array of favorites song or stations',
            name: 'Favorites Array'
        },
        favorites_list_html: {
            // favorites html list
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'state',
            desc: 'List of favorites song or stations as html table',
            name: 'Favorites list html'
        },
        favorites_set: {
            // media.favorites.set -    select favorites from list (write only)
            def: '',
            type: 'string',
            read: false,
            write: true,
            role: 'media.favorites.set',
            desc: 'Set favorite from the list to play',
            name: 'Favorites set'
        },
        tts: {
            // play text to speech mp3 file
            def: '',
            type: 'string',
            read: false,
            write: true,
            role: 'media.tts',
            desc: 'Set text2speech mp3 file to play',
            name: 'Text to speech'
        },
        shuffle: {
            // Shuffle mode: true or false
            def: false,
            type: 'boolean',
            read: true,
            write: true,
            role: 'media.mode.shuffle',
            desc: 'Shuffle mode',
            name: 'Shuffle'
        },
        repeat: {
            // repeat mode: true or false
            def: 0,
            type: 'number',
            read: true,
            write: true,
            role: 'media.mode.repeat',
            states: { 0: 'none', 1: 'all', 2: 'one' },
            desc: 'Repeat mode',
            name: 'Repeat'
        },
        crossfade: {
            // crossfade mode: true or false
            def: false,
            type: 'boolean',
            read: true,
            write: true,
            role: 'media.mode.crossfade',
            desc: 'Crossfade mode',
            name: 'Crossfade'
        },
        queue: {
            // queue
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'state',
            name: 'Play queue'
        },
        queue_html: {
            // queue html table
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'state',
            name: 'Play queue html'
        }
    };

    for (const g in newGroupStates) {
        states[g] = newGroupStates[g];
    }

    const statesList = [];
    for (const state in states) {
        statesList.push(state);
    }
    const id = ip.replace(/[.\s]+/g, '_');

    const obj = await adapter.createChannelAsync(
        'root',
        id,
        {
            role: 'media.music',
            name: name || ip
        },
        {
            ip
        }
    );

    if (room) {
        await adapter.addChannelToEnumAsync('room', room, 'root', id);
    }
    for (let j = 0; j < statesList.length; j++) {
        await adapter.createStateAsync('root', id, statesList[j], states[statesList[j]]);
    }

    return obj;
}

function browse(callback) {
    const result = [];

    if (discovery) {
        for (let i = 0; i < discovery.players.length; i++) {
            result.push({
                roomName: discovery.players[i].roomName,
                ip: getIp(discovery.players[i], true)
            });
        }
    }

    callback && callback(result);
}

let currentFileNum = 0;

async function text2speech(fileName, sonosIp, callback) {
    // Extract volume
    let volume = null;

    const pos = fileName.indexOf(';');
    if (pos !== -1) {
        volume = fileName.substring(0, pos);
        fileName = fileName.substring(pos + 1);
    }

    fileName = fileName.trim();

    // play http/https urls directly on sonos device
    if (fileName && fileName.match(/^https?:\/\//)) {
        if (sonosIp) {
            sonosIp = sonosIp.replace(/[.\s]+/g, '_');
        }
        if (discovery) {
            // Play on all players
            for (let i = 0; i < discovery.players.length; i++) {
                discovery.players[i]._address = discovery.players[i]._address || getIp(discovery.players[i]);

                const ip = discovery.players[i]._address;

                if (sonosIp && ip !== sonosIp) {
                    continue;
                }

                setTimeout(() => playOnSonos(fileName, discovery.players[i].uuid, volume), 100);
            }
        }

        callback && callback();
    } else if (fileName) {
        if (!adapter.config.webServer) {
            return adapter.log.warn('Web server must be enabled to play local TTS files');
        }

        const parts = fileName.split('.');
        const dest = `tts${currentFileNum++}.${parts.pop()}`;

        if (currentFileNum > 10) {
            currentFileNum = 0;
        }

        // Upload this file to objects DB
        try {
            const data = fs.readFileSync(fileName);
            const id = `/TTS/${adapter.namespace}/${dest}`;

            try {
                await adapter.writeFile(adapter.name, id, data);
                const obj = await adapter.getForeignObject(adapter.config.webServer);
                if (obj && obj.native && discovery) {
                    fileName = `http${obj.native.secure ? 's' : ''}://${discovery.localEndpoint}:${
                        obj.native.port
                    }/files/${adapter.name}${id}`;
                    if (sonosIp) {
                        sonosIp = sonosIp.replace(/[.\s]+/g, '_');
                    }

                    // Play on all players
                    for (let i = 0; i < discovery.players.length; i++) {
                        if (!discovery.players[i]._address) {
                            discovery.players[i]._address = getIp(discovery.players[i]);
                        }

                        const ip = discovery.players[i]._address;

                        if (sonosIp && ip !== sonosIp) {
                            continue;
                        }

                        setTimeout(() => playOnSonos(fileName, discovery.players[i].uuid, volume), 100);
                    }
                }
            } catch (err) {
                adapter.log.error(`Cannot upload ${id}: ${err}`);
                return callback && callback(err);
            }

            callback && callback();
        } catch (e) {
            adapter.log.error(e);
            callback && callback(e);
        }
    } else {
        adapter.log.error('invalid filename specified');
        callback && callback('invalid filename specified');
    }
}
/*
function fadeIn(player, to, options) {
    if (!adapter.config.fadeIn && !adapter.config.fadeOut) {
        return player.setVolume(to);
    }

    if (options === undefined) {
        adapter.log.debug('<< fadeIn start to ' + to);
        to = parseInt(to, 10);
        const duration = parseInt(adapter.config.fadeIn, 10) || 0;

        if (!duration) {
            return player.setVolume(to);
        }

        options = {
            duration: duration,
            step: Math.round(to / Math.max(duration / 100, 1)),
            actual: 0
        };
    }

    if (!options.duration) {
        return player.setVolume(to);
    }

    options.step = options.step || 1;

    adapter.log.debug('>> fadeIn to ' + options.actual + ' of ' + to);

    options.actual += options.step;

    if (options.actual >= to) {
        adapter.log.debug('<< fadeIn end to ' + to);
        return player.setVolume(to);
    } else {
        return player.setVolume(options.actual)
            .then(() =>
                new Promise(resolve =>
                    setTimeout(() => fadeIn(player, to, options)
                        .then(() => resolve()), 100)));
    }
}

function fadeOut(player, options) {
    if ((!adapter.config.fadeIn && !adapter.config.fadeOut) || options === true) {
        return Promise.resolve(typeof options === 'boolean' && options);
    }

    if (options === false) {
        options = undefined;
    }

    if (options === undefined) {
        const duration = parseInt(adapter.config.fadeOut, 10);
        if (!duration) {
            return player.setVolume(0)
                .then(() => false);
        }

        const actual = parseInt(player._volume, 10);

        options = {
            duration: duration,
            actual: actual,
            step: Math.round(actual / Math.max(duration / 100, 1))
        };
    }

    if (!options.duration) {
        return player.setVolume(0)
            .then(() => false);
    }

    options.step = options.step || 1;

    options.actual -= options.step;

    if (!player._isMute && options.actual > 0 && player.state.currentState === 'PLAYING') {
        return player.setVolume(options.actual)
            .then(() => {
                adapter.log.debug('>> fadeOut: setVolume: ' + options.actual);

                return new Promise(resolve =>
                    setTimeout(() =>
                        fadeOut(player, options)
                            .then(() =>
                                resolve(false)), 100));
            });
    } else {
        return player.setVolume(0)
            .then(() => {
                adapter.log.debug('<< fadeOut ');
                return false;
            });
    }
}

function startPlayer(player, volume, noFadeIn, start, reason) {
    adapter.log.debug(`startPlayer ${reason || ''}: volume=${volume}, start=${start} player.queuedTts.length=${player.queuedTts && player.queuedTts.length ? player.queuedTts.length : 0}`);
    //fadeOut(player);

    if (start || noFadeIn) {
        return player.play()
            .then(() => {
                if (!noFadeIn) {
                    return fadeIn(player, volume);
                } else {
                    return player.setVolume(volume);
                }
            });
    } else {
        if (!noFadeIn) {
            return fadeIn(player, volume);
        } else {
            return player.setVolume(volume);
        }
    }
}*/

//////////////////
// Group management

function getPlayerByName(name) {
    if (discovery) {
        for (const i in discovery.players) {
            if (!discovery.players.hasOwnProperty(i)) {
                continue;
            }

            const player = discovery.players[i];

            if (
                player.roomName === name ||
                getIp(player) === name ||
                player._address === name ||
                player.uuid === name
            ) {
                return player;
            }
        }
    }
}

function attachTo(player, coordinator) {
    return player.setAVTransport(`x-rincon:${coordinator.uuid}`);
}

function addToGroup(playerNameToAdd, coordinator) {
    if (typeof coordinator === 'string') {
        coordinator = getPlayerByName(coordinator);
    }

    const playerToAdd = getPlayerByName(playerNameToAdd);

    if (!coordinator || !playerToAdd) {
        return Promise.reject();
    } else {
        return attachTo(playerToAdd, coordinator);
    }
}

function removeFromGroup(leavingName, coordinator) {
    if (typeof coordinator === 'string') {
        coordinator = getPlayerByName(coordinator);
    }

    const leavingPlayer = getPlayerByName(leavingName);

    if (!coordinator || !leavingPlayer) {
        return Promise.reject();
    } else if (leavingPlayer.coordinator === coordinator) {
        return leavingPlayer.becomeCoordinatorOfStandaloneGroup();
    } else if (coordinator.coordinator === leavingPlayer) {
        return coordinator.becomeCoordinatorOfStandaloneGroup();
    }
}

function playOnSonos(uri, sonosUuid, volume) {
    if (discovery) {
        const player = discovery.getPlayerByUUID(sonosUuid);
        if (!uri) {
            player.tts && player.tts.immediatelyStopTTS();
        } else {
            player.tts = player.tts || new TTS(adapter, player);
            player.tts.add(uri, volume);
        }
    }
}

async function addChannel(name, ip, room) {
    const obj = await adapter.getObjectAsync('root');
    if (!obj) {
        // if root does not exist, channel will not be created
        await adapter.createDeviceAsync('root', []);
    }

    return createChannel(name, ip, room);
}

function _getPs(playbackState) {
    const ps = {
        playing: false,
        paused: false,
        transitioning: false,
        stopped: false
    };
    switch (playbackState) {
        case 'PLAYING':
            ps.playing = true;
            break;

        case 'PAUSED_PLAYBACK':
            ps.paused = true;
            break;

        case 'STOPPED':
            ps.stopped = true;
            break;

        case 'TRANSITIONING':
            ps.transitioning = true;
            break;
    }

    return ps;
}

// State of sonos device was changed
async function takeSonosState(ip, sonosState) {
    adapter.setState({ device: 'root', channel: ip, state: 'alive' }, { val: true, ack: true });

    if (!discovery) {
        return;
    }
    const ps = _getPs(sonosState.playbackState);
    const player = discovery.getPlayerByUUID(channels[ip].uuid);
    const playMode = sonosState.playMode;

    adapter.log.debug(
        `>  playbackState: ${sonosState.playbackState} - ${
            sonosState.currentTrack && sonosState.currentTrack.title ? sonosState.currentTrack.title : ''
        }`
    );

    const stableState = !ps.transitioning;

    // If some stable state
    if (!ps.transitioning) {
        adapter.setState({ device: 'root', channel: ip, state: 'state_simple' }, { val: ps.playing, ack: true });
        adapter.setState(
            {
                device: 'root',
                channel: ip,
                state: 'state'
            },
            { val: ps.paused ? 'pause' : ps.playing ? 'play' : 'stop', ack: true }
        );

        // if duration is 0 (type is radio):
        // - no changes expected and a state update is not necessary!
        // - division by 0
        if (ps.playing && channels[ip].duration > 0) {
            // sonosState.currentTrack.type !== 'radio') {
            if (!channels[ip].elapsedTimer) {
                channels[ip].elapsedTimer = setInterval(
                    ip_ => {
                        channels[ip_].elapsed += (adapter.config.elapsedInterval || 5000) / 1000;

                        if (channels[ip_].elapsed > channels[ip_].duration) {
                            channels[ip_].elapsed = channels[ip_].duration;
                        }

                        adapter.setState(
                            {
                                device: 'root',
                                channel: ip,
                                state: 'seek'
                            },
                            {
                                val: Math.round((channels[ip_].elapsed / channels[ip_].duration) * 1000) / 10,
                                ack: true
                            }
                        );
                        adapter.setState(
                            {
                                device: 'root',
                                channel: ip,
                                state: 'current_elapsed'
                            },
                            { val: channels[ip_].elapsed, ack: true }
                        );
                        adapter.setState(
                            {
                                device: 'root',
                                channel: ip,
                                state: 'current_elapsed_s'
                            },
                            { val: toFormattedTime(channels[ip_].elapsed), ack: true }
                        );
                    },
                    adapter.config.elapsedInterval || 5000,
                    ip
                );
            }
        } else {
            if (channels[ip].elapsedTimer) {
                clearInterval(channels[ip].elapsedTimer);
                channels[ip].elapsedTimer = null;
            }
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
    // - Tracks w/o Album name keeps album name from previous track or some random album. Don't know if this is already wrong from SONOS API.

    if (sonosState.currentTrack.type === 'radio') {
        adapter.setState({ device: 'root', channel: ip, state: 'current_type' }, { val: 1, ack: true });
        adapter.setState(
            {
                device: 'root',
                channel: ip,
                state: 'current_station'
            },
            { val: sonosState.currentTrack.stationName || '', ack: true }
        );
    } else if (sonosState.currentTrack.type === 'line_in') {
        adapter.setState({ device: 'root', channel: ip, state: 'current_type' }, { val: 2, ack: true });
        adapter.setState({ device: 'root', channel: ip, state: 'current_station' }, { val: '', ack: true });
    } else {
        adapter.setState({ device: 'root', channel: ip, state: 'current_type' }, { val: 0, ack: true });
        adapter.setState({ device: 'root', channel: ip, state: 'current_station' }, { val: '', ack: true });
    }
    adapter.setState(
        { device: 'root', channel: ip, state: 'current_title' },
        {
            val: sonosState.currentTrack.title || '',
            ack: true
        }
    );
    adapter.setState(
        { device: 'root', channel: ip, state: 'current_album' },
        {
            val: sonosState.currentTrack.album || '',
            ack: true
        }
    );
    adapter.setState(
        { device: 'root', channel: ip, state: 'current_artist' },
        {
            val: sonosState.currentTrack.artist || '',
            ack: true
        }
    );

    // elapsed time
    adapter.setState(
        { device: 'root', channel: ip, state: 'current_duration' },
        {
            val: sonosState.currentTrack.duration,
            ack: true
        }
    );
    adapter.setState(
        {
            device: 'root',
            channel: ip,
            state: 'current_duration_s'
        },
        { val: toFormattedTime(sonosState.currentTrack.duration), ack: true }
    );

    // Track number
    adapter.setState(
        { device: 'root', channel: ip, state: 'current_track_number' },
        {
            val: sonosState.trackNo,
            ack: true
        }
    );

    // Update html-queue: highlight current track
    const playerip = player._address;
    updateHtmlQueue(playerip, sonosState.trackNo);

    if (lastCover !== sonosState.currentTrack.albumArtUri) {
        let filePath;
        let md5url;

        if (sonosState.currentTrack.albumArtUri) {
            md5url = crypto.createHash('md5').update(sonosState.currentTrack.albumArtUri).digest('hex');
            filePath = cacheDir + md5url;
        } else {
            filePath = DEFAULT_IMAGE;
        }

        if (!fs.existsSync(filePath)) {
            adapter.log.debug('Cover file does not exist. Fetching via HTTP');

            http.get(
                {
                    hostname: getIp(discovery.getPlayerByUUID(channels[ip].uuid), true),
                    port: 1400,
                    path: sonosState.currentTrack.albumArtUri
                },
                res2 => {
                    adapter.log.debug(`HTTP status code ${res2.statusCode}`);

                    if (res2.statusCode === 200) {
                        if (!fs.existsSync(filePath)) {
                            const cacheStream = fs.createWriteStream(filePath);
                            res2.pipe(cacheStream).on('finish', () => syncCoverFileToStorage(filePath, ip));
                        } else {
                            adapter.log.debug('Not writing to cache');
                            res2.resume();
                        }
                    } else if (res2.statusCode === 404) {
                        // no image exists! link it to the default image.
                        filePath = DEFAULT_IMAGE;
                        res2.resume();
                        syncCoverFileToStorage(filePath, ip);
                    }

                    res2.on('end', () => adapter.log.debug('Response "end" event'));
                }
            ).on('error', e => adapter.log.warn(`Got error: ${e.message}`));
        } else {
            adapter.log.debug('Cover exists. Try reading from fs');
            /** @type {Buffer | null} */
            let fileData = null;
            try {
                fileData = fs.readFileSync(filePath);
            } catch (e) {
                adapter.log.warn(`Cannot read file: ${e}`);
            }
            // If error or null length file, read standard cover file
            if (!fileData) {
                try {
                    fileData = fs.readFileSync(DEFAULT_IMAGE);
                } catch (e) {
                    adapter.log.warn(`Cannot read file: ${e}`);
                }
            }
            if (fileData) {
                const storagePath = `coverImage/${ip}.png`;

                await adapter.writeFileAsync(adapter.name, storagePath, fileData);
                adapter.setState(
                    {
                        device: 'root',
                        channel: ip,
                        state: 'current_cover'
                    },
                    { val: `/${adapter.name}/${storagePath}`, ack: true }
                );
            }
        }

        lastCover = sonosState.currentTrack.albumArtUri;
    }

    channels[ip].elapsed = sonosState.elapsedTime;
    channels[ip].duration = sonosState.currentTrack.duration;

    // only if duration !== 0, see above
    if (channels[ip].duration > 0) {
        // sonosState.currentTrack.type !== 'radio') {
        adapter.setState(
            { device: 'root', channel: ip, state: 'current_elapsed' },
            {
                val: sonosState.elapsedTime,
                ack: true
            }
        );
        adapter.setState(
            {
                device: 'root',
                channel: ip,
                state: 'seek'
            },
            {
                val: Math.round((channels[ip].elapsed / channels[ip].duration) * 1000) / 10,
                ack: true
            }
        );
        adapter.setState(
            {
                device: 'root',
                channel: ip,
                state: 'current_elapsed_s'
            },
            { val: sonosState.elapsedTimeFormatted, ack: true }
        );
    }

    adapter.setState({ device: 'root', channel: ip, state: 'volume' }, { val: sonosState.volume, ack: true });

    if (sonosState.groupState) {
        adapter.setState(
            { device: 'root', channel: ip, state: 'muted' },
            { val: sonosState.groupState.mute, ack: true }
        );
    }

    if (playMode) {
        adapter.setState({ device: 'root', channel: ip, state: 'shuffle' }, { val: playMode.shuffle, ack: true });
        adapter.setState(
            {
                device: 'root',
                channel: ip,
                state: 'repeat'
            },
            {
                val: playMode.repeat === 'all' ? 1 : playMode.repeat === 'one' ? 2 : 0,
                ack: true
            }
        );
        adapter.setState({ device: 'root', channel: ip, state: 'crossfade' }, { val: playMode.crossfade, ack: true });
    }

    if (player.tts) {
        if (stableState && (ps.paused || ps.stopped)) {
            player.tts.playingEnded();
        } else if (ps.playing) {
            player.tts.playingStarted();
        }
    }
}

/**
 * Synchronize the cover file to ioBroker storage
 *
 * @param filePath path to read file from file system
 * @param ip ip of the player
 */
async function syncCoverFileToStorage(filePath, ip) {
    /** @type {Buffer | null} */
    let fileData;
    try {
        fileData = fs.readFileSync(filePath);
    } catch (e) {
        adapter.log.warn(`Cannot read file: ${e.message}`);
    }
    // If error or null length file, read standard cover file
    if (!fileData) {
        try {
            fileData = fs.readFileSync(DEFAULT_IMAGE);
        } catch (e) {
            adapter.log.warn(`Cannot read file: ${e.message}`);
        }
    }

    if (fileData) {
        const storagePath = `coverImage/${ip}.png`;
        await adapter.writeFileAsync(adapter.name, storagePath, fileData);
        adapter.setState(
            { device: 'root', channel: ip, state: 'current_cover' },
            { val: `/${adapter.name}/${storagePath}`, ack: true }
        );
    }
}

function takeSonosFavorites(ip, favorites) {
    let sFavorites = '';
    const aFavorites = [];
    const _hFavorites = [];

    _hFavorites.push(`<table class="sonosFavoriteTable">`);

    Object.keys(favorites).forEach(favorite => {
        if (favorites[favorite].title) {
            sFavorites += (sFavorites ? ', ' : '') + favorites[favorite].title;
            aFavorites.push(favorites[favorite].title);
            _hFavorites.push(
                `<tr class="sonosFavoriteRow" onclick="vis.setValue('${adapter.namespace}.root.${ip}.favorites_set', '${
                    favorites[favorite].title
                }')"><td class="sonosFavoriteNumber">${
                    Number(favorite) + 1
                }</td><td class="sonosFavoriteCover"><img src="${
                    favorites[favorite].albumArtUri
                }"></td><td class="sonosFavoriteTitle">${favorites[favorite].title}</td></tr>`
            );
        }
    });
    _hFavorites.push(`</table>`);
    const hFavorites = _hFavorites.join('');

    adapter.setState({ device: 'root', channel: ip, state: 'favorites_list' }, { val: sFavorites, ack: true });
    adapter.setState(
        { device: 'root', channel: ip, state: 'favorites_list_array' },
        { val: JSON.stringify(aFavorites), ack: true }
    );
    adapter.setState({ device: 'root', channel: ip, state: 'favorites_list_html' }, { val: hFavorites, ack: true });
}

function getIp(player, noReplace) {
    const m = player.baseUrl.match(/http:\/\/([.\d]+):?/);

    if (m && m[1]) {
        return noReplace ? m[1] : m[1].replace(/[.\s]+/g, '_');
    } else {
        return null;
    }
}

function processSonosEvents(event, data) {
    if (!discovery) {
        return;
    }

    if (event === 'topology-change') {
        // TODO: Check
        let member_ip;
        let member;

        if (typeof data.length === 'undefined') {
            const player = discovery.getPlayerByUUID(data.uuid);
            if (player) {
                player._address = player._address || getIp(player);

                const ip = player._address;

                if (channels[ip]) {
                    channels[ip].uuid = data.uuid;
                    adapter.setState({ device: 'root', channel: ip, state: 'alive' }, { val: true, ack: true });
                }
            }
        } else if (data.length) {
            for (let i = 0; i < data.length; i++) {
                const player = discovery.getPlayerByUUID(data[i].uuid);
                if (!player) {
                    continue;
                }
                player._address = player._address || getIp(player);

                const ip = player._address;
                if (channels[ip]) {
                    channels[ip].uuid = data[i].uuid;
                    adapter.setState({ device: 'root', channel: ip, state: 'alive' }, { val: true, ack: true });
                }
                const members = [];
                const membersChannels = [];
                for (let j = 0; j < data[i].members.length; j++) {
                    member = discovery.getPlayerByUUID(data[i].members[j].uuid);
                    member._address = member._address || getIp(member);

                    member_ip = member._address;

                    if (channels[member_ip]) {
                        channels[member_ip].uuid = data[i].members[j].uuid;
                        membersChannels.push(member_ip);
                        adapter.setState(
                            { device: 'root', channel: member_ip, state: 'coordinator' },
                            { val: ip, ack: true }
                        );
                    }

                    if (data[i].members[j].roomName) {
                        members.push(data[i].members[j].roomName);
                    }
                }
                if (channels[ip] && members.length) {
                    adapter.setState(
                        { device: 'root', channel: ip, state: 'members' },
                        { val: members.join(','), ack: true }
                    );
                }
                if (channels[ip] && membersChannels.length) {
                    adapter.setState(
                        { device: 'root', channel: ip, state: 'membersChannels' },
                        { val: membersChannels.join(','), ack: true }
                    );
                }
            }
        }
    } else if (event === 'transport-state') {
        const player = discovery.getPlayerByUUID(data.uuid);
        if (player) {
            player._address = player._address || getIp(player);

            const ip = player._address;
            if (channels[ip]) {
                channels[ip].uuid = data.uuid;
                takeSonosState(ip, data.state);
            }
        }
    } else if (event === 'group-volume') {
        // {
        //     uuid:        this.uuid,
        //     oldVolume:   this._previousGroupVolume,
        //     newVolume:   this.groupState.volume,
        //     roomName:    this.roomName
        // }

        for (let i = 0; i < discovery.players.length; i++) {
            if (discovery.players[i].roomName === data.roomName) {
                const player = discovery.getPlayerByUUID(discovery.players[i].uuid);
                if (!player) {
                    continue;
                }
                player._address = player._address || getIp(player);

                const ip = player._address;

                if (channels[ip]) {
                    channels[ip].uuid = discovery.players[i].uuid;
                    adapter.setState(
                        { device: 'root', channel: ip, state: 'group_volume' },
                        { val: data.newVolume, ack: true }
                    );
                    //adapter.setState({device: 'root', channel: ip, state: 'muted'},  {val: data.groupState.mute,  ack: true});
                    //player._isMuted = data.groupState.mute;
                    player._volume = data.newVolume;
                    adapter.log.debug(`group-volume: Volume for ${player.baseUrl}: ${data.newVolume}`);
                }
            }
        }
    } else if (event === 'group-mute') {
        //{
        //    uuid:         _this.uuid,
        //    previousMute: previousMute,
        //    newMute:      _this.groupState.mute,
        //    roomName:     _this.roomName
        //}
        //        for (i = 0; i < discovery.players.length; i++) {
        //            if (discovery.players[i].roomName === data.roomName) {
        //                player = discovery.getPlayerByUUID(discovery.players[i].uuid);
        const player = discovery.getPlayerByUUID(data.uuid);
        if (player) {
            player._address = player._address || getIp(player);

            const ip = player._address;

            if (channels[ip]) {
                //                    channels[ip].uuid = discovery.players[i].uuid;
                channels[ip].uuid = data.uuid;
                adapter.setState({ device: 'root', channel: ip, state: 'muted' }, { val: data.newMute, ack: true });
                //adapter.setState({device: 'root', channel: ip, state: 'muted'},  {val: data.groupState.mute,  ack: true});
                //player._isMuted = data.groupState.mute;
                player._isMuted = data.newMute;
                adapter.log.debug(`mute: Mute for ${player.baseUrl}: ${data.newMute}`);
                adapter.setState(
                    {
                        device: 'root',
                        channel: ip,
                        state: 'group_muted'
                    },
                    { val: player.groupState.mute, ack: true }
                );
                adapter.log.debug(`group_muted: groupMuted for ${player.baseUrl}: ${player.groupState.mute}`);
            }
        }
        //            }
        //        }
    } else if (event === 'volume') {
        // {
        //     uuid:             _this.uuid,
        //     previousVolume:   previousVolume,
        //     newVolume:        state.volume,
        //     roomName:         _this.roomName
        // }
        const player = discovery.getPlayerByUUID(data.uuid);
        if (player) {
            player._address = player._address || getIp(player);

            const ip = player._address;
            if (channels[ip]) {
                channels[ip].uuid = data.uuid;
                adapter.setState({ device: 'root', channel: ip, state: 'volume' }, { val: data.newVolume, ack: true });
                player._volume = data.newVolume;
                adapter.log.debug(`volume: Volume for ${player.baseUrl}: ${data.newVolume}`);
            }
        }
    } else if (event === 'treble') {
        // node-sonos-discovery is not emitting any events on treble changes yet, so it is not
        // possible to get the externally set treble value, yet.
    } else if (event === 'bass') {
        // node-sonos-discovery is not emitting any events on bass changes yet, so it is not
        // possible to get the externally set bass value, yet.
    } else if (event === 'mute') {
        // {
        //     uuid:        _this.uuid,
        //     previousMute: previousMute,
        //     newMute:     state.mute,
        //     roomName:    _this.roomName
        // }
        const player = discovery.getPlayerByUUID(data.uuid);
        if (player) {
            player._address = player._address || getIp(player);

            const ip = player._address;
            if (channels[ip]) {
                channels[ip].uuid = data.uuid;
                adapter.setState({ device: 'root', channel: ip, state: 'muted' }, { val: data.newMute, ack: true });
                player._isMuted = data.newMute;
                adapter.log.debug(`mute: Mute for ${player.baseUrl}: ${data.newMute}`);
            }
        }
    } else if (event === 'favorites') {
        try {
            discovery
                .getFavorites()
                .then(favorites => {
                    // Go through all players
                    for (let i = 0; i < discovery.players.length; i++) {
                        const player = discovery.players[i];
                        if (!player) {
                            continue;
                        }
                        player._address = player._address || getIp(player);

                        const ip = player._address;
                        channels[ip] && takeSonosFavorites(ip, favorites);
                    }
                })
                .catch(e => adapter.log.error(`Cannot getFavorites: ${e}`));
        } catch (err) {
            adapter.log.error(`Cannot getFavorites: ${err}`);
        }
    } else if (event === 'queue') {
        const player = discovery.getPlayerByUUID(data.uuid);
        if (player) {
            player._address = player._address || getIp(player);

            const ip = player._address;

            if (channels[ip]) {
                channels[ip].uuid = data.uuid;
                const _text = [];
                const _html = [];

                _html.push(`<table class="sonosQueueTable">`);
                for (let q = 0; q < data.queue.length; q++) {
                    _text.push(`${data.queue[q].artist} - ${data.queue[q].title}`);
                    _html.push(`
                        <tr class="sonosQueueRow" onclick="vis.setValue('${adapter.namespace}.root.${
                            player._address
                        }.current_track_number', ${q + 1})">
                        <td class="sonosQueueTrackNumber">${q + 1}</td>
                        <td class="sonosQueueTrackCover"><img src="${player.baseUrl}${data.queue[q].albumArtUri}"></td>
                        <td class="sonosQueueTrackArtist">${data.queue[q].artist}</td>
                        <td class="sonosQueueTrackAlbum">${data.queue[q].album}</td>
                        <td class="sonosQueueTrackTitle">${data.queue[q].title}</td>
                        </tr>
                        `);
                }
                _html.push(`</table>`);

                // Add script for auto-scroll playlist
                _html.push(`
                    <script>
                    let element = document.getElementById("currentTrack");
                    if (element != undefined) element.scrollIntoView({behavior: "auto", block: "start", inline: "nearest"});
                    </script>
                    `);

                const qtext = _text.join(', ');
                const qhtml = _html.join('');
                adapter.setState({ device: 'root', channel: ip, state: 'queue' }, { val: qtext, ack: true });
                adapter.log.debug(`queue for ${player.baseUrl}: ${qtext}`);
                adapter.setState({ device: 'root', channel: ip, state: 'queue_html' }, { val: qhtml, ack: true });
                adapter.log.debug(`queue for ${player.baseUrl}: ${qhtml}`);
            }
            discovery
                .getFavorites()
                .then(favorites => {
                    // Go through all players
                    for (let i = 0; i < discovery.players.length; i++) {
                        const player = discovery.players[i];

                        player._address = player._address || getIp(player);

                        const ip = player._address;
                        channels[ip] && takeSonosFavorites(ip, favorites);
                    }
                })
                .catch(e => adapter.log.error(`Cannot getFavorites: ${e}`));
        }
    } else {
        adapter.log.debug(`${event} ${typeof data === 'object' ? JSON.stringify(data) : data}`);
    }
}

// Update queue: highlight current track in html-queue
async function updateHtmlQueue(player, trackNumber) {
    //Get current html-queue
    const playerDp = `${adapter.namespace}.root.${player}`;
    let queue = await adapter.getStateAsync(`${playerDp}.queue_html`);
    if (!queue) {
        adapter.log.debug(`Update html-queue for ${player}: html-queue is empty`);
        return;
    }
    adapter.log.debug(`Update html-queue for ${player}: current html-queue is ${queue.val}`);

    //Remove old highlighting
    queue = queue.val.replace('class="sonosQueueRow currentTrack" id="currentTrack"', 'class="sonosQueueRow"');

    //Get current track number
    adapter.log.debug(`Update html-queue for ${player}: current track number is ${trackNumber}`);

    //Create RegEx pattern
    const regexPattern = `<tr class="sonosQueueRow" onclick="vis.setValue\\('sonos.[0-9].root.[0-9]{1,3}_[0-9]{1,3}_[0-9]{1,3}_[0-9]{1,3}.current_track_number', ${trackNumber}\\)">`;
    adapter.log.debug(`Update html-queue for ${player}: RegEx pattern is ${regexPattern}`);

    //Match current track in queue
    const regex = new RegExp(regexPattern, 'gm');
    const currentTrack = queue.match(regex);
    if (!currentTrack) {
        adapter.log.debug(`Update html-queue for ${player}: no RegEx match`);
        return;
    }
    adapter.log.debug(`Update html-queue for ${player}: got match ${currentTrack}`);

    //Add id and class to current track
    const currentTrackHighlight = currentTrack
        .toString()
        .replace('class="sonosQueueRow"', 'class="sonosQueueRow currentTrack" id="currentTrack"');
    adapter.log.debug(`Update html-queue for ${player}: new html string for current track is ${currentTrackHighlight}`);

    //Replace html for current track in queue
    queue = queue.replace(currentTrack, currentTrackHighlight);
    adapter.log.debug(`Update html-queue ${player}: new queue is ${queue}`);

    //set queue to dp
    adapter.setState(`${playerDp}.queue_html`, { val: queue, ack: true });
}

async function checkNewGroupStates(channel) {
    for (const g in newGroupStates) {
        let obj;
        try {
            obj = await adapter.getObjectAsync(`${channel._id}.${g}`);
        } catch {
            obj = null;
        }

        if (!obj) {
            const dcs = adapter.idToDCS(`${channel._id}.${g}`);
            await adapter.createStateAsync(dcs.device, dcs.channel, dcs.state, newGroupStates[g]);
        }
    }
}

async function syncConfig() {
    channels = {};

    const devices = await adapter.getDevicesAsync();

    adapter.log.debug(`Initialize known devices: ${JSON.stringify(devices)}`);
    if (devices && devices.length) {
        // Go through all devices
        for (let i = 0; i < devices.length; i++) {
            const _channels = await adapter.getChannelsOfAsync(devices[i].common.name);
            const configToDelete = [];
            const configToAdd = [];
            let k;
            if (adapter.config.devices) {
                for (k = 0; k < adapter.config.devices.length; k++) {
                    configToAdd.push(adapter.config.devices[k].ip);
                }
            }

            if (_channels) {
                adapter.log.debug(`Channels of ${devices[i].common.name}: ${JSON.stringify(_channels)}`);
                for (let j = 0; j < _channels.length; j++) {
                    adapter.log.debug(`Process channel: ${_channels[j]._id}`);
                    const ip = _channels[j].native.ip;
                    const id = ip.replace(/[.\s]+/g, '_');
                    const pos = configToAdd.indexOf(ip);
                    if (pos !== -1) {
                        await checkNewGroupStates(_channels[j]);
                        configToAdd.splice(pos, 1);
                        // Check name and room
                        for (let u = 0; u < adapter.config.devices.length; u++) {
                            if (adapter.config.devices[u].ip === ip) {
                                if (
                                    _channels[j].common.name !==
                                    (adapter.config.devices[u].name || adapter.config.devices[u].ip)
                                ) {
                                    await adapter.extendObjectAsync(_channels[j]._id, {
                                        common: {
                                            name: adapter.config.devices[u].name || adapter.config.devices[u].ip
                                        },
                                        type: 'channel'
                                    });
                                }
                                if (adapter.config.devices[u].room) {
                                    // BF 2021.12.20: there is an error in js-controller 3.3
                                    adapter.addChannelToEnum('room', adapter.config.devices[u].room, 'root', id);
                                    // When js-controller 4.x will be common, replace it with
                                    // await adapter.addChannelToEnumAsync('room', adapter.config.devices[u].room, 'root', id);
                                } else {
                                    try {
                                        await adapter.deleteChannelFromEnumAsync('room', 'root', id);
                                    } catch (err) {
                                        adapter.log.error(`Cannot delete channel from enum: ${err.message}`);
                                    }
                                }
                            }
                        }

                        const sId = ip.replace(/[.\s]+/g, '_');
                        channels[sId] = {
                            uuid: '',
                            player: null,
                            duration: 0,
                            elapsed: 0,
                            obj: _channels[j]
                        };
                        await adapter.setStateAsync(`root.${sId}.alive`, false, true);
                        aliveIds.push(`root.${sId}.alive`);
                    } else {
                        configToDelete.push(ip);
                    }
                }
            }

            if (configToAdd.length) {
                for (let r = 0; r < adapter.config.devices.length; r++) {
                    if (adapter.config.devices[r].ip && configToAdd.includes(adapter.config.devices[r].ip)) {
                        const obj = await addChannel(
                            adapter.config.devices[r].name,
                            adapter.config.devices[r].ip,
                            adapter.config.devices[r].room
                        );
                        const _obj = await adapter.getObjectAsync(obj.id);
                        const sId = _obj.native.ip.replace(/[.\s]+/g, '_');
                        aliveIds.push(`root.${sId}.alive`);

                        channels[sId] = {
                            uuid: '',
                            player: null,
                            duration: 0,
                            elapsed: 0,
                            obj: _obj
                        };
                    }
                }
            }

            if (configToDelete.length) {
                for (let e = 0; e < configToDelete.length; e++) {
                    if (configToDelete[e]) {
                        const _id = configToDelete[e].replace(/[.\s]+/g, '_');
                        await adapter.deleteChannelFromEnumAsync('room', 'root', _id);
                        await adapter.deleteChannelAsync('root', _id);
                    }
                }
            }
        }
    } else {
        for (let r = 0; r < adapter.config.devices.length; r++) {
            if (!adapter.config.devices[r].ip) {
                continue;
            }
            const obj = await addChannel(
                adapter.config.devices[r].name,
                adapter.config.devices[r].ip,
                adapter.config.devices[r].room
            );
            const _obj = adapter.getObjectAsync(obj.id);
            channels[_obj.native.ip.replace(/[.\s]+/g, '_')] = {
                uuid: '',
                player: null,
                duration: 0,
                elapsed: 0,
                obj: _obj
            };
        }
    }
}

let discovery = null;
const queues = {};
let cacheDir = '';

function main() {
    adapter.config.fadeIn = parseInt(adapter.config.fadeIn, 10) || 0;
    adapter.config.fadeOut = parseInt(adapter.config.fadeOut, 10) || 0;
    syncConfig().then(() => {
        cacheDir = path.join(utils.getAbsoluteDefaultDataDir(), 'sonosCache') + path.sep;

        // create directory for cached files
        !fs.existsSync(cacheDir) && fs.mkdirSync(cacheDir);

        discovery = new SonosDiscovery({
            household: null,
            log: adapter.log, //logger,
            cacheDir: cacheDir,
            port: adapter.config.webserverPort
        });

        // from here the code is mostly from https://github.com/jishi/node-sonos-web-controller/blob/master/server.js

        discovery.on('topology-change', data => {
            socketServer && socketServer.sockets.emit('topology-change', discovery.players);
            processSonosEvents('topology-change', data);
        });

        discovery.on('transport-state', data => {
            socketServer && socketServer.sockets.emit('transport-state', data);
            processSonosEvents('transport-state', data);
        });

        discovery.on('group-volume', data => {
            socketServer && socketServer.sockets.emit('group-volume', data);
            processSonosEvents('group-volume', data);
        });

        discovery.on('volume-change', data => {
            socketServer && socketServer.sockets.emit('volume', data);
            processSonosEvents('volume', data);
        });

        discovery.on('group-mute', data => {
            socketServer && socketServer.sockets.emit('group-mute', data);
            processSonosEvents('group-mute', data);
        });

        discovery.on('mute-change', data => {
            socketServer && socketServer.sockets.emit('mute', data);
            processSonosEvents('mute', data);
        });

        discovery.on('favorites', data => {
            socketServer && socketServer.sockets.emit('favorites', data);
            processSonosEvents('favorites', data);
        });

        discovery.on('queue-change', player => {
            //console.log('queue-change', data);
            return player
                .getQueue()
                .then(queue => {
                    queues[player.uuid] = queue;
                    return queue;
                })
                .then(queue => {
                    socketServer && socketServer.sockets.emit('queue', { uuid: player.uuid, queue });
                    processSonosEvents('queue', { uuid: player.uuid, queue });
                })
                .catch(e => adapter.log.error(`Cannot loadQueue: ${e}`));
        });

        discovery.on('list-change', data => {
            //console.log('queue-change', data);
            socketServer && socketServer.sockets.emit('favorites', data);
            processSonosEvents('favorites', data);
        });

        adapter.subscribeStates('*');
    });
}

/**
 * Clear legacy binary states, as we migrated to files
 */
async function clearLegacyBinaryStates() {
    const coverStates = await adapter.getStatesAsync('*.cover_png');
    const ttsStates = await adapter.getStatesAsync('TTS.tts*');

    for (const id of [...Object.keys(coverStates), ...Object.keys(ttsStates)]) {
        await adapter.delObjectAsync(id);
    }
}

// If started as allInOne mode => return function to create instance
if (module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
