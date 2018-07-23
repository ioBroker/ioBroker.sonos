/**
 *      ioBroker Sonos Adapter
 *      12'2013-2016 Bluefox <dogafox@gmail.com>
 *
 *      derived from https://github.com/jishi/node-sonos-web-controller by Jimmy Shimizu
 */
'use strict';
const loglevel = process.argv[3] || 'info';
const utils    = require(__dirname + '/lib/utils'); // Get common adapter utils
const tools    = require(utils.controllerDir + '/lib/tools.js');
const logger   = require(utils.controllerDir + '/lib/logger.js')(loglevel, [utils.appName], undefined, 'sonos');
const adapter  = new utils.Adapter('sonos');
const async    = require('async');
const aliveIds = [];

// {"val": state, "ack":false, "ts":1408294295, "from":"admin.0", "lc":1408294295}
// id = sonos.0.192_168_1_55.state
adapter.on('stateChange', (_id, state) => {
    if (!state || state.ack) return;
    adapter.log.info('try to control id ' + _id + ' with ' + JSON.stringify(state));
    // Try to find the object
    const id = adapter.idToDCS(_id);

    if (id && id.channel && channels[id.channel]) {
        if (state.val === 'false') state.val = false;
        if (state.val === 'true')  state.val = true;
        if (parseInt(state.val) == state.val) state.val = parseInt(state.val);

        let player = channels[id.channel].player;
        if (!player) {
            player = discovery.getPlayerByUUID(channels[id.channel].uuid);
            channels[id.channel].player = player;
        }
        if (player) {
            if (id.state === 'state_simple') {
                if (!state.val) {
                    player.pause();
                } else {
                    player.play();
                }
            } else
            if (id.state === 'shuffle') {
                player.shuffle(!!state.val);
            } else
            if (id.state === 'crossfade') {
                player.crossfade(!!state.val);
            } else
            if (id.state === 'repeat') {
                if (state.val === 0 || state.val === '0') {
                    player.repeat('none');
                } else if (state.val === 1 || state.val === '1') {
                    player.repeat('all');
                } else if (state.val === 2 || state.val === '2') {
                    player.repeat('one');
                } else {
                    player.repeat(state.val);
                }
            } else
            if (id.state === 'play') {
                if (!!state.val) {
                    player.play(); // !! is toBoolean()
                }
            } else
            if (id.state === 'stop') {
                if (!!state.val) {
                    player.pause(); // !! is toBoolean()
                }
            } else
            if (id.state === 'pause') {
                if (!!state.val) {
                    player.pause(); // !! is toBoolean()
                }
            } else
            if (id.state === 'next') {
                if (!!state.val) {
                    player.nextTrack(); // !! is toBoolean()
                }
            } else
            if (id.state === 'prev') {
                if (!!state.val) {
                    player.previousTrack(); // !! is toBoolean()
                }
            } else
            if (id.state === 'seek') {
                state.val  = parseFloat(state.val);
                if (state.val < 0)   state.val = 0;
                if (state.val > 100) state.val = 100;
                player.timeSeek(Math.round((channels[id.channel].duration * state.val) / 100));
            } else
            if (id.state === 'current_elapsed') {
                state.val  = parseInt(state.val, 10);
                player.timeSeek(state.val);
            } else
            if (id.state === 'current_elapsed_s') {
                const parts = state.val.toString().split(':');
                let seconds;
                if (parts === 3) {
                    seconds = parseInt(parts[0]) * 3600;
                    seconds += parseInt(parts[1]) * 60;
                    seconds = parseInt(parts[2]);
                } else if (parts === 2) {
                    seconds = parseInt(parts[0]) * 60;
                    seconds += parseInt(parts[1]);
                } else if (parts === 1) {
                    seconds = parseInt(parts[0]);
                } else {
                    adapter.log.error('Invalid elapsed time: ' + state.val);
                    return;
                }
                player.timeSeek(seconds);
            } else
            if (id.state === 'muted') {
                if (!!state.val) {
                    player.mute(); // !! is toBoolean()
                } else {
                    player.unMute(); // !! is toBoolean()
                }
            } else
            if (id.state === 'volume') {
                player.setVolume(state.val);
            } else //stop,play,pause,next,previous,mute,unmute
            if (id.state === 'state') {
                if (state.val && typeof state.val === 'string') {
                    state.val = state.val.toLowerCase();
                    switch (state.val) {
                        case 'stop':
                            player.pause();
                            break;
                        case 'play':
                            player.play();
                            break;
                        case 'pause':
                            player.pause();
                            break;
                        case 'next':
                            player.nextTrack();
                            break;
                        case 'previous':
                            player.previousTrack();
                            break;
                        case 'mute':
                            player.mute();
                            break;
                        case 'unmute':
                            player.unMute();
                            break;
                        default:
                            adapter.log.warn('Unknown state: ' + state.val);
                            break;
                    }
                } else {
                    adapter.log.warn('Invalid state: ' + state.val);
                }
            } else if (id.state === 'favorites_set') {
                player.replaceWithFavorite(state.val).then(() => {
                    player.play();
                    adapter.setState({device: 'root', channel: id.channel, state: 'current_album'},  {val: state.val, ack: true});
                    adapter.setState({device: 'root', channel: id.channel, state: 'current_artist'}, {val: state.val, ack: true});
                }, error =>adapter.log.error('Cannot replaceWithFavorite: ' + error));
            } else
            if (id.state === 'tts') {
                adapter.log.debug('Play TTS file ' + state.val + ' on ' + id.channel);
                text2speech(state.val, id.channel);
            } else if (id.state === 'add_to_group') {
                addToGroup(state.val, player); //xxxx
            } else if (id.state === 'remove_from_group') {
                removeFromGroup(state.val, player);
            } else if (id.state === 'coordinator') {
                if (state.val === id.channel) {
                    player.becomeCoordinatorOfStandaloneGroup();
                } else {
                    attachTo(player, getPlayerByName(state.val));
                }
            } else if (id.state === 'group_volume') {
                player.setGroupVolume(state.val);
            } else if (id.state === 'group_muted') {
                if (!!state.val) {
                    player.muteGroup(); // !! is toBoolean()
                } else {
                    player.unMuteGroup(); // !! is toBoolean()
                }
            } else {
                adapter.log.warn('try to control unknown id ' + JSON.stringify(id));
            }
        } else {
            adapter.log.warn('SONOS "' + channels[id.channel].uuid + '" not found');
        }
    }
});

adapter.on('install', () => adapter.createDevice('root', {}));

adapter.on('unload', callback => {
    try {
        if (adapter) {
            if (adapter.setState) {
                aliveIds.forEach(id => {
                    adapter.setState(id, false, true);
                });
            }

            adapter.log && adapter.log.info && adapter.log.info('terminating');

            if (adapter.config && adapter.config.webserverEnabled && socketServer && socketServer.server) {
                socketServer.server.close();
            }
        }
        callback();
    } catch (e) {
        callback();
    }
});

adapter.on('ready', () => {
    adapter.getObject(adapter.namespace + '.root', (err, obj) => {
        if (!obj || !obj.common || !obj.common.name) {
            adapter.createDevice('root', {}, () => main());
        } else {
            main ();
        }
    });
});

// New message arrived. obj is array with current messages
adapter.on('message', obj => {
    let wait = false;
    if (obj) {
        switch (obj.command) {
            case 'send':
                if (obj.message) text2speech(obj.message);
                break;

            /*case 'add':
                wait = true;
                if (obj.message) {
                    addChannel(obj.message, [], function (err) {
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, err, obj.callback);
                    });
                } else {
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Invalid IP address: ' + obj.message, obj.callback);
                }
                break;*/

            case 'browse':
                browse(res => obj.callback && adapter.sendTo(obj.from, obj.command, res, obj.callback));
                wait = true;
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
                adapter.log.warn('Unknown command: ' + obj.command);
                break;
        }
    }

    if (!wait && obj.callback) {
        adapter.sendTo(obj.from, obj.command, obj.message, obj.callback);
    }

    return true;
});

const io             = require('socket.io');
const http           = require('http');
const Static         = require('node-static');
const fs             = require('fs');
const crypto         = require('crypto');
const SonosDiscovery = require('sonos-discovery');
const path           = require('path');
// const dgram          = require('dgram');

