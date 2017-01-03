/**
 *      ioBroker Sonos Adapter
 *      12'2013-2016 Bluefox <dogafox@gmail.com>
 *
 *      derived from https://github.com/jishi/node-sonos-web-controller by Jimmy Shimizu
 */
var loglevel = process.argv[3] || 'info';
var utils    = require(__dirname + '/lib/utils'); // Get common adapter utils
var tools    = require(utils.controllerDir + '/lib/tools.js');
var logger   = require(utils.controllerDir + '/lib/logger.js')(loglevel, [utils.appName], undefined, 'sonos');
var adapter  = utils.adapter('sonos');
var async    = require('async');

// {"val": state, "ack":false, "ts":1408294295, "from":"admin.0", "lc":1408294295}
// id = sonos.0.192_168_1_55.state
adapter.on('stateChange', function (_id, state) {
    if (!state || state.ack) return;
    adapter.log.info('try to control id ' + _id + ' with ' + JSON.stringify(state));
    // Try to find the object
    var id = adapter.idToDCS(_id);

    if (id && id.channel && channels[id.channel]) {
        if (state.val === 'false') state.val = false;
        if (state.val === 'true')  state.val = true;
        if (parseInt(state.val) == state.val) state.val = parseInt(state.val);

        var player = channels[id.channel].player;
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
                var parts = state.val.toString().split(':');
                var seconds;
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
                player.replaceWithFavorite(state.val).then(function () {
                    player.play();
                    adapter.setState({device: 'root', channel: id.channel, state: 'current_album'},  {val: state.val, ack: true});
                    adapter.setState({device: 'root', channel: id.channel, state: 'current_artist'}, {val: state.val, ack: true});
                }, function (error) {
                    adapter.log.error('Cannot replaceWithFavorite: ' + error);
                });
            } else
            if (id.state === 'tts') {
                adapter.log.debug('Play TTS file ' + state.val + ' on ' + id.channel);
                text2speech(state.val, id.channel);
            } else if (id.state === 'add_to_group') {
                addToGroup(state.val, player); //xxxx
            } else if (id.state === 'remove_from_group') {
                removeFromGroup(state.val, player);
            } else {
                adapter.log.warn('try to control unknown id ' + JSON.stringify(id));
            }
        } else {
            adapter.log.warn('SONOS "' + channels[id.channel].uuid + '" not found');
        }
    }
});

adapter.on('install', function () {
    adapter.createDevice('root', {});
});

adapter.on('unload', function (callback) {
    try {
        adapter.log.info('terminating');
        if (adapter.config.webserverEnabled) {
            socketServer.server.close();
        }
        callback();
    } catch (e) {
        callback();
    }
});

adapter.on('ready', function () {
    adapter.getObject(adapter.namespace + '.root', function (err, obj) {
        if (!obj || !obj.common || !obj.common.name) {
            adapter.createDevice('root', {}, function () {
                main();
            });
        } else {
            main ();
        }
    });
});

// New message arrived. obj is array with current messages
adapter.on('message', function (obj) {
    var wait = false;
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
                browse(function (res) {
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, res, obj.callback);
                });
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

var io             = require('socket.io');
var http           = require('http');
var Static         = require('node-static');
var fs             = require('fs');
var crypto         = require('crypto');
var SonosDiscovery = require('sonos-discovery');
var path           = require('path');
var dgram          = require('dgram');

var channels    = {};
var server;        // Sonos HTTP server
var socketServer;  // Sonos socket for HTTP Server
var lastCover =   null;

function toFormattedTime(time) {
    var hours = Math.floor(time / 3600);
    hours = (hours) ? (hours + ':') : '';
    var min = Math.floor(time / 60) % 60;
    if (min < 10) min = '0' + min;
    var sec = time % 60;
    if (sec < 10) sec = '0' + sec;

    return hours + min + ':' + sec;
}
var newGroupStates = {
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
    }
};