let channels    = {};
let server;        // Sonos HTTP server
let socketServer;  // Sonos socket for HTTP Server
let lastCover =   null;

function toFormattedTime(time) {
    let hours = Math.floor(time / 3600);
    hours = (hours) ? (hours + ':') : '';
    let min = Math.floor(time / 60) % 60;
    if (min < 10) min = '0' + min;
    let sec = time % 60;
    if (sec < 10) sec = '0' + sec;

    return hours + min + ':' + sec;
}
const newGroupStates = {
    'add_to_group': {
        def:   '',
        type:  'string',
        read:  false,
        write: true,
        role:  'media',
        desc:  'Add a Player to a Group (Player to remove, Coordinator)'
    },
    'remove_from_group': {
        def:   '',
        type:  'string',
        read:  false,
        write: true,
        role:  'media',
        desc:  'Remove a Player to a Group (Player to remove, Coordinator)'
    },
    'coordinator': {     // master of group
        def:    '',
        type:   'string',
        read:   true,
        write:  true,
        role:   'media.coordinator',
        desc:   'Indicates coordinator of group'
    },
    'group_volume': {
        type:   'number',
        read:   true,
        write:  true,
        role:   'level.volume.group',
        min:    0,
        max:    100,
        desc:   'State and control of group volume'
        },
    'group_muted': {
        def:    false,
        type:   'boolean',
        read:   true,
        write:  true,
        role:   'media.mute.group',
        min:    false,
        max:    true,
        desc:   'Group is muted'
    },
    'members': {             // indicator.reachable -    if player alive (read only)
        type:   'string',
        read:   true,
        write:  false,
        role:   'indicator.members',
        desc:   'Group members'
    },
    'membersChannels': {             // indicator.reachable -    if player alive (read only)
        type:   'string',
        read:   true,
        write:  false,
        role:   'indicator.members',
        desc:   'Group members Channels'
    }
};

function createChannel(name, ip, room, callback) {
    const states = {
        'state_simple': {      // media.state -            Text state of player: stop, play, pause (read, write)
            def:    false,
            type:   'boolean',
            read:   true,
            write:  true,
            role:   'media.state',
            desc:   'Play or pause',
            name:   'Binary play/pause state'
        },
        'play': {      // play command
            type:   'boolean',
            read:   false,
            write:  true,
            role:   'button.play',
            desc:   'play',
            name:   'Play button'
        },
        'stop': {      // stop command
            type:   'boolean',
            read:   false,
            write:  true,
            role:   'button.stop',
            desc:   'stop',
            name:   'Stop button'
        },
        'pause': {      // pause command
            type:   'boolean',
            read:   false,
            write:  true,
            role:   'button.pause',
            desc:   'pause',
            name:   'Pause button'
        },
        'prev': {      // prev command
            type:   'boolean',
            read:   false,
            write:  true,
            role:   'button.prev',
            desc:   'prev',
            name:   'Previous button'
        },
        'next': {      // next command
            type:   'boolean',
            read:   false,
            write:  true,
            role:   'button.next',
            desc:   'next',
            name:   'Next button'
        },
        'seek': {      // seek command and indication
            type:   'number',
            read:   true,
            write:  true,
            unit:   '%',
            min:    0,
            max:    100,
            role:   'media.seek',
            desc:   'Seek position in percent',
            name:   'Seek position'
        },
        'state': {             // media.state -            Text state of player: stop, play, pause (read, write)
            def:    'stop',
            type:   'string',
            read:   true,
            write:  true,
            values: 'stop,play,pause,next,previous,mute,unmute',
            role:   'media.state',
            desc:   'Play, stop, or pause, next, previous, mute, unmute',
            name:   'String state'
        },
        'volume': {            // level.volume -           volume level (read, write)
            type:   'number',
            read:   true,
            write:  true,
            role:   'level.volume',
            min:    0,
            max:    100,
            desc:   'State and control of volume',
            name:   'Player volume'
        },
        'muted': {             // media.muted -            is muted (read only)
            def:    false,
            type:   'boolean',
            read:   true,
            write:  true,
            role:   'media.mute',
            min:    false,
            max:    true,
            desc:   'Is muted',
            name:   'Player mute'
        },
        'current_title': {     // media.current.title -    current title (read only)
            def:    '',
            type:   'string',
            read:   true,
            write:  false,
            role:   'media.title',
            desc:   'Title of current played song',
            name:   'Current title'
        },
        'current_artist': {    // media.current.artist -   current artist (read only)
            def:    '',
            type:   'string',
            read:   true,
            write:  false,
            role:   'media.artist',
            desc:   'Artist of current played song',
            name:   'Current artist'
        },
        'current_album': {     // media.current.album -    current album (read only)
            def:    '',
            type:   'string',
            read:   true,
            write:  false,
            role:   'media.album',
            desc:   'Album of current played song',
            name:   'Current album'
        },
        'current_cover': {     // media.current.cover -    current url to album cover (read only)
            def:    '',
            type:   'string',
            read:   true,
            write:  false,
            role:   'media.cover',
            desc:   'Cover image of current played song',
            name:   'Current cover URL'
        },
        'current_duration': {  // media.current.duration - duration as HH:MM:SS (read only)
            def:    0,
            type:   'number',
            read:   true,
            write:  false,
            unit:   'seconds',
            role:   'media.duration',
            desc:   'Duration of current played song in seconds',
            name:   'Current song duration'
        },
        'current_duration_s': {// media.current.duration - duration in seconds (read only)
            def:    '00:00',
            type:   'string',
            read:   true,
            write:  false,
            unit:   'interval',
            role:   'media.duration.text',
            desc:   'Duration of current played song as HH:MM:SS',
            name:   'Current duration'
        },
        'current_type': {             // media.type -            type of stream (read only)
            def:    0,
            type:   'number',
            read:   true,
            write:  false,
            role:   'media.type',
            states: {0: 'track', 1: 'radio'},
            desc:   'Type of Stream (0 = track, 1 = radio)',
            name:   'Current stream type'
        },
        'alive': {             // indicator.reachable -    if player alive (read only)
            type:   'boolean',
            read:   true,
            write:  false,
            role:   'indicator.reachable',
            desc:   'If sonos alive or not',
            name:   'Connection status'
        },
        'current_elapsed': {   // media.current.elapsed -  elapsed time in seconds
            def:    0,
            type:   'number',
            read:   true,
            write:  true,
            unit:   'seconds',
            role:   'media.elapsed',
            desc:   'Elapsed time of current played song in seconds',
            name:   'Elapsed time in seconds'
        },
        'current_elapsed_s': { // media.current.elapsed -  elapsed time in HH:MM:SS
            def:    '00:00',
            type:   'string',
            read:   true,
            write:  true,
            unit:   'interval',
            role:   'media.elapsed.text',
            desc:   'Elapsed time of current played song as HH:MM:SS',
            name:   'Elapsed time as text'
        },
        'favorites_list': {    // media.favorites.list -   list of favorites channel (read only)
            def:    '',
            type:   'string',
            read:   true,
            write:  false,
            role:   'media.favorites.list',
            desc:   'List of favorites song or stations, divided by comma',
            name:   'Favorites list'
        },
        'favorites_set': {     // media.favorites.set -    select favorites from list (write only)
            def:    '',
            type:   'string',
            read:   false,
            write:  true,
            role:   'media.favorites.set',
            desc:   'Set favorite from the list to play',
            name:   'Favorites set'
        },
        'tts': {     // play text to speech mp3 file
            def:    '',
            type:   'string',
            read:   false,
            write:  true,
            role:   'media.tts',
            desc:   'Set text2speech mp3 file to play',
            name:   'Text to speech'
        },
        'shuffle': { // Shuffle mode: true or false
            def:    false,
            type:   'boolean',
            read:   true,
            write:  true,
            role:   'media.mode.shuffle',
            desc:   'Shuffle mode',
            name:   'Shuffle'
        },
        'repeat': { // repeat mode: true or false
            def:    0,
            type:   'number',
            read:   true,
            write:  true,
            role:   'media.mode.repeat',
            states: {0: 'none', 1: 'all', 2: 'one'},
            desc:   'Repeat mode',
            name:   'Repeat'
        },
        'crossfade': { // crossfade mode: true or false
            def:    false,
            type:   'boolean',
            read:   true,
            write:  true,
            role:   'media.mode.crossfade',
            desc:   'Crossfade mode',
            name:   'Crossfade'
        },

    };

    for (const g in newGroupStates) {
        states[g] = newGroupStates[g];
    }

    const states_list = [];
    for (const state in states) {
        states_list.push(state);
    }
    const id = ip.replace(/[.\s]+/g, '_');

    adapter.createChannel('root', id, 
        {
            role: 'media.music',
            name: name || ip
        }, 
        {
            ip: ip
        }, 
        (err, obj) => callback && callback(err, obj)
    );

    if (room) {
        adapter.addChannelToEnum('room', room, 'root', id);
    }
    for (let j = 0; j < states_list.length; j++) {
        adapter.createState('root', id, states_list[j], states[states_list[j]]);
    }
    // Create cover object
    adapter.setForeignObject(adapter.namespace + '.root.' + id + '.cover_png',
        {
            _id: adapter.namespace + '.root.' + id + '.cover_png',
            common: {
                name:   'Cover URL',
                type:   'file',
                read:   true,
                write:  true,
                role:   'media.current.cover',
                desc:   'Cover image of current played song as binary'
            },
            native: {},
            type: 'state'
        }, 
        err => err && adapter.log.error(err)
    );
}