function createChannel(name, ip, room, callback) {
    var states = {
        'state_simple': {      // media.state -            Text state of player: stop, play, pause (read, write)
            def:    false,
            type:   'boolean',
            read:   true,
            write:  true,
            role:   'media.state',
            desc:   'Play or pause'
        },
        'play': {      // play command
            type:   'boolean',
            read:   false,
            write:  true,
            role:   'button.play',
            desc:   'play'
        },
        'stop': {      // stop command
            type:   'boolean',
            read:   false,
            write:  true,
            role:   'button.stop',
            desc:   'stop'
        },
        'pause': {      // pause command
            type:   'boolean',
            read:   false,
            write:  true,
            role:   'button.pause',
            desc:   'pause'
        },
        'prev': {      // prev command
            type:   'boolean',
            read:   false,
            write:  true,
            role:   'button.prev',
            desc:   'prev'
        },
        'next': {      // next command
            type:   'boolean',
            read:   false,
            write:  true,
            role:   'button.next',
            desc:   'next'
        },
        'seek': {      // seek command and indication
            type:   'number',
            read:   true,
            write:  true,
            unit:   '%',
            min:    0,
            max:    100,
            role:   'media.seek',
            desc:   'Seek position in percent'
        },
        'state': {             // media.state -            Text state of player: stop, play, pause (read, write)
            def:    'stop',
            type:   'string',
            read:   true,
            write:  true,
            values: 'stop,play,pause,next,previous,mute,unmute',
            role:   'media.state',
            desc:   'Play, stop, or pause, next, previous, mute, unmute'
        },
        'volume': {            // level.volume -           volume level (read, write)
            type:   'number',
            read:   true,
            write:  true,
            role:   'level.volume',
            min:    0,
            max:    100,
            desc:   'State and control of volume'
        },
        'muted': {             // media.muted -            is muted (read only)
            def:    false,
            type:   'boolean',
            read:   true,
            write:  true,
            role:   'media.mute',
            min:    false,
            max:    true,
            desc:   'Is muted'
        },
        'current_title': {     // media.current.title -    current title (read only)
            def:    '',
            type:   'string',
            read:   true,
            write:  false,
            role:   'media.title',
            desc:   'Title of current played song'
        },
        'current_artist': {    // media.current.artist -   current artist (read only)
            def:    '',
            type:   'string',
            read:   true,
            write:  false,
            role:   'media.artist',
            desc:   'Artist of current played song'
        },
        'current_album': {     // media.current.album -    current album (read only)
            def:    '',
            type:   'string',
            read:   true,
            write:  false,
            role:   'media.album',
            desc:   'Album of current played song'
        },
        'current_cover': {     // media.current.cover -    current url to album cover (read only)
            def:    '',
            type:   'string',
            read:   true,
            write:  false,
            role:   'media.cover',
            desc:   'Cover image of current played song'
        },
        'current_duration': {  // media.current.duration - duration as HH:MM:SS (read only)
            def:    0,
            type:   'number',
            read:   true,
            write:  false,
            unit:   'seconds',
            role:   'media.duration',
            desc:   'Duration of current played song in seconds'
        },
        'current_duration_s': {// media.current.duration - duration in seconds (read only)
            def:    '00:00',
            type:   'string',
            read:   true,
            write:  false,
            unit:   'interval',
            role:   'media.duration.text',
            desc:   'Duration of current played song as HH:MM:SS'
        },
        'current_type': {             // media.type -            type of stream (read only)
            def:    '',
            type:   'number',
            read:   true,
            write:  false,
            role:   'media.type',
            states: {0: 'track', 1: 'radio'},
            desc:   'Type of Stream (0 = track, 1 = radio)'
        },
        'alive': {             // indicator.reachable -    if player alive (read only)
            type:   'boolean',
            read:   true,
            write:  false,
            role:   'indicator.reachable',
            desc:   'If sonos alive or not'
        },
        'current_elapsed': {   // media.current.elapsed -  elapsed time in seconds
            def:    0,
            type:   'number',
            read:   true,
            write:  true,
            unit:   'seconds',
            role:   'media.elapsed',
            desc:   'Elapsed time of current played song in seconds'
        },
        'current_elapsed_s': { // media.current.elapsed -  elapsed time in HH:MM:SS
            def:    '00:00',
            type:   'string',
            read:   true,
            write:  true,
            unit:   'interval',
            role:   'media.elapsed.text',
            desc:   'Elapsed time of current played song as HH:MM:SS'
        },
        'favorites_list': {    // media.favorites.list -   list of favorites channel (read only)
            def:    '',
            type:   'string',
            read:   true,
            write:  false,
            role:   'media.favorites.list',
            desc:   'List of favorites song or stations, divided by comma'
        },
        'favorites_set': {     // media.favorites.set -    select favorites from list (write only)
            def:    '',
            type:   'string',
            read:   false,
            write:  true,
            role:   'media.favorites.set',
            desc:   'Set favorite from the list to play'
        },
        'tts': {     // play text to speech mp3 file
            def:    '',
            type:   'string',
            read:   false,
            write:  true,
            role:   'media.tts',
            desc:   'Set text2speech mp3 file to play'
        }
    };

    for (var g in newGroupStates) {
        states[g] = newGroupStates[g];
    }

    var states_list = [];
    for (var state in states) {
        states_list.push(state);
    }
    var id = ip.replace(/[.\s]+/g, '_');

    adapter.createChannel('root', id, {
        role: 'media.music',
        name: name || ip
    }, {
        ip: ip
    }, function (err, obj) {
        if (callback) callback(err, obj);
    });

    if (room) {
        adapter.addChannelToEnum('room', room, 'root', id);
    }
    for (var j = 0; j < states_list.length; j++) {
        adapter.createState('root', id, states_list[j], states[states_list[j]]);
    }
    // Create cover object
    adapter.setForeignObject(adapter.namespace + '.root.' + id + '.cover.png', {
        _id: adapter.namespace + '.root.' + id + '.cover.png',
        common: {
            type:   'file',
            read:   true,
            write:  true,
            role:   'media.current.cover',
            desc:   'Cover image of current played song as binary'
        },
        native: {},
        state: 'state'
    }, function (err) {
        if (err) adapter.log.error(err);
    });
}