function browse(callback) {
    const result = [];
    for (let i = 0; i < discovery.players.length; i++) {
        result.push({roomName: discovery.players[i].roomName, ip: getIp(discovery.players[i], true)});
    }

    if (callback) callback(result);

    /*
    const strngtoXmit = new Buffer(["M-SEARCH * HTTP/1.1",
        "HOST: 239.255.255.250:reservedSSDPport",
        "MAN: ssdp:discover",
        "MX: 1",
        "ST: urn:schemas-upnp-org:device:ZonePlayer:1"].join("\r\n"));

    // Create a new socket
    const server = dgram.createSocket('udp4');
    const result = [];

    if (server) {
        server.on("error", function (err) {
            console.log("ERROR: " + err);
            server.close();
            if (callback) callback('ERROR - Cannot send request: ' + err);
        });

        server.bind (53004, "0.0.0.0");

        server.on("message", function (msg, rinfo) {
            const str = msg.toString();
            if (str.indexOf ("Sonos") !== -1) {
                console.log (rinfo.address);
                result.push({name: rinfo.name, ip: rinfo.address});
            }
        });

        setTimeout (function () {
            server.close();
            console.log ("Send:" + result);
            if (callback) callback(result);
        }, 2000);

        server.send (strngtoXmit, 0, strngtoXmit.length, 1900, "239.255.255.250", function (err, bytes) {
            if (err) {
                console.log("ERROR - Cannot send request: " + err);
                server.close();
                if (callback) callback('ERROR - Cannot send request: ' + err);
            }
        });
    }*/
}