function browse(callback) {
    var result = [];
    for (var i = 0; i < discovery.players.length; i++) {
        result.push({roomName: discovery.players[i].roomName, ip: getIp(discovery.players[i], true)});
    }

    if (callback) callback(result);

    /*
    var strngtoXmit = new Buffer(["M-SEARCH * HTTP/1.1",
        "HOST: 239.255.255.250:reservedSSDPport",
        "MAN: ssdp:discover",
        "MX: 1",
        "ST: urn:schemas-upnp-org:device:ZonePlayer:1"].join("\r\n"));

    // Create a new socket
    var server = dgram.createSocket('udp4');
    var result = [];

    if (server) {
        server.on("error", function (err) {
            console.log("ERROR: " + err);
            server.close();
            if (callback) callback('ERROR - Cannot send request: ' + err);
        });

        server.bind (53004, "0.0.0.0");

        server.on("message", function (msg, rinfo) {
            var str = msg.toString();
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

var currentFileNum = 0;
function text2speech(fileName, sonosIp, callback) {
    // Extract volume
    var volume = null;

    var pos = fileName.indexOf(';');
    if (pos !== -1) {
        volume = fileName.substring(0, pos);
        fileName = fileName.substring(pos + 1);
    }

    if (fileName && !fileName.match(/^http(s)?:\/\//)) {
        if (!adapter.config.webserverEnabled) {
            adapter.log.warn('Web server must be enabled to play TTS');
            return;
        }

        var parts = fileName.split('.');
        var dest  = 'tts' + (currentFileNum++) + '.' + parts[parts.length - 1];
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
    for (var i = 0; i < discovery.players.length; i++) {
        if (!discovery.players[i]._address) discovery.players[i]._address = getIp(discovery.players[i]);

        var ip = discovery.players[i]._address;

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
    if ((!adapter.config.fadeIn && !adapter.config.fadeOut) || (typeof options === 'boolean' && options)) {
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
    for (var i in discovery.players) {
        if (!discovery.players.hasOwnProperty(i)) continue;
        var player = discovery.players[i];
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
    var playerToAdd = getPlayerByName(playerNameToAdd);
    if(!coordinator || !playerToAdd) {
        return;
    }
    attachTo(playerToAdd, coordinator);
}

function removeFromGroup(leavingName, coordinator) {
    if (typeof coordinator === 'string') coordinator = getPlayerByName(coordinator);
    var leavingPlayer = getPlayerByName(leavingName);
    if (!coordinator || !leavingPlayer) {
        return;
    }
    if (leavingPlayer.coordinator === coordinator) {
        leavingPlayer.becomeCoordinatorOfStandaloneGroup();
    } else {
        attachTo(leavingPlayer, coordinator)
    }
}

/////////////

var audioExtensions = ['mp3', 'aiff', 'flac', 'less', 'wav'];

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//var GetPositionInfo = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>' +
//    '<u:GetPositionInfo xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><Channel>Master</Channel></u:GetPositionInfo>';
//
//XmlEntities = require(__dirname + '/node_modules/sonos-discovery/node_modules/html-entities/lib/xml-entities').XmlEntities;
//
/*
function getPositionInfo(player, callback) {
    player.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#GetPositionInfo"', GetPositionInfo, function(succ, res) {
        if (succ) {
            var data = '';
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                data += chunk.toString();
            });
            res.on('end', function () {
                // Find queued element

                var pos = data.indexOf('<TrackMetaData>');
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
    var now = (new Date()).getTime();
    var player = discovery.getPlayerByUUID(sonosUuid);
    var noFadeOut = false;
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

    //var oldVolume = player._volume;
    //var oldIsMute = player._isMute;
    //
    //if (volume === 'null' || volume === 'undefined') volume = 0;
    //
    //if (volume && oldVolume != volume) {
    //    player.setVolume(volume);
    //}
    //if (oldIsMute) player.groupMute(false);

    var parts = player.tts.currentTrack.uri ? player.tts.currentTrack.uri.split('.') : ['none'];

    if (player.tts.currentTrack.uri &&
        ((player.tts.currentTrack.uri.indexOf('x-file-cifs:') !== -1) ||
         (player.tts.currentTrack.uri.indexOf('x-sonos-spotify:') !== -1) ||
         (player.tts.currentTrack.uri.indexOf('x-sonosapi-hls-static:') !== -1) ||
         (audioExtensions.indexOf(parts[parts.length - 1]) !== -1))
       ) {
        player.tts.radio = false;

        player.addURIToQueue(uri).then(function (res) {
            // Find out added track
            if (!player.tts) {
                //adapter.log.warn('Cannot restore sonos state');
                adapter.log.warn('Cannot add track (URI) to Sonos Queue');
                return;
            }
            player.tts.addedTrack = parseInt(res.firsttracknumberenqueued, 10);

            fadeOut(player, noFadeOut, function (noFadeIn) {
                adapter.log.debug('player.seek: ' + player.tts.addedTrack);

                player.trackSeek(player.tts.addedTrack).then(function () {
                    // Send command PLAY
                    startPlayer(player, volume, noFadeIn, player.tts.playbackState !== 'PLAYING');
                });
            });
        });
    } else {
        if (player.tts.currentTrack && player.tts.currentTrack.uri) {
            var parts = player.tts.currentTrack.uri.split(':');
            adapter.log.debug('Detected RADIO, because of: ' + parts[0]);
        }

        // Radio
        player.tts.radio = true;
        fadeOut(player, noFadeOut, function (noFadeIn) {
            adapter.log.debug('setAVTransport: ' + uri);

            player.setAVTransport(uri).then(function (res) {
                // Send command PLAY
                startPlayer(player, volume, noFadeIn, true);
            });
        });
    }
}

function addChannel(name, ip, room, callback) {
    adapter.getObject('root', function (err, obj) {
        if (err || !obj) {
            // if root does not exist, channel will not be created
            adapter.createDevice('root', [], function () {
                createChannel(name, ip, room, callback);
            });
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
    var ps = {playing: false, paused: false, transitioning: false, stopped: false};
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
    var ps = _getPs(sonosState.playbackState);
    var player = discovery.getPlayerByUUID(channels[ip].uuid);

    if (!player.tts && player.queuedTts && player.queuedTts.length) {
        var q = player.queuedTts.shift();
        var uuid = channels[ip].uuid;
        adapter.log.debug('Taking next queue entry, tts=' + (player.tts ? true : false) + 'playState=' + sonosState.playbackState);
        setTimeout(function () {
            playOnSonos(q.uri, uuid, q.volume);
        }, 0);
    }

    adapter.log.debug('>  playbackState: ' + sonosState.playbackState + ' - ' + (sonosState.currentTrack && sonosState.currentTrack.title ? sonosState.currentTrack.title : ''));

    if (!ps.transitioning) {
        adapter.setState({device: 'root', channel: ip, state: 'state_simple'}, {val: ps.playing, ack: true});
        adapter.setState({device: 'root', channel: ip, state: 'state'},        {val: ps.paused ? 'pause' : (ps.playing ? 'play' : 'stop'), ack: true});

        if (player.tts && (ps.paused || ps.stopped) //{
            /*&& (sonosState.currentTrack.uri === player.tts.ourUri)*/) {

            // If other files queued
            if (player.queuedTts && player.queuedTts.length) {
                var q = player.queuedTts.shift();
                var uuid = channels[ip].uuid;
                var tts = player.tts;
                resetTts(player);

                // remove track
                if (tts.addedTrack !== undefined) {
                    adapter.log.debug('player.removeTrackFromQueue, Track=' + tts.addedTrack);
                    player.removeTrackFromQueue(tts.addedTrack).then(function () {
                        setTimeout(function () {
                            playOnSonos(q.uri, uuid, q.volume);
                        }, 0);
                    }, function (error) {
                        adapter.log.error('Cannot removeTrackFromQueue: ' + error);
                        setTimeout(function () {
                            playOnSonos(q.uri, uuid, q.volume);
                        }, 0);
                    });
                } else {
                    setTimeout(function () {
                        playOnSonos(q.uri, uuid, q.volume);
                    }, 0);
                }
                return;
            }
            if ((new Date()).getTime() - player.tts.time > 1000) { // else: do not restore old state, if queue is not empty
                var tts = player.tts;

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

                    player.setAVTransport(tts.currentTrack.uri, tts.avTransportUriMetadata).then(function (res) {
                        resetTts(player);
                        startPlayer(player, tts.volume, false, tts.playbackState === 'PLAYING');
                    }, function (error) {
                        adapter.log.error('Cannot setAVTransport: ' + error);
                        resetTts(player);
                        startPlayer(player, tts.volume, false, tts.playbackState === 'PLAYING');
                    });
                } else {
                    // if not radio
                    // Remove added track
                    // Set old track number
                    player.trackSeek(tts.trackNo).then(function (res) {
                        resetTts(player);
                        // Set elapsed time
                        player.timeSeek(tts.elapsedTime).then(function (res) {
                            startPlayer(player, tts.volume, false, /*true ||*/ tts.playbackState === 'PLAYING');
                        }, function (error) {
                            adapter.log.error('Cannot trackSeek: ' + error);
                        });
                    }, function (error) {
                        adapter.log.error('Cannot seek: ' + error);
                        resetTts(player);
                    });
                }
            }
        }

        if (ps.playing) {
            if (!channels[ip].elapsedTimer) {
                channels[ip].elapsedTimer = setInterval(function (ip_) {
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

    if (sonosState.currentTrack.albumArtUri && lastCover !== sonosState.currentTrack.albumArtUri) {
        var md5url     = crypto.createHash('md5').update(sonosState.currentTrack.albumArtUri).digest('hex');
        var fileName   = cacheDir + md5url;
        var stateName  = adapter.namespace + '.root.' + ip + '.cover.png';
        var defaultImg = __dirname + '/img/browse_missing_album_art.png';

        if (!fs.existsSync(fileName)) {
            adapter.log.debug('Cover file does not exist. Fetching via HTTP');
            http.get({
                hostname: getIp(discovery.getPlayerByUUID(channels[ip].uuid), true),
                port: 1400,
                path: sonosState.currentTrack.albumArtUri
            }, function (res2) {
                adapter.log.debug('HTTP status code ' + res2.statusCode);
                if (res2.statusCode === 200) {
                    if (!fs.existsSync(fileName)) {
                        var cacheStream = fs.createWriteStream(fileName);
                        res2.pipe(cacheStream).on('finish', function() {
                            readCoverFileToState(fileName, stateName, ip);
                        });
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

                res2.on('end', function () {
                    adapter.log.debug('Response "end" event');
                });
            }).on('error', function (e) {
                adapter.log.warn('Got error: ' + e.message);
            });
        } else {
            adapter.log.debug('Cover exists. Try reading from fs');
            var fileData = null;
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
            if (fileData) adapter.setBinaryState(stateName, fileData, function () {
                adapter.setState({device: 'root', channel: ip, state: 'current_cover'}, {val: '/state/' + stateName, ack: true});
            });
        }

        lastCover = sonosState.currentTrack.albumArtUri;
    }
    adapter.setState({device: 'root', channel: ip, state: 'current_elapsed'},    {val: sonosState.elapsedTime, ack: true});
    channels[ip].elapsed  = sonosState.elapsedTime;
    channels[ip].duration = sonosState.currentTrack.duration;
    adapter.setState({device: 'root', channel: ip, state: 'seek'},               {val: Math.round((channels[ip].elapsed / channels[ip].duration) * 1000) / 10, ack: true});
    adapter.setState({device: 'root', channel: ip, state: 'current_elapsed_s'},  {val: sonosState.elapsedTimeFormatted, ack: true});
    adapter.setState({device: 'root', channel: ip, state: 'volume'},             {val: sonosState.volume, ack: true});
    if (sonosState.groupState) {
        adapter.setState({device: 'root', channel: ip, state: 'muted'},          {val: sonosState.groupState.mute, ack: true});
    }
}

function readCoverFileToState(fileName, stateName, ip) {
    var fileData = null;
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
        adapter.setBinaryState(stateName, fileData, function () {
            adapter.setState({device: 'root', channel: ip, state: 'current_cover'}, {val: '/state/' + stateName, ack: true});
        });
    }
}

function takeSonosFavorites(ip, favorites) {
    var sFavorites = '';
    for (var favorite in favorites) {
        if (!favorites.hasOwnProperty(favorite)) continue;
        if (favorites[favorite].title) {
            sFavorites += ((sFavorites) ? ', ' : '') + favorites[favorite].title;
        }
    }

    adapter.setState({device: 'root', channel: ip, state: 'favorites_list'}, {val: sFavorites, ack: true});
}

function getIp(player, noReplace) {
    var m = player.baseUrl.match(/http:\/\/([.\d]+):?/);
    if (m && m[1]) {
        return noReplace ? m[1] : m[1].replace(/[.\s]+/g, '_');
    } else {
        return null;
    }
}

function processSonosEvents(event, data) {
    var ip;
    var i;
    var player;
    if (event === 'topology-change') {
        // TODO: Check
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
        for (i = 0; i < discovery.players.length; i++) {
            if (discovery.players[i].roomName === data.roomName) {
                player = discovery.getPlayerByUUID(discovery.players[i].uuid);
                if (!player._address) player._address = getIp(player);

                ip = player._address;
                if (channels[ip]) {
                    channels[ip].uuid = discovery.players[i].uuid;
                    adapter.setState({device: 'root', channel: ip, state: 'muted'}, {val: data.newMute, ack: true});
                    //adapter.setState({device: 'root', channel: ip, state: 'muted'},  {val: data.groupState.mute,  ack: true});
                    //player._isMuted = data.groupState.mute;
                    player._isMuted  = data.newMute;
                    adapter.log.debug('group-mute: Mute for ' + player.baseUrl + ': ' + data.newMute);
                }
            }
        }
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
            .then(function (favorites) {
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
            var _text = [];
            for (var q = 0; q < data.queue.length; q++) {
                _text.push(data.queue[q].artist + ' - ' + data.queue[q].title);
            }
            var qtext = _text.join(', ');
            adapter.setState({device: 'root', channel: ip, state: 'queue'},  {val: qtext, ack: true});
            adapter.log.debug('queue for ' + player.baseUrl + ': ' + qtext);
        }
        discovery.getFavorites()
            .then(function (favorites) {
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
    for (var g in newGroupStates) {
        adapter.getState(channel._id + '.' + g, function (_g, err, obj) {
            if (err || !obj) {
                var dcs = adapter.idToDCS(channel._id + '.' + _g);
                adapter.createState(dcs.device, dcs.channel, dcs.state, newGroupStates[_g]);
            }
        }.bind(null, g));
    }
}

function syncConfig() {
    channels = {};

    adapter.getDevices(function (err, devices) {
        if (devices && devices.length) {
            // Go through all devices
            for (var i = 0; i < devices.length; i++) {

                adapter.getChannelsOf(devices[i].common.name, function (err, _channels) {
                    var configToDelete = [];
                    var configToAdd    = [];
                    var k;
                    if (adapter.config.devices) {
                        for (k = 0; k < adapter.config.devices.length; k++) {
                            configToAdd.push(adapter.config.devices[k].ip);
                        }
                    }

                    if (_channels) {
                        for (var j = 0; j < _channels.length; j++) {
                            var ip = _channels[j].native.ip;
                            var id = ip.replace(/[.\s]+/g, '_');
                            var pos = configToAdd.indexOf(ip);
                            if (pos !== -1) {
                                checkNewGroupStates(_channels[j]);
                                configToAdd.splice(pos, 1);
                                // Check name and room
                                for (var u = 0; u < adapter.config.devices.length; u++) {
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

                                channels[ip.replace(/[.\s]+/g, '_')] = {
                                    uuid:     '',
                                    player:   null,
                                    duration: 0,
                                    elapsed:  0,
                                    obj:      _channels[j]
                                };

                            } else {
                                configToDelete.push(ip);
                            }
                        }
                    }

                    if (configToAdd.length) {
                        for (var r = 0; r < adapter.config.devices.length; r++) {
                            if (adapter.config.devices[r].ip && configToAdd.indexOf(adapter.config.devices[r].ip) !== -1) {
                                addChannel(adapter.config.devices[r].name, adapter.config.devices[r].ip, adapter.config.devices[r].room, function (err, obj) {
                                    adapter.getObject(obj.id, function (err, obj) {
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
                    }
                    if (configToDelete.length) {
                        for (var e = 0; e < configToDelete.length; e++) {
                            if (configToDelete[e]) {
                                var _id = configToDelete[e].replace(/[.\s]+/g, '_');
                                adapter.deleteChannelFromEnum('room', 'root', _id);
                                adapter.deleteChannel('root', _id);
                            }
                        }
                    }
                });
            }
        } else {
            for (var r = 0; r < adapter.config.devices.length; r++) {
                if (!adapter.config.devices[r].ip) continue;
                addChannel(adapter.config.devices[r].name, adapter.config.devices[r].ip, adapter.config.devices[r].room, function (err, obj) {
                    adapter.getObject(obj.id, function (err, obj) {
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

var discovery   = null;
var playerIps   = [];
var playerCycle = 0;
var queues      = {};
var cacheDir    = '';

function main() {
    adapter.config.fadeIn  = parseInt(adapter.config.fadeIn,  10) || 0;
    adapter.config.fadeOut = parseInt(adapter.config.fadeOut, 10) || 0;
    syncConfig ();
    adapter.subscribeStates('*');

    var _path = tools.getConfigFileName().split('/');
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
        var fileServer  = new Static.Server(__dirname + '/node_modules/sonos-web-controller/static');

        cacheDir = adapter.config.cacheDir ? (__dirname + adapter.config.cacheDir) : cacheDir;
        // Remove last "/"
        if (cacheDir[cacheDir.length - 1] !== '/') cacheDir += '/';

        fs.mkdir(cacheDir, function (e) {
            if (e && e.code !== 'EEXIST') {
                adapter.log.error('creating cache dir failed.', e);
            }
        });

        server = http.createServer(function (req, res) {
            var fileName;
            if (/^\/tts/.test(req.url)) {
                var parts = req.url.split('/');
                fileName = parts[parts.length - 1];
                parts = fileName.split('?');
                fileName = parts[0];
                fileName = path.join(cacheDir, fileName);
                adapter.log.debug('Request ' + req.url);
                fs.exists(fileName, function (exists) {
                    if (exists) {
                        var stat = fs.statSync(fileName);

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
                var md5url = crypto.createHash('md5').update(req.url).digest('hex');
                var fileName = path.join(cacheDir, md5url);

                fs.exists(fileName, function (exists) {
                    if (exists) {
                        var readCache = fs.createReadStream(fileName);
                        readCache.pipe(res);
                        return;
                    }

                    const player = discovery.getAnyPlayer();
                    if (!player) return;

                    adapter.log.debug('fetching album art from', player.localEndpoint);
                    http.get(player.baseUrl + req.url, function (res2) {
                        if (res2.statusCode === 200) {
                            if (!fs.exists(fileName)) {
                                var cacheStream = fs.createWriteStream(fileName);
                                res2.pipe(cacheStream);
                            } else {
                                res2.resume();
                            }
                        } else if (res2.statusCode === 404) {
                            // no image exists! link it to the default image.
                            fs.link( __dirname + '/img/browse_missing_album_art.png', fileName, function (e) {
                                res2.resume();
                                if (e) adapter.log.warn(e);
                            });
                        }

                        res2.on('end', function () {
                            adapter.log.debug('serving ', req.url);
                            var readCache = fs.createReadStream(fileName);
                            readCache.on('error', function (e) {
                                adapter.log.error(e);
                            });
                            readCache.pipe(res);
                        });
                    }).on('error', function (e) {
                        adapter.log.error('Got error: ' + e.message);
                    });
                });
            } else {
                req.addListener('end', function () {
                    fileServer.serve(req, res);
                }).resume();
            }
        });

        socketServer = io.listen(server);
        //socketServer.set('log level', 1);

        socketServer.sockets.on('connection', function (socket) {
            // Send it in a better format
            var players = discovery.players;

            if (players.length === 0) return;

            socket.emit('topology-change', players);
            discovery.getFavorites()
                .then(function (favorites) {
                    socket.emit('favorites', favorites);
            });

            socket.on('transport-state', function (data) {
                // find player based on uuid
                const player = discovery.getPlayerByUUID(data.uuid);

                if (!player) return;

                // invoke action
                //console.log(data)
                player[data.state]();
            });

            socket.on('group-volume', function (data) {
                // find player based on uuid
                const player = discovery.getPlayerByUUID(data.uuid);
                if (!player) return;

                // invoke action
                player.setGroupVolume(data.volume);
            });

            socket.on('group-management', function (data) {
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

            socket.on('play-favorite', function (data) {
                var player = discovery.getPlayerByUUID(data.uuid);
                if (!player) return;

                player.replaceWithFavorite(data.favorite)
                    .then(function () {player.play();});
            });

            socket.on('queue', function (data) {
                loadQueue(data.uuid)
                    .then(function (queue) {
                        socket.emit('queue', { uuid: data.uuid, queue: queue });
                    });
            });

            socket.on('seek', function (data) {
                var player = discovery.getPlayerByUUID(data.uuid);
                if (player.avTransportUri.startsWith('x-rincon-queue')) {
                    player.trackSeek(data.trackNo);
                    return;
                }

                // Player is not using queue, so start queue first
                player.setAVTransport('x-rincon-queue:' + player.uuid + '#0')
                    .then(function () {player.trackSeek(data.trackNo);})
                    .then(function () {player.play();});
            });

            socket.on('playmode', function (data) {
                var player = discovery.getPlayerByUUID(data.uuid);
                for (var action in data.state) {
                    player[action](data.state[action]);
                }
            });

            socket.on('volume', function (data) {
                var player = discovery.getPlayerByUUID(data.uuid);
                player.setVolume(data.volume);
            });

            socket.on('group-mute', function (data) {
                //console.log(data);
                var player = discovery.getPlayerByUUID(data.uuid);
                if (data.mute)
                    player.muteGroup();
                else
                    player.unMuteGroup();
            });

            socket.on('mute', function (data) {
                var player = discovery.getPlayerByUUID(data.uuid);
                if (data.mute)
                    player.mute();
                else
                    player.unMute();
            });

            socket.on('track-seek', function (data) {
                var player = discovery.getPlayerByUUID(data.uuid);
                player.timeSeek(data.elapsed);
            });

            socket.on('search', function (data) {
                search(data.term, socket);
            });

            socket.on('error', function (e) {
                adapter.log.error('Sonos reported error: ' + e);
            })
        });
    }

    discovery.on('topology-change', function (data) {
        if (socketServer) socketServer.sockets.emit('topology-change', discovery.players);
        processSonosEvents('topology-change', data);
    });

    discovery.on('transport-state', function (data) {
        if (socketServer) socketServer.sockets.emit('transport-state', data);
        processSonosEvents('transport-state', data);
    });

    discovery.on('group-volume', function (data) {
        if (socketServer) socketServer.sockets.emit('group-volume', data);
        processSonosEvents('group-volume', data);
    });

    discovery.on('volume-change', function (data) {
        if (socketServer) socketServer.sockets.emit('volume', data);
        processSonosEvents('volume', data);
    });

    discovery.on('group-mute', function (data) {
        if (socketServer)socketServer.sockets.emit('group-mute', data);
        processSonosEvents('group-mute', data);
    });

    discovery.on('mute-change', function (data) {
        if (socketServer) socketServer.sockets.emit('mute', data);
        processSonosEvents('mute', data);
    });

    discovery.on('favorites', function (data) {
        if (socketServer) socketServer.sockets.emit('favorites', data);
        processSonosEvents('favorites', data);
    });

    discovery.on('queue-change', function (player) {
        //console.log('queue-change', data);
        delete queues[player.uuid];
        if (socketServer) {
            loadQueue(player.uuid)
                .then(function (queue) {
                    socketServer.sockets.emit('queue', { uuid: player.uuid, queue: queue });
                    processSonosEvents('queue', { uuid: player.uuid, queue: queue });
                });
        }
    });
    
    discovery.on('list-change', function (data) {
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
            .then(function (queue) {
                queues[uuid] = queue;
                return queue;
            });
    }

    function search(term, socket) {
        adapter.log.debug('search for', term);
        var playerCycle = 0;
        var players = [];

        for (var i in discovery.players) {
            players.push(discovery.players[i]);
        }

        function getPlayer() {
            var player = players[playerCycle++ % players.length];
            return player;
        }

        var response = {};

        async.parallelLimit([
            function (callback) {
                var player = getPlayer();
                console.log('fetching from', player.baseUrl)
                player.browse('A:ARTIST:' + term, 0, 600, function (success, result) {
                    console.log(success, result)
                    response.byArtist = result;
                    callback(null, 'artist');
                });
            },
            function (callback) {
                var player = getPlayer();
                console.log('fetching from', player.baseUrl)
                player.browse('A:TRACKS:' + term, 0, 600, function (success, result) {
                    response.byTrack = result;
                    callback(null, 'track');
                });
            },
            function (callback) {
                var player = getPlayer();
                console.log('fetching from', player.baseUrl)
                player.browse('A:ALBUM:' + term, 0, 600, function (success, result) {
                    response.byAlbum = result;
                    callback(null, 'album');
                });
            }
        ], players.length, function (err, result) {

            socket.emit('search-result', response);
        });
    }

    if (adapter.config.webserverEnabled) {
        server.listen(adapter.config.webserverPort);
        adapter.log.info('http sonos server listening on port ' + adapter.config.webserverPort);
    }
}