let currentFileNum = 0;
function text2speech(fileName, sonosIp, callback) {
    // Extract volume
    let volume = null;

    const pos = fileName.indexOf(';');
    if (pos !== -1) {
        volume = fileName.substring(0, pos);
        fileName = fileName.substring(pos + 1);
    }

    if (fileName && !fileName.match(/^http(s)?:\/\//)) {
        if (!adapter.config.webserverEnabled) {
            adapter.log.warn('Web server must be enabled to play TTS');
            return;
        }

        const parts = fileName.split('.');
        const dest  = 'tts' + (currentFileNum++) + '.' + parts[parts.length - 1];
        if (currentFileNum > 10) currentFileNum = 0;
        // Copy this file
        if (fileName !== path.join(cacheDir, dest)) {
            try {
                fs.createReadStream(fileName).pipe(fs.createWriteStream(path.join(cacheDir, dest)));
            } catch (e) {
                adapter.log.error(e);
                return;
            }
        }
        fileName = 'http://' + discovery.localEndpoint + ':' + adapter.config.webserverPort + '/tts/' + dest;
    }
    if (sonosIp) sonosIp = sonosIp.replace(/[.\s]+/g, '_');

    // Play on all players
    for (let i = 0; i < discovery.players.length; i++) {
        if (!discovery.players[i]._address) discovery.players[i]._address = getIp(discovery.players[i]);

        const ip = discovery.players[i]._address;

        if (sonosIp && ip !== sonosIp) continue;
        setTimeout(playOnSonos, 10, fileName, discovery.players[i].uuid, volume);
    }

    if (callback) callback();
}

function fadeIn(player, to, options, callback) {
    if (!adapter.config.fadeIn && !adapter.config.fadeOut) {
        if (typeof options === 'function') callback = options;
        player.setVolume(to);
        if (callback) callback();
        return;
    }

    if (options === undefined || typeof options === 'function') {
        to = parseInt(to, 10);
        callback = options;
        options = {
            duration: adapter.config.fadeIn
        };
        if (!options.duration) {
            player.setVolume(to);
            if (callback) callback();
            return;
        }
        options.step   = Math.round(to / Math.max(options.duration / 100, 1));
        options.actual = 0;
    }

    adapter.log.debug('>> fadeIn to ' + options.actual + ' of ' + to + ' caller: ' + (arguments.callee.caller ? arguments.callee.caller.name : 'null'));

    options.actual += options.step;

    if (options.actual >= to) {
        adapter.log.debug('<< fadeIn to ' + to + ' caller: ' + (arguments.callee.caller ? arguments.callee.caller.name : 'null'));
        player.setVolume(to);
        if (callback) callback();
    } else {
        player.setVolume(options.actual);
        setTimeout(fadeIn, 100, player, to, options, callback);
    }
}

function fadeOut(player, options, callback) {
    if ((!adapter.config.fadeIn && !adapter.config.fadeOut) || (typeof options === 'boolean' && options === false)) {
        if (typeof options === 'function') callback = options;
        if (callback) callback(typeof options === 'boolean' && options);
        return;
    }

    if (options === undefined || typeof options === 'function') {
        callback = options;
        options = {
            duration: parseInt(adapter.config.fadeOut, 10) || 0
        };
        if (!options.duration) {
            player.setVolume(0);
            if (callback) callback();
            return;
        }
        options.actual = parseInt(player._volume, 10);
        options.step   = Math.round(options.actual / Math.max(options.duration / 100, 1));
    }
    options.actual -= options.step;

    if (!player._isMute && options.actual > 0 && player.state.currentState === 'PLAYING') {
        player.setVolume(options.actual);
        adapter.log.debug('>> fadeOut: setVolume: ' + options.actual);
        setTimeout(fadeOut, 100, player, options, callback);
    } else {
        player.setVolume(0);
        adapter.log.debug('<< fadeOut ');
        if (callback) callback ();
    }
}

function startPlayer(player, volume, noFadeIn, start) {
    adapter.log.debug('startPlayer volume: ' + volume + ' start=' + start + ' player.queuedTts.length=' + (player.queuedTts && player.queuedTts.length ? player.queuedTts.length : 0));
    //fadeOut(player);

    if (start || noFadeIn) player.play();

    if (!noFadeIn) {
        fadeIn(player, volume);
    } else {
        player.setVolume(volume);
    }
}

//////////////////
// Group management

function getPlayerByName(name) {
    for (const i in discovery.players) {
        if (!discovery.players.hasOwnProperty(i)) continue;
        const player = discovery.players[i];
        if (player.roomName === name || getIp(player) === name || player._address === name || player.uuid === name) {
            return player;
        }
    }
}

function attachTo(player, coordinator) {
    player.setAVTransport('x-rincon:' + coordinator.uuid);
}

function addToGroup(playerNameToAdd, coordinator) {
    if (typeof coordinator === 'string') coordinator = getPlayerByName(coordinator);
    const playerToAdd = getPlayerByName(playerNameToAdd);
    if(!coordinator || !playerToAdd) {
        return;
    }
    attachTo(playerToAdd, coordinator);
}

function removeFromGroup(leavingName, coordinator) {
    if (typeof coordinator === 'string') coordinator = getPlayerByName(coordinator);
    const leavingPlayer = getPlayerByName(leavingName);
    if (!coordinator || !leavingPlayer) {
        return;
    }
    if (leavingPlayer.coordinator === coordinator) {
        leavingPlayer.becomeCoordinatorOfStandaloneGroup();
    } else if (coordinator.coordinator === leavingPlayer) {
        coordinator.becomeCoordinatorOfStandaloneGroup();
    }
    //else {
    //    attachTo(leavingPlayer, coordinator)
    //}
}


/////////////

const audioExtensions = ['mp3', 'aiff', 'flac', 'less', 'wav'];

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//const GetPositionInfo = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>' +
//    '<u:GetPositionInfo xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><Channel>Master</Channel></u:GetPositionInfo>';
//
//XmlEntities = require(__dirname + '/node_modules/sonos-discovery/node_modules/html-entities/lib/xml-entities').XmlEntities;
//
/*
function getPositionInfo(player, callback) {
    player.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#GetPositionInfo"', GetPositionInfo, function(succ, res) {
        if (succ) {
            const data = '';
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                data += chunk.toString();
            });
            res.on('end', function () {
                // Find queued element

                const pos = data.indexOf('<TrackMetaData>');
                if (pos !== -1) {
                    data = data.substring(pos + '<TrackMetaData>'.length);
                    pos = data.indexOf('<');
                    if (pos !== -1) {
                        data = data.substring(0, pos);
                        callback(true, data);
                    }
                }
            });
        }
    });
}
*/
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function playOnSonos(uri, sonosUuid, volume) {
    const now = Date.now();
    const player = discovery.getPlayerByUUID(sonosUuid);
    let noFadeOut = false;
    if (!uri) { // stop actual tts
        if (player.tts) player.pause();
        return;
    }

    if (!player.tts || now - player.tts.time > 30000) {
        adapter.log.debug('Play on sonos[' + sonosUuid + ']: ' + uri + ', Volume: ' + volume);
        if (player.prevTts && now - player.prevTts.ts <= 2000) { // use prev player state also for next tts
            player.tts = player.prevTts;
            player.prevTts = null;
            noFadeOut = true;
        } else if (!player.tts) {
            player.tts = JSON.parse(JSON.stringify(player.state)); // only get akt payer state, if no previous
            player.tts.avTransportUriMetadata = player.avTransportUriMetadata;
        }
        adapter.log.debug('player.tts= volume=' + player.tts.volume + ' currentTrack.uri=' + player.tts.currentTrack.uri + ' tts.playbackState=' + player.tts.playbackState);
        //player.tts.ourUri = uri;
        player.tts.time = now;
    } else {
        adapter.log.debug('Queue on sonos[' + sonosUuid + ']: ' + uri + ', Volume: ' + volume);
        player.queuedTts = player.queuedTts || [];
        player.queuedTts.push({uri: uri, volume: volume});
        return;
    }

    //const oldVolume = player._volume;
    //const oldIsMute = player._isMute;
    //
    //if (volume === 'null' || volume === 'undefined') volume = 0;
    //
    //if (volume && oldVolume != volume) {
    //    player.setVolume(volume);
    //}
    //if (oldIsMute) player.groupMute(false);

    const parts = player.tts.currentTrack.uri ? player.tts.currentTrack.uri.split('.') : ['none'];

    if (player.tts.currentTrack.uri &&
        ((player.tts.currentTrack.uri.indexOf('x-file-cifs:') !== -1) ||
         (player.tts.currentTrack.uri.indexOf('x-sonos-spotify:') !== -1) ||
         (player.tts.currentTrack.uri.indexOf('x-sonosapi-hls-static:') !== -1) ||
         (audioExtensions.indexOf(parts[parts.length - 1]) !== -1))
       ) {
        player.tts.radio = false;

        player.addURIToQueue(uri).then(res => {
            // Find out added track
            if (!player.tts) {
                //adapter.log.warn('Cannot restore sonos state');
                adapter.log.warn('Cannot add track (URI) to Sonos Queue');
                return;
            }
            player.tts.addedTrack = parseInt(res.firsttracknumberenqueued, 10);

            fadeOut(player, noFadeOut, noFadeIn => {
                adapter.log.debug('player.seek: ' + player.tts.addedTrack);

                player.trackSeek(player.tts.addedTrack).then(() => {
                    // Send command PLAY
                    startPlayer(player, volume, noFadeIn, player.tts.playbackState !== 'PLAYING');
                });
            });
        });
    } else {
        if (player.tts.currentTrack && player.tts.currentTrack.uri) {
            const parts = player.tts.currentTrack.uri.split(':');
            adapter.log.debug('Detected RADIO, because of: ' + parts[0]);
        }

        // Radio
        player.tts.radio = true;
        fadeOut(player, noFadeOut, noFadeIn => {
            adapter.log.debug('setAVTransport: ' + uri);

            player.setAVTransport(uri).then(res => {
                // Send command PLAY
                startPlayer(player, volume, noFadeIn, true);
            });
        });
    }
}

function addChannel(name, ip, room, callback) {
    adapter.getObject('root', (err, obj) => {
        if (err || !obj) {
            // if root does not exist, channel will not be created
            adapter.createDevice('root', [], () => createChannel(name, ip, room, callback));
        } else {
            createChannel(name, ip, room, callback);
        }
    });
}

function resetTts(player) {
    //adapter.log.debug('setting tts = null' + (arguments.callee.caller.name !== undefined ? arguments.callee.caller.name : 'no caller'));
    if (!player.tts) return;
    player.prevTts = player.tts;
    player.prevTts.ts = new Date().getTime();
    player.tts = null;
}

function _getPs(playbackState) {
    const ps = {playing: false, paused: false, transitioning: false, stopped: false};
    switch (playbackState) {
        case 'PLAYING':         ps.playing       = true; break;
        case 'PAUSED_PLAYBACK': ps.paused        = true; break;
        case 'STOPPED':         ps.stopped       = true; break;
        case 'TRANSITIONING':   ps.transitioning = true; break;
    }
    return ps;
}

function takeSonosState(ip, sonosState) {
    adapter.setState({device: 'root', channel: ip, state: 'alive'}, {val: true, ack: true});
    const ps = _getPs(sonosState.playbackState);
    const player = discovery.getPlayerByUUID(channels[ip].uuid);
    const playMode = sonosState.playMode;

    if (!player.tts && player.queuedTts && player.queuedTts.length) {
        const q = player.queuedTts.shift();
        const uuid = channels[ip].uuid;
        adapter.log.debug('Taking next queue entry, tts=' + (!!player.tts) + 'playState=' + sonosState.playbackState);
        setImmdiate(() => playOnSonos(q.uri, uuid, q.volume));
    }

    adapter.log.debug('>  playbackState: ' + sonosState.playbackState + ' - ' + (sonosState.currentTrack && sonosState.currentTrack.title ? sonosState.currentTrack.title : ''));

    if (!ps.transitioning) {
        adapter.setState({device: 'root', channel: ip, state: 'state_simple'}, {val: ps.playing, ack: true});
        adapter.setState({device: 'root', channel: ip, state: 'state'},        {val: ps.paused ? 'pause' : (ps.playing ? 'play' : 'stop'), ack: true});

        if (player.tts && (ps.paused || ps.stopped) //{
            /*&& (sonosState.currentTrack.uri === player.tts.ourUri)*/) {

            // If other files queued
            if (player.queuedTts && player.queuedTts.length) {
                const q = player.queuedTts.shift();
                const uuid = channels[ip].uuid;
                const tts = player.tts;
                resetTts(player);

                // remove track
                if (tts.addedTrack !== undefined) {
                    adapter.log.debug('player.removeTrackFromQueue, Track=' + tts.addedTrack);
                    player.removeTrackFromQueue(tts.addedTrack).then(() => {
                        setImmediate(() => playOnSonos(q.uri, uuid, q.volume));
                    }, error => {
                        adapter.log.error('Cannot removeTrackFromQueue: ' + error);
                        setImmediate(() => playOnSonos(q.uri, uuid, q.volume));
                    });
                } else {
                    setImmediate(() => playOnSonos(q.uri, uuid, q.volume));
                }
                return;
            }
            if ((new Date()).getTime() - player.tts.time > 1000) { // else: do not restore old state, if queue is not empty
                const tts = player.tts;

                resetTts(player);

                // Restore state before tts
                adapter.log.debug('>> Restore state: volume - ' + tts.volume + ', mute: ' + tts.mute + ', uri: ' + tts.currentTrack.uri);

                if (player._isMuted === undefined) {
                    player._isMuted = player.groupState.mute;
                }
                if (player._isMuted !== tts.mute) {
                    if (tts.mute) {
                        player.mute();
                    } else {
                        player.unMute();
                    }
                }

                // required for fadeIn
                player.setVolume(0);

                // remove track
                if (tts.addedTrack !== undefined) {
                    adapter.log.debug('player.removeTrackFromQueue, Track=' + tts.addedTrack);
                    player.removeTrackFromQueue(tts.addedTrack);
                }

                if (tts.radio) {
                    if (tts.playbackState !== 'PLAYING') resetTts(player);

                    player.setAVTransport(tts.currentTrack.uri, tts.avTransportUriMetadata).then(res => {
                        resetTts(player);
                        startPlayer(player, tts.volume, false, tts.playbackState === 'PLAYING');
                    }, error => {
                        adapter.log.error('Cannot setAVTransport: ' + error);
                        resetTts(player);
                        startPlayer(player, tts.volume, false, tts.playbackState === 'PLAYING');
                    });
                } else {
                    // if not radio
                    // Remove added track
                    // Set old track number
                    player.trackSeek(tts.trackNo).then(res => {
                        resetTts(player);
                        // Set elapsed time
                        player.timeSeek(tts.elapsedTime).then(res => {
                            startPlayer(player, tts.volume, false, /*true ||*/ tts.playbackState === 'PLAYING');
                        }, error => {
                            adapter.log.error('Cannot trackSeek: ' + error);
                        });
                    }, error => {
                        adapter.log.error('Cannot seek: ' + error);
                        resetTts(player);
                    });
                }
            }
        }

        // if duration is 0 (type is radio):
        // - no changes expected and a state update is not necessary!
        // - division by 0
        if (ps.playing && channels[ip].duration > 0) { // sonosState.currentTrack.type !== 'radio') {
            if (!channels[ip].elapsedTimer) {
                channels[ip].elapsedTimer = setInterval(ip_ =>{
                    channels[ip_].elapsed += ((adapter.config.elapsedInterval || 5000) / 1000);

                    if (channels[ip_].elapsed > channels[ip_].duration) channels[ip_].elapsed = channels[ip_].duration;

                    adapter.setState({device: 'root', channel: ip, state: 'seek'},              {val: Math.round((channels[ip_].elapsed / channels[ip_].duration) * 1000) / 10, ack: true});
                    adapter.setState({device: 'root', channel: ip, state: 'current_elapsed'},   {val: channels[ip_].elapsed, ack: true});
                    adapter.setState({device: 'root', channel: ip, state: 'current_elapsed_s'}, {val: toFormattedTime(channels[ip_].elapsed), ack: true});

                }, adapter.config.elapsedInterval || 5000, ip);
            }
        } else {
            if (channels[ip].elapsedTimer) {
                clearInterval (channels[ip].elapsedTimer);
                channels[ip].elapsedTimer = null;
            }
        }
    }

    // [hraab]
    // type: radio|track
    // when radio:
    //   radioShowMetaData (current show, contains an id separated by comma)
    //   streamInfo (kind of currently played title and artist info)
    //   title (== station)
    //
    // Still work to do:
    // - Tracks w/o Album name keeps album name from previous track or some random album. Don't know if this is already wrong from SONOS API.

    if (sonosState.currentTrack.type === 'radio') {
        adapter.setState({device: 'root', channel: ip, state: 'current_type'}, {val: 1, ack: true});
    }
    else {
        adapter.setState({device: 'root', channel: ip, state: 'current_type'}, {val: 0, ack: true});
    }
    adapter.setState({device: 'root', channel: ip, state: 'current_title'},  {val: sonosState.currentTrack.title  || '', ack: true});
    adapter.setState({device: 'root', channel: ip, state: 'current_album'},  {val: sonosState.currentTrack.album  || '', ack: true});
    adapter.setState({device: 'root', channel: ip, state: 'current_artist'}, {val: sonosState.currentTrack.artist || '', ack: true});

    // elapsed time
    adapter.setState({device: 'root', channel: ip, state: 'current_duration'},   {val: sonosState.currentTrack.duration, ack: true});
    adapter.setState({device: 'root', channel: ip, state: 'current_duration_s'}, {val: toFormattedTime(sonosState.currentTrack.duration), ack: true});

    if (lastCover !== sonosState.currentTrack.albumArtUri) {
        const defaultImg = __dirname + '/img/browse_missing_album_art.png';
        const stateName  = adapter.namespace + '.root.' + ip + '.cover_png';
        let fileName;
        let md5url;
        if (sonosState.currentTrack.albumArtUri) {
            md5url     = crypto.createHash('md5').update(sonosState.currentTrack.albumArtUri).digest('hex');
            fileName   = cacheDir + md5url;
        } else {
            fileName   = defaultImg;
        }

        if (!fs.existsSync(fileName)) {
            adapter.log.debug('Cover file does not exist. Fetching via HTTP');
            http.get({
                hostname: getIp(discovery.getPlayerByUUID(channels[ip].uuid), true),
                port: 1400,
                path: sonosState.currentTrack.albumArtUri
            }, res2 => {
                adapter.log.debug('HTTP status code ' + res2.statusCode);
                if (res2.statusCode === 200) {
                    if (!fs.existsSync(fileName)) {
                        const cacheStream = fs.createWriteStream(fileName);
                        res2.pipe(cacheStream).on('finish', () => readCoverFileToState(fileName, stateName, ip));
                    } else {
                        adapter.log.debug('Not writing to cache');
                        res2.resume();
                    }
                } else if (res2.statusCode === 404) {
                    // no image exists! link it to the default image.
                    fileName = defaultImg;
                    res2.resume();
                    readCoverFileToState(fileName, stateName, ip);
                }

                res2.on('end', () => adapter.log.debug('Response "end" event'));
            }).on('error', e => adapter.log.warn('Got error: ' + e.message));
        } else {
            adapter.log.debug('Cover exists. Try reading from fs');
            let fileData = null;
            try {
                fileData = fs.readFileSync(fileName);
            } catch (e) {
                adapter.log.warn('Cannot read file: ' + e);
            }
            // If error or null length file, read standard cover file
            if (!fileData) {
                try {
                    fileData = fs.readFileSync(defaultImg);
                } catch (e) {
                    adapter.log.warn('Cannot read file: ' + e);
                }
            }
            if (fileData) {
                adapter.setBinaryState(stateName, fileData, () => {
                    adapter.setState({device: 'root', channel: ip, state: 'current_cover'}, {val: '/state/' + stateName, ack: true});
                });
            }
        }

        lastCover = sonosState.currentTrack.albumArtUri;
    }
    channels[ip].elapsed  = sonosState.elapsedTime;
    channels[ip].duration = sonosState.currentTrack.duration;

    // only if duration !== 0, see above
    if (channels[ip].duration > 0) { // sonosState.currentTrack.type !== 'radio') {
        adapter.setState({device: 'root', channel: ip, state: 'current_elapsed'},    {val: sonosState.elapsedTime, ack: true});
        adapter.setState({device: 'root', channel: ip, state: 'seek'},               {val: Math.round((channels[ip].elapsed / channels[ip].duration) * 1000) / 10, ack: true});
        adapter.setState({device: 'root', channel: ip, state: 'current_elapsed_s'},  {val: sonosState.elapsedTimeFormatted, ack: true});
    }

    adapter.setState({device: 'root', channel: ip, state: 'volume'},             {val: sonosState.volume, ack: true});
    if (sonosState.groupState) {
        adapter.setState({device: 'root', channel: ip, state: 'muted'},          {val: sonosState.groupState.mute, ack: true});
    }

    if (playMode) {
        adapter.setState({device: 'root', channel: ip, state: 'shuffle'},    {val: playMode.shuffle, ack: true});
        adapter.setState({device: 'root', channel: ip, state: 'repeat'},     {val: playMode.repeat === 'all' ? 1 : (playMode.repeat === 'one' ? 2 : 0), ack: true});
        adapter.setState({device: 'root', channel: ip, state: 'crossfade'},  {val: playMode.crossfade, ack: true});
    }
}

function readCoverFileToState(fileName, stateName, ip) {
    let fileData = null;
    try {
        fileData = fs.readFileSync(fileName);
    } catch (e) {
        adapter.log.warn('Cannot read file: ' + e);
    }
    // If error or null length file, read standard cover file
    if (!fileData) {
        try {
            fileData = fs.readFileSync(defaultImg);
        } catch (e) {
            adapter.log.warn('Cannot read file: ' + e);
        }
    }
    if (fileData) {
        adapter.setBinaryState(stateName, fileData, () => {
            adapter.setState({device: 'root', channel: ip, state: 'current_cover'}, {val: '/state/' + stateName, ack: true});
        });
    }
}

function takeSonosFavorites(ip, favorites) {
    let sFavorites = '';
    for (const favorite in favorites) {
        if (!favorites.hasOwnProperty(favorite)) continue;
        if (favorites[favorite].title) {
            sFavorites += ((sFavorites) ? ', ' : '') + favorites[favorite].title;
        }
    }

    adapter.setState({device: 'root', channel: ip, state: 'favorites_list'}, {val: sFavorites, ack: true});
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
    let ip;
    let i;
    let player;
    if (event === 'topology-change') {
        // TODO: Check
        let member_ip;
        let j;
        let member;
        if (typeof data.length === 'undefined') {
            player = discovery.getPlayerByUUID(data.uuid);
            if (!player._address) player._address = getIp(player);

            ip = player._address;
            if (channels[ip]) {
                channels[ip].uuid = data.uuid;
                adapter.setState({device: 'root', channel: ip, state: 'alive'}, {val: true, ack: true});
            }
        } else if (data.length) {
            for (i = 0; i < data.length; i++) {
                player = discovery.getPlayerByUUID(data[i].uuid);
                if (!player._address) player._address = getIp(player);

                ip = player._address;
                if (channels[ip]) {
                    channels[ip].uuid = data[i].uuid;
                    adapter.setState({device: 'root', channel: ip, state: 'alive'}, {val: true, ack: true});
                }
                const members = [];
                const membersChannels = [];
                for (j = 0; j < data[i].members.length; j++) {
                    member = discovery.getPlayerByUUID(data[i].members[j].uuid);
                    if (!member._address) member._address = getIp(member);
                    
                    member_ip = member._address;
                    if (channels[member_ip]) {
                        channels[member_ip].uuid = data[i].members[j].uuid;
                        membersChannels.push(member_ip);
                        adapter.setState({device: 'root', channel: member_ip, state: 'coordinator'}, {val: ip, ack: true});
                    }
                    if (data[i].members[j].roomName) {
                        members.push(data[i].members[j].roomName);
                    }
                }
                if (members.length) {
                    adapter.setState ({device: 'root', channel: ip, state: 'members'}, { val: members.join(','), ack: true })
                }
                if (membersChannels.length) {
                    adapter.setState ({device: 'root', channel: ip, state: 'membersChannels'}, { val: membersChannels.join(','), ack: true })
                }
            }
        }
    } else if (event === 'transport-state') {
        player = discovery.getPlayerByUUID(data.uuid);
        if (!player._address) player._address = getIp(player);

        ip = player._address;
        if (channels[ip]) {
            channels[ip].uuid = data.uuid;
            takeSonosState(ip, data.state);
        }
    } else if (event === 'group-volume') {
        // {
        //     uuid:        this.uuid,
        //     oldVolume:   this._previousGroupVolume,
        //     newVolume:   this.groupState.volume,
        //     roomName:    this.roomName
        // }

        for (i = 0; i < discovery.players.length; i++) {
            if (discovery.players[i].roomName === data.roomName) {
                player = discovery.getPlayerByUUID(discovery.players[i].uuid);
                if (!player._address) player._address = getIp(player);

                ip = player._address;
                if (channels[ip]) {
                    channels[ip].uuid = discovery.players[i].uuid;
                    adapter.setState({device: 'root', channel: ip, state: 'volume'}, {val: data.newVolume, ack: true});
                    //adapter.setState({device: 'root', channel: ip, state: 'muted'},  {val: data.groupState.mute,  ack: true});
                    //player._isMuted = data.groupState.mute;
                    player._volume  = data.newVolume;
                    adapter.log.debug('group-volume: Volume for ' + player.baseUrl + ': ' + data.newVolume);
                }
            }
        }
    }  else if (event === 'group-mute') {
        //{
        //    uuid:         _this.uuid,
        //    previousMute: previousMute,
        //    newMute:      _this.groupState.mute,
        //    roomName:     _this.roomName
        //}
//        for (i = 0; i < discovery.players.length; i++) {
//            if (discovery.players[i].roomName === data.roomName) {
//                player = discovery.getPlayerByUUID(discovery.players[i].uuid);
                player = discovery.getPlayerByUUID(data.uuid);
                if (!player._address) player._address = getIp(player);

                ip = player._address;
                if (channels[ip]) {
//                    channels[ip].uuid = discovery.players[i].uuid;
                    channels[ip].uuid = data.uuid;
                    adapter.setState({device: 'root', channel: ip, state: 'muted'}, {val: data.newMute, ack: true});
                    //adapter.setState({device: 'root', channel: ip, state: 'muted'},  {val: data.groupState.mute,  ack: true});
                    //player._isMuted = data.groupState.mute;
                    player._isMuted  = data.newMute;
                    adapter.log.debug('mute: Mute for ' + player.baseUrl + ': ' + data.newMute);
                    adapter.setState({device: 'root', channel: ip, state: 'group_muted'}, {val: player.groupState.mute, ack: true});
                    adapter.log.debug('group_muted: groupMuted for ' + player.baseUrl + ': ' + player.groupState.mute);
                }
//            }
//        }
    }  else if (event === 'volume') {
        // {
        //     uuid:             _this.uuid,
        //     previousVolume:   previousVolume,
        //     newVolume:        state.volume,
        //     roomName:         _this.roomName
        // }
        player = discovery.getPlayerByUUID(data.uuid);
        if (!player._address) player._address = getIp(player);

        ip = player._address;
        if (channels[ip]) {
            channels[ip].uuid = data.uuid;
            adapter.setState({device: 'root', channel: ip, state: 'volume'}, {val: data.newVolume, ack: true});
            player._volume  = data.newVolume;
            adapter.log.debug('volume: Volume for ' + player.baseUrl + ': ' + data.newVolume);
            setTimeout (() => {
                adapter.setState({device: 'root', channel: ip, state: 'group_volume'}, {val: player.groupState.volume, ack: true});
                adapter.log.debug('group_volume: groupVolume for ' + player.baseUrl + ': ' + player.groupState.volume);
            }, 2000);
        }
    } else if (event === 'mute') {
        // {
        //     uuid:        _this.uuid,
        //     previousMute: previousMute,
        //     newMute:     state.mute,
        //     roomName:    _this.roomName
        // }
        player = discovery.getPlayerByUUID(data.uuid);
        if (!player._address) player._address = getIp(player);

        ip = player._address;
        if (channels[ip]) {
            channels[ip].uuid = data.uuid;
            adapter.setState({device: 'root', channel: ip, state: 'muted'},  {val: data.newMute,  ack: true});
            player._isMuted  = data.newMute;
            adapter.log.debug('mute: Mute for ' + player.baseUrl + ': ' + data.newMute);
        }
    } else if (event === 'favorites') {
        discovery.getFavorites()
            .then(favorites => {
                // Go through all players
                for (i = 0; i < discovery.players.length; i++) {
                    player = discovery.players[i];
                    if (!player._address) player._address = getIp(player);

                    ip = player._address;
                    if (channels[ip]) {
                        takeSonosFavorites(ip, favorites);
                    }
                }
            });
    } else if (event === 'queue') {
        player = discovery.getPlayerByUUID(data.uuid);
        if (!player._address) player._address = getIp(player);

        ip = player._address;
        if (channels[ip]) {
            channels[ip].uuid = data.uuid;
            const _text = [];
            for (let q = 0; q < data.queue.length; q++) {
                _text.push(data.queue[q].artist + ' - ' + data.queue[q].title);
            }
            const qtext = _text.join(', ');
            adapter.setState({device: 'root', channel: ip, state: 'queue'},  {val: qtext, ack: true});
            adapter.log.debug('queue for ' + player.baseUrl + ': ' + qtext);
        }
        discovery.getFavorites()
            .then(favorites => {
                // Go through all players
                for (i = 0; i < discovery.players.length; i++) {
                    player = discovery.players[i];
                    if (!player._address) player._address = getIp(player);

                    ip = player._address;
                    if (channels[ip]) {
                        takeSonosFavorites(ip, favorites);
                    }
                }
            });
    } else {
        adapter.log.debug(event + ' ' + (typeof data === 'object' ? JSON.stringify(data) : data));
    }
}

function checkNewGroupStates(channel) {
    for (const g in newGroupStates) {
        adapter.getState(channel._id + '.' + g, function (_g, err, obj) {
            if (err || !obj) {
                const dcs = adapter.idToDCS(channel._id + '.' + _g);
                adapter.createState(dcs.device, dcs.channel, dcs.state, newGroupStates[_g]);
            }
        }.bind(null, g));
    }
}

function syncConfig() {
    channels = {};

    adapter.getDevices((err, devices) => {
        if (devices && devices.length) {
            // Go through all devices
            for (let i = 0; i < devices.length; i++) {

                adapter.getChannelsOf(devices[i].common.name, (err, _channels) => {
                    const configToDelete = [];
                    const configToAdd    = [];
                    let k;
                    if (adapter.config.devices) {
                        for (k = 0; k < adapter.config.devices.length; k++) {
                            configToAdd.push(adapter.config.devices[k].ip);
                        }
                    }

                    if (_channels) {
                        for (let j = 0; j < _channels.length; j++) {
                            const ip = _channels[j].native.ip;
                            const id = ip.replace(/[.\s]+/g, '_');
                            const pos = configToAdd.indexOf(ip);
                            if (pos !== -1) {
                                checkNewGroupStates(_channels[j]);
                                configToAdd.splice(pos, 1);
                                // Check name and room
                                for (let u = 0; u < adapter.config.devices.length; u++) {
                                    if (adapter.config.devices[u].ip === ip) {
                                        if (_channels[j].common.name !== (adapter.config.devices[u].name || adapter.config.devices[u].ip)) {
                                            adapter.extendObject(_channels[j]._id, {
                                                common: {
                                                    name: (adapter.config.devices[u].name || adapter.config.devices[u].ip)
                                                },
                                                type: 'channel'
                                            });
                                        }
                                        if (adapter.config.devices[u].room) {
                                            adapter.addChannelToEnum('room', adapter.config.devices[u].room, 'root', id);
                                        } else {
                                            adapter.deleteChannelFromEnum('room', 'root', id);
                                        }
                                    }
                                }

                                const sId = ip.replace(/[.\s]+/g, '_');
                                channels[sId] = {
                                    uuid:     '',
                                    player:   null,
                                    duration: 0,
                                    elapsed:  0,
                                    obj:      _channels[j]
                                };
                                adapter.setState('root.' + sId + '.alive', false, true);
                                aliveIds.push('root.' + sId + '.alive');

                            } else {
                                configToDelete.push(ip);
                            }
                        }
                    }

                    if (configToAdd.length) {
                        for (let r = 0; r < adapter.config.devices.length; r++) {
                            if (adapter.config.devices[r].ip && configToAdd.indexOf(adapter.config.devices[r].ip) !== -1) {
                                addChannel(adapter.config.devices[r].name, adapter.config.devices[r].ip, adapter.config.devices[r].room, (err, obj) => {
                                    adapter.getObject(obj.id, (err, obj) => {
                                        const sId = obj.native.ip.replace(/[.\s]+/g, '_');
                                        aliveIds.push('root.' + sId + '.alive');

                                        channels[sId] = {
                                            uuid:     '',
                                            player:   null,
                                            duration: 0,
                                            elapsed:  0,
                                            obj:      obj
                                        };
                                    });
                                });
                            }
                        }
                    }
                    if (configToDelete.length) {
                        for (let e = 0; e < configToDelete.length; e++) {
                            if (configToDelete[e]) {
                                const _id = configToDelete[e].replace(/[.\s]+/g, '_');
                                adapter.deleteChannelFromEnum('room', 'root', _id);
                                adapter.deleteChannel('root', _id);
                            }
                        }
                    }
                });
            }
        } else {
            for (let r = 0; r < adapter.config.devices.length; r++) {
                if (!adapter.config.devices[r].ip) continue;
                addChannel(adapter.config.devices[r].name, adapter.config.devices[r].ip, adapter.config.devices[r].room, (err, obj) => {
                    adapter.getObject(obj.id, (err, obj) => {
                        channels[obj.native.ip.replace(/[.\s]+/g, '_')] = {
                            uuid:     '',
                            player:   null,
                            duration: 0,
                            elapsed:  0,
                            obj:      obj
                        };
                    });
                });
            }
        }
    });
}

let discovery   = null;
const queues      = {};
let cacheDir    = '';

function main() {
    adapter.config.fadeIn  = parseInt(adapter.config.fadeIn,  10) || 0;
    adapter.config.fadeOut = parseInt(adapter.config.fadeOut, 10) || 0;
    syncConfig();
    adapter.subscribeStates('*');

    const _path = tools.getConfigFileName().split('/');
    _path.pop();
    cacheDir = _path.join('/') + '/sonosCache/';

    discovery = new SonosDiscovery({
        household:  null,
        log:        logger,
        cacheDir:   cacheDir,
        port:       adapter.config.webserverPort
    });
    // from here the code is mostly from https://github.com/jishi/node-sonos-web-controller/blob/master/server.js

    if (adapter.config.webserverEnabled) {
        // we cannot look for sonos-web-controller because on main in package.json
        let staticPath;
        try {
            let sonosPath = require.resolve('sonos-discovery');
            sonosPath = sonosPath.replace(/\\/g, '/');
            const parts = sonosPath.split('/');
            parts.splice(parts.length - 3);
            staticPath = parts.join('/') + '/sonos-web-controller/static';
        } catch (e) {
            if (fs.existsSync(__dirname + '/../sonos-web-controller/static')) {
                staticPath = __dirname + '/../sonos-web-controller/static';
            } else {
                staticPath = __dirname + '/node_modules/sonos-web-controller/static';
            }
        }


        // patch socket
        if (fs.existsSync(staticPath + '/js/socket.js')) {
            let data = fs.readFileSync(staticPath + '/js/socket.js').toString();
            if (data.indexOf('io.connect(target);') !== -1) {
                data = data.replace('io.connect(target);', "io.connect('/', {path: location.pathname.replace('/m/', '/') + 'socket.io'}); // io.connect(target);");
                fs.writeFileSync(staticPath + '/js/socket.js', data);
            }
        }
        if (fs.existsSync(staticPath + '/js/all.js')) {
            let data = fs.readFileSync(staticPath + '/js/all.js').toString();
            if (data.indexOf('"/svg/mute_on.svg" : "/svg/mute_off.svg"') !== -1) {
                data = data.replace('"/svg/mute_on.svg" : "/svg/mute_off.svg"', '"svg/mute_on.svg" : "svg/mute_off.svg"');
                data = data.replace('"/images/browse_missing_album_art.png";', '"images/browse_missing_album_art.png";');
                fs.writeFileSync(staticPath + '/js/all.js', data);
            }
        }

        const fileServer  = new Static.Server(staticPath);

        cacheDir = adapter.config.cacheDir ? (__dirname + adapter.config.cacheDir) : cacheDir;
        // Remove last "/"
        if (cacheDir[cacheDir.length - 1] !== '/') cacheDir += '/';

        fs.mkdir(cacheDir, e => {
            if (e && e.code !== 'EEXIST') {
                adapter.log.error('creating cache dir failed.', e);
            }
        });

        server = http.createServer((req, res) => {
            let fileName;
            if (/^\/tts/.test(req.url)) {
                let parts = req.url.split('/');
                fileName = parts[parts.length - 1];
                parts = fileName.split('?');
                fileName = parts[0];
                fileName = path.join(cacheDir, fileName);
                adapter.log.debug('Request ' + req.url);
                fs.exists(fileName, exists => {
                    if (exists) {
                        const stat = fs.statSync(fileName);

                        res.writeHead(200, {
                            'Content-Type':  'audio/mpeg',
                            'Content-Length': stat.size,
                            'Expires':        '30000'
                        });
                        fs.createReadStream(fileName).pipe(res);
                    } else {
                        res.writeHead(404, {'Content-Type': 'text/plain'});
                        res.write('404 Not found. File ' + fileName + ' not found in ' + cacheDir);
                        res.end();
                    }
                });
            } else
            if (/^\/getaa/.test(req.url)) {
                // this is a resource, download from player and put in cache folder
                const md5url = crypto.createHash('md5').update(req.url).digest('hex');
                const fileName = path.join(cacheDir, md5url);

                fs.exists(fileName, exists => {
                    if (exists) {
                        const readCache = fs.createReadStream(fileName);
                        readCache.pipe(res);
                        return;
                    }

                    const player = discovery.getAnyPlayer();
                    if (!player) return;

                    adapter.log.debug('fetching album art from', player.localEndpoint);
                    http.get(player.baseUrl + req.url, res2 => {
                        if (res2.statusCode === 200) {
                            if (!fs.exists(fileName)) {
                                const cacheStream = fs.createWriteStream(fileName);
                                res2.pipe(cacheStream);
                            } else {
                                res2.resume();
                            }
                        } else if (res2.statusCode === 404) {
                            // no image exists! link it to the default image.
                            fs.link( __dirname + '/img/browse_missing_album_art.png', fileName, e => {
                                res2.resume();
                                if (e) adapter.log.warn(e);
                            });
                        }

                        res2.on('end', () => {
                            adapter.log.debug('serving ', req.url);
                            const readCache = fs.createReadStream(fileName);
                            readCache.on('error', e => adapter.log.error(e));
                            readCache.pipe(res);
                        });
                    }).on('error', e => adapter.log.error('Got error: ' + e.message));
                });
            } else {
                req.addListener('end', () => fileServer.serve(req, res)).resume();
            }
        });

        socketServer = io.listen(server);
        //socketServer.set('log level', 1);

        socketServer.sockets.on('connection', socket => {
            // Send it in a better format
            const players = discovery.players;

            if (players.length === 0) return;

            socket.emit('topology-change', players);
            discovery.getFavorites()
                .then(favorites =>socket.emit('favorites', favorites));

            socket.on('transport-state', data => {
                // find player based on uuid
                const player = discovery.getPlayerByUUID(data.uuid);

                if (!player) return;

                // invoke action
                //console.log(data)
                player[data.state]();
            });

            socket.on('group-volume', data => {
                // find player based on uuid
                const player = discovery.getPlayerByUUID(data.uuid);
                if (!player) return;

                // invoke action
                player.setGroupVolume(data.volume);
            });

            socket.on('group-management', data => {
                // find player based on uuid
                //console.log(data);
                const player = discovery.getPlayerByUUID(data.player);
                if (!player) return;

                if (data.group == null) {
                    player.becomeCoordinatorOfStandaloneGroup();
                    return;
                }

                player.setAVTransport('x-rincon:' + data.group);
            });

            socket.on('play-favorite', data => {
                const player = discovery.getPlayerByUUID(data.uuid);
                if (!player) return;

                player.replaceWithFavorite(data.favorite)
                    .then(() => player.play());
            });

            socket.on('queue', data => {
                loadQueue(data.uuid)
                    .then(queue => socket.emit('queue', { uuid: data.uuid, queue: queue }));
            });

            socket.on('seek', data => {
                const player = discovery.getPlayerByUUID(data.uuid);
                if (player.avTransportUri.startsWith('x-rincon-queue')) {
                    player.trackSeek(data.trackNo);
                    return;
                }

                // Player is not using queue, so start queue first
                player.setAVTransport('x-rincon-queue:' + player.uuid + '#0')
                    .then(() => player.trackSeek(data.trackNo))
                    .then(() => player.play());
            });

            socket.on('playmode', data => {
                const player = discovery.getPlayerByUUID(data.uuid);
                for (const action in data.state) {
                    if (data.state.hasOwnProperty(action)) {
                        player[action](data.state[action]);
                    }
                }
            });

            socket.on('volume', data => {
                const player = discovery.getPlayerByUUID(data.uuid);
                player.setVolume(data.volume);
            });

            socket.on('group-mute', data => {
                //console.log(data);
                const player = discovery.getPlayerByUUID(data.uuid);
                if (data.mute)
                    player.muteGroup();
                else
                    player.unMuteGroup();
            });

            socket.on('mute', data => {
                const player = discovery.getPlayerByUUID(data.uuid);
                if (data.mute)
                    player.mute();
                else
                    player.unMute();
            });

            socket.on('track-seek', data => {
                const player = discovery.getPlayerByUUID(data.uuid);
                player.timeSeek(data.elapsed);
            });

            socket.on('search', data => search(data.term, socket));

            socket.on('error', e => adapter.log.error('Sonos reported error: ' + e));
        });
    }

    discovery.on('topology-change', data => {
        if (socketServer) socketServer.sockets.emit('topology-change', discovery.players);
        processSonosEvents('topology-change', data);
    });

    discovery.on('transport-state', data => {
        if (socketServer) socketServer.sockets.emit('transport-state', data);
        processSonosEvents('transport-state', data);
    });

    discovery.on('group-volume', data => {
        if (socketServer) socketServer.sockets.emit('group-volume', data);
        processSonosEvents('group-volume', data);
    });

    discovery.on('volume-change', data => {
        if (socketServer) socketServer.sockets.emit('volume', data);
        processSonosEvents('volume', data);
    });

    discovery.on('group-mute', data => {
        if (socketServer)socketServer.sockets.emit('group-mute', data);
        processSonosEvents('group-mute', data);
    });

    discovery.on('mute-change', data => {
        if (socketServer) socketServer.sockets.emit('mute', data);
        processSonosEvents('mute', data);
    });

    discovery.on('favorites', data => {
        if (socketServer) socketServer.sockets.emit('favorites', data);
        processSonosEvents('favorites', data);
    });

    discovery.on('queue-change', player => {
        //console.log('queue-change', data);
        delete queues[player.uuid];
        if (socketServer) {
            loadQueue(player.uuid)
                .then(queue => {
                    socketServer.sockets.emit('queue', { uuid: player.uuid, queue: queue });
                    processSonosEvents('queue', { uuid: player.uuid, queue: queue });
                });
        }
    });
    
    discovery.on('list-change', data => {
        //console.log('queue-change', data);
        if (socketServer) socketServer.sockets.emit('favorites', data);
        processSonosEvents('favorites', data);
    });
    
    function loadQueue(uuid) {
        if (queues[uuid]) {
            return Promise.resolve(queues[uuid]);
        }

        const player = discovery.getPlayerByUUID(uuid);
        return player.getQueue()
            .then(queue => {
                queues[uuid] = queue;
                return queue;
            });
    }

    function search(term, socket) {
        adapter.log.debug('search for', term);
        let playerCycle = 0;
        const players = [];

        for (const i in discovery.players) {
            if (discovery.players.hasOwnProperty(i)) {
                players.push(discovery.players[i]);
            }
        }

        function getPlayer() {
            return players[playerCycle++ % players.length];
        }

        const response = {};

        async.parallelLimit([
            callback => {
                const player = getPlayer();
                console.log('fetching from', player.baseUrl);
                player.browse('A:ARTIST:' + term, 0, 600, (success, result) => {
                    console.log(success, result);
                    response.byArtist = result;
                    callback(null, 'artist');
                });
            },
            callback => {
                const player = getPlayer();
                console.log('fetching from', player.baseUrl);
                player.browse('A:TRACKS:' + term, 0, 600, (success, result) => {
                    response.byTrack = result;
                    callback(null, 'track');
                });
            },
            callback => {
                const player = getPlayer();
                console.log('fetching from', player.baseUrl);
                player.browse('A:ALBUM:' + term, 0, 600, (success, result) => {
                    response.byAlbum = result;
                    callback(null, 'album');
                });
            }
        ], 
            players.length, (err, result) => socket.emit('search-result', response));
    }

    if (adapter.config.webserverEnabled) {
        server.listen(adapter.config.webserverPort);
        adapter.log.info('http sonos server listening on port ' + adapter.config.webserverPort);
    }
}
