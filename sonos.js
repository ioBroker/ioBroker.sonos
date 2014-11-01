/**
 *      CCU.IO Sonos Adapter
 *      12'2013-2014 Bluefox
 *
 *      Version 0.3
 *      derived from https://github.com/jishi/node-sonos-web-controller by Jimmy Shimizu
 */
var adapter = require(__dirname + '/../../lib/adapter.js')('sonos');

adapter.on('objectChange', function (id, obj) {

});

// {"val": state, "ack":false, "ts":1408294295, "from":"admin.0", "lc":1408294295}
// id = sonos.0.192_168_1_55.state
adapter.on('stateChange', function (_id, state) {
    if (state.ack) return;
    adapter.log.info("try to control id " + _id + " with " + JSON.stringify(state));
    // Try to find the object
    var id = adapter.idToDCS(_id);

    if (id && id.channel && channels[id.channel]) {
        if (state.val === "false") state.val = false;
        if (state.val === "true")  state.val = true;
        if (parseInt(state.val) == state.val) state.val = parseInt(state.val);

        var player = channels[id.channel].player;
        if (!player) {
            player = discovery.getPlayerByUUID(channels[id.channel].uuid);
            channels[id.channel].player = player;
        }
        if (player) {
            if (id.state == 'state_simple') {
                if (!state.val) {
                    player.pause();
                } else {
                    player.play();
                }
            } else
            if (id.state == 'muted') {
                player.mute(!!state.val); // !! is toBoolean()
            } else
            if (id.state == 'volume') {
                player.setVolume(state.val);
            } else //stop,play,pause,next,previous,mute,unmute
            if (id.state == 'state') {
                state.val = state.val.toLowerCase();
                if (state.val == "stop") {
                    player.pause ();
                } else
                if (state.val == "play") {
                    player.play ();
                } else
                if (state.val == "pause") {
                    player.pause ();
                } else
                if (state.val == "next") {
                    player.nextTrack ();
                } else
                if (state.val == "previous") {
                    player.previousTrack ();
                } else
                if (state.val == "mute") {
                    player.mute (true);
                }
                if (state.val == "unmute") {
                    player.mute (false);
                }
            } else if (id.state == 'favorite_set') {
                player.replaceWithFavorite(state.val, function (success) {
                    if (success) {
                        player.play();
                        adapter.setState({device: 'root', channel: id.channel, state: 'current_album'},  {val: val, ack: true});
                        adapter.setState({device: 'root', channel: id.channel, state: 'current_artist'}, {val: val, ack: true});
                    }
                });
            } else {
                adapter.log.warn("adapter sonos  try to control unknown id " + id);
            }
        } else {
            adapter.log.warn("adapter sonos   SONOS " + channels[id.channel].uuid + " not found");
        }
    }
});

adapter.on('install', function () {
    adapter.createDevice("root", []);
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
    main();
});

// New message arrived. obj is array with current messages
adapter.on('message', function (obj) {
    var wait = false;
    if (obj) {
        switch (obj.command) {
            case 'send':
                if (obj.message) {
                    text2speech(obj.message);
                }
                break;

            /*case 'add':
                wait = true;
                if (obj.message) {
                    addChannel(obj.message, [], function (err) {
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, err, obj.callback);
                    });
                } else {
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, "Invalid IP address: " + obj.message, obj.callback);
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
                    adapter.deleteChannel("root", obj.message, function (err) {
                        sonosInit();
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, err, obj.callback);
                    });
                } else {
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, "Invalid IP address: " + obj.message, obj.callback);
                }
                break;
*/
            default:
                adapter.log.warn("Unknown command: " + obj.command);
                break;
        }
    }

    if (!wait && obj.callback) {
        adapter.sendTo(obj.from, obj.command, obj.message, obj.callback);
    }

    return true;
});

var io             = require('./node_modules/sonos-web-controller/node_modules/socket.io');
var http           = require('http');
var static         = require('./node_modules/sonos-web-controller/node_modules/node-static');
var fs             = require('fs');
var crypto         = require('crypto');
var sonosDiscovery = require('sonos-discovery');
var path           = require('path');
var dgram          = require("dgram");

var channels    = {};
var server;        // Sonos HTTP server
var socketServer;  // Sonos socket for HTTP Server
var lastCover =   null;

function toFormattedTime(time) {
    var hours = Math.floor(time / 3600);
    hours = (hours) ? (hours + ":") : "";
    var min = Math.floor(time / 60) % 60;
    if (min < 10) min = "0" + min;
    var sec = time % 60;
    if (sec < 10) sec = "0" + sec;

    return hours + min + ":" + sec;
}

function createChannel(name, ip, room, callback) {
    var states = {
        'state_simple': {      // media.state -            Text state of player: stop, play, pause (read, write)
            def:    'false',
            type:   'boolean',
            read:   'true',
            write:  'true',
            role:   'media.state',
            desc:   'Play or pause'
        },
        'state': {             // media.state -            Text state of player: stop, play, pause (read, write)
            def:    'stop',
            type:   'string',
            read:   'true',
            write:  'true',
            values: 'stop,play,pause,next,previous,mute,unmute',
            role:   'media.state',
            desc:   'Play, stop, or pause, next, previous, mute, unmute'
        },
        'volume': {            // media.volume -           volume level (read, write)
            def:    'number',
            type:   'boolean',
            read:   'true',
            write:  'true',
            role:   'media.volume',
            min:    '0',
            max:    '100',
            desc:   'State and control of volume'
        },
        'muted': {             // media.muted -            is muted (read only)
            def:    'false',
            type:   'boolean',
            read:   'true',
            write:  'true',
            role:   'media.muted',
            min:    'false',
            max:    'true',
            desc:   'Is muted'
        },
        'current_title': {     // media.current.title -    current title (read only)
            def:    '',
            type:   'string',
            read:   'true',
            write:  'false',
            role:   'media.current.title',
            desc:   'Title of current played song'
        },
        'current_artist': {    // media.current.artist -   current artist (read only)
            def:    '',
            type:   'string',
            read:   'true',
            write:  'false',
            role:   'media.current.artist',
            desc:   'Artist of current played song'
        },
        'current_album': {     // media.current.album -    current album (read only)
            def:    '',
            type:   'string',
            read:   'true',
            write:  'false',
            role:   'media.current.album',
            desc:   'Album of current played song'
        },
        'current_cover': {     // media.current.cover -    current url to album cover (read only)
            def:    '',
            type:   'string',
            read:   'true',
            write:  'false',
            role:   'media.current.cover',
            desc:   'Cover image of current played song'
        },
        'current_duration': {  // media.current.duration - duration as HH:MM:SS (read only)
            def:    '00:00',
            type:   'string',
            read:   'true',
            write:  'false',
            unit:   'interval',
            role:   'media.current.duration',
            desc:   'Duration of current played song as HH:MM:SS'
        },
        'current_duration_s': {// media.current.duration - duration in seconds (read only)
            def:    '0',
            type:   'number',
            read:   'true',
            write:  'false',
            unit:   'seconds',
            role:   'media.current.duration',
            desc:   'Duration of current played song in seconds'
        },
        'alive': {             // indicator.reachable -    if player alive (read only)
            type:   'boolean',
            read:   'true',
            write:  'false',
            role:   'indicator.reachable',
            desc:   'If sonos alive or not'
        },
        'current_elapsed': {   // media.current.elapsed -  elapsed time in HH:MM:SS (read only)
            def:    '00:00',
            type:   'string',
            read:   'true',
            write:  'false',
            unit:   'interval',
            role:   'media.current.elapsed',
            desc:   'Elapsed time of current played song as HH:MM:SS'
        },
        'current_elapsed_s': { // media.current.elapsed -  elapsed time in seconds (read only)
            def:    '0',
            type:   'number',
            read:   'true',
            write:  'false',
            unit:   'seconds',
            role:   'media.current.elapsed',
            desc:   'Elapsed time of current played song in seconds'
        },
        'favorites_list': {    // media.favorites.list -   list of favorites channel (read only)
            def:    '',
            type:   'string',
            read:   'true',
            write:  'false',
            role:   'media.favorites.list',
            desc:   'List of favorites song or stations, divided by comma'
        },
        'favorites_set': {     // media.favorites.set -    select favorites from list (write only)
            def:    '',
            type:   'string',
            read:   'false',
            write:  'true',
            role:   'media.favorites.set',
            desc:   'Set favorite from the list to play'
        }
    };

    var states_list = [];
    for (var state in states) {
        states_list.push(state);
    }
    var id = ip.replace(/\./g, '_');

    adapter.createChannel('root', id, states_list, {
        role: 'media.music',
        name: name || ip
    }, {
        ip: ip
    }, function () {
        if (callback) callback();
    });

    if (room) {
        adapter.addChannelToEnum('room', room, 'root', id);
    }
    for (var j = 0; j < states_list.length; j++) {
        adapter.createState('root', id, states_list[j], states[states_list[j]]);
    }
}

function browse(callback) {
    var result = [];
    for (var uuid in discovery.players) {
        result.push({roomName: discovery.players[uuid].roomName, ip: discovery.players[uuid].address});
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
            if (str.indexOf ("Sonos") != -1) {
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

function text2speech(fileName, callback) {

    for (var uuid in discovery.players) {
        // Use the preset action to play the tts file
        var tts_params = {
            "players": [{
                    "roomName": discovery.players[uuid], // TODO get room name
                    "volume":   discovery.players[uuid].getState().volume
                }
            ],
            "state": "play",
            "uri": "http://" + discovery.localEndpoint + ":" + adapter.config.webserverPort + "/tts/" + filename,
            "playMode": "NORMAL"
        };
        discovery.applyPreset(tts_params);
    }

    if (callback) callback();
}

function addChannel(name, ip, room, callback) {
    adapter.getObject("root", function (err, obj) {
        var channels = [];
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

function takeSonosState(ip, sonosState) {
    adapter.setState({device: 'root', channel: ip, state: 'alive'}, {val: true, ack: true});
    if (sonosState.playerState != "TRANSITIONING") {
        adapter.setState({device: 'root', channel: ip, state: 'state_simple'}, {val:  sonosState.playerState == "PLAYING", ack: true});
        adapter.setState({device: 'root', channel: ip, state: 'state'},        {val: (sonosState.playerState == "PAUSED_PLAYBACK") ? 'pause' : ((sonosState.playerState == "PLAYING") ? 'play' : 'stop'), ack: true});

        if (sonosState.playerState == "PLAYING") {
            if (!channels[ip].elapsedTimer) {
                channels[ip].elapsedTimer = setInterval(function (ip_) {
                    channels[ip_].elapsed += ((adapter.config.elapsedInterval || 5000) / 1000);

                    if (channels[ip_].elapsed > channels[ip_].duration) {
                        channels[ip_].elapsed = channels[ip_].duration;
                    }

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
    // elapsed time
    adapter.setState({device: 'root', channel: ip, state: 'current_album'},      {val: sonosState.currentTrack.album, ack: true});
    adapter.setState({device: 'root', channel: ip, state: 'current_artist'},     {val: sonosState.currentTrack.artist, ack: true});
    adapter.setState({device: 'root', channel: ip, state: 'current_title'},      {val: sonosState.currentTrack.title, ack: true});
    adapter.setState({device: 'root', channel: ip, state: 'current_duration'},   {val: sonosState.currentTrack.duration, ack: true});
    adapter.setState({device: 'root', channel: ip, state: 'current_duration_s'}, {val: toFormattedTime(sonosState.currentTrack.duration), ack: true});
    if (lastCover != sonosState.currentTrack.albumArtURI) {
        var md5url     = crypto.createHash('md5').update(sonosState.currentTrack.albumArtURI).digest('hex');
        var fileName   = __dirname + '/cache/' + md5url;
        var stateName  = adapter.namespace + '.root.' + ip + '.cover.png';
        var defaultImg = __dirname + '/node_modules/sonos-web-controller/lib/browse_missing_album_art.png';

        if (!fs.existsSync(fileName)) {
            console.log('fetching album art from', discovery.players[channels[ip].uuid].address);
            http.get({
                hostname: discovery.players[channels[ip].uuid].address,
                port: 1400,
                path: sonosState.currentTrack.albumArtURI
            }, function (res2) {
                console.log(res2.statusCode);
                if (res2.statusCode == 200) {
                    if (!fs.exists(fileName)) {
                        var cacheStream = fs.createWriteStream(fileName);
                        res2.pipe(cacheStream);
                    } else {
                        res2.resume();
                    }
                } else if (res2.statusCode == 404) {
                    // no image exists! link it to the default image.
                    fileName = defaultImg;
                    res2.resume();
                }

                res2.on('end', function () {
                    var fileData = null;
                    try {
                        fileData = fs.readFileSync(fileName);
                    } catch (e) {
                        adapter.log.warn("Cannot read file: " + e);
                    }
                    // If error or null length file, read standart cover file
                    if (!fileData) {
                        try {
                            fileData = fs.readFileSync(defaultImg);
                        } catch (e) {
                            adapter.log.warn("Cannot read file: " + e);
                        }
                    }
                    if (fileData) adapter.setBinaryState(stateName, fileData);
                });
            }).on('error', function (e) {
                console.log("Got error: " + e.message);
            });
        } else {
            var fileData = null;
            try {
                fileData = fs.readFileSync(fileName);
            } catch (e) {
                adapter.log.warn("Cannot read file: " + e);
            }
            // If error or null length file, read standart cover file
            if (!fileData) {
                try {
                    fileData = fs.readFileSync(defaultImg);
                } catch (e) {
                    adapter.log.warn("Cannot read file: " + e);
                }
            }
            if (fileData) adapter.setBinaryState(stateName, fileData);
        }

        lastCover = sonosState.currentTrack.albumArtURI;
    }
    adapter.setState({device: 'root', channel: ip, state: 'current_cover'},      {val: '/state/' + adapter.namespace + '.' + sonosState.currentTrack.albumArtURI, ack: true});
    adapter.setState({device: 'root', channel: ip, state: 'current_elapsed'},    {val: sonosState.elapsedTime, ack: true});
    channels[ip].elapsed  = sonosState.elapsedTime;
    channels[ip].duration = sonosState.currentTrack.duration;
    adapter.setState({device: 'root', channel: ip, state: 'current_elapsed_s'},  {val: sonosState.elapsedTimeFormatted, ack: true});
    adapter.setState({device: 'root', channel: ip, state: 'volume'},             {val: sonosState.volume, ack: true});
    if (sonosState.groupState) {
        adapter.setState({device: 'root', channel: ip, state: 'muted'},          {val: sonosState.groupState.mute, ack: true});
    }
}

function takeSonosFavorites(ip, favorites) {
	var sFavorites = "";
	for (var favorite in favorites) {
        if (favorites[favorite].title) {
            sFavorites += ((sFavorites) ? ", ": "") + favorites[favorite].title;
        }
	}
	
    adapter.setState({device: 'root', channel: ip, state: 'favorites_list'}, {val: sFavorites, ack: true});
}

function processSonosEvents(event, data) {
    var ids;
    var ip;
    var i;
    if (event == "topology-change") {
        if (typeof data.length == 'undefined') {
            if (!discovery.players[data.uuid]._address) {
                discovery.players[data.uuid]._address = discovery.players[data.uuid].address.replace(/[.\s]+/g, '_');
            }

            ip = discovery.players[data.uuid]._address;
            if (channels[ip]) {
                channels[ip].uuid = data.uuid;
                adapter.setState({device: 'root', channel: ip, state: 'alive'}, {val: true, ack: true});
            }
        } else if (data.length) {
            for (i = 0; i < data.length; i++) {
                if (!discovery.players[data[i].uuid]._address) {
                    discovery.players[data[i].uuid]._address = discovery.players[data[i].uuid].address.replace(/[.\s]+/g, '_');
                }
                ip = discovery.players[data[i].uuid]._address;
                if (channels[ip]) {
                    channels[ip].uuid = data[i].uuid;
                    adapter.setState({device: 'root', channel: ip, state: 'alive'}, {val: true, ack: true});
                }
            }
        }
    } else if (event == "transport-state") {
        if (!discovery.players[data.uuid]._address) discovery.players[data.uuid]._address = discovery.players[data.uuid].address.replace(/[.\s]+/g, '_');

        ip = discovery.players[data.uuid]._address;
        if (channels[ip]) {
            channels[ip].uuid = data.uuid;
            takeSonosState(ip, data.state);
        }
    } else if (event == "group-volume") {
        for (var s in data.playerVolumes) {
            if (!discovery.players[s]._address) discovery.players[s]._address = discovery.players[s].address.replace(/[.\s]+/g, '_');

            ip = discovery.players[s]._address;
            if (channels[ip]) {
                channels[ip].uuid = s;
                adapter.setState({device: 'root', channel: ip, state: 'volume'}, {val: data.playerVolumes[s], ack: true});
                adapter.setState({device: 'root', channel: ip, state: 'muted'},  {val: data.groupState.mute, ack: true});
            }
        }
    } else if (event == "favorites") {
        // Go through all players
        for (var uuid in discovery.players) {
            if (!discovery.players[uuid]._address) discovery.players[uuid]._address = discovery.players[uuid].address.replace(/[.\s]+/g, '_');

            ip = discovery.players[uuid]._address;
            if (channels[ip]) {
                channels[ip].uuid = uuid;
                takeSonosFavorites(ip, data);
            }
        }
    } else {
        console.log(event + ' ' + data);
    }
}

function syncConfig() {
    var dp;
    var chnDp;
    var devChannels = [];
    channels = {};

    adapter.getDevices(function (err, devices) {
        if (devices) {
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

                    for (var j = 0; j < _channels.length; j++) {
                        var ip = _channels[j].native.ip;
                        var pos = configToAdd.indexOf(ip);
                        if (pos != -1) {
                            configToAdd.splice(pos, 1);
                            // Check name and room
                            for (var u = 0; u < adapter.config.devices.length; u++) {
                                if (adapter.config.devices[u].ip == ip) {
                                    if (_channels[j].common.name != (adapter.config.devices[u].name || adapter.config.devices[u].ip)) {
                                        adapter.extendObject(_channels[j]._id, {common: {name: (adapter.config.devices[u].name || adapter.config.devices[u].ip)}});
                                    }
                                    if (adapter.config.devices[u].room) {
                                        adapter.addChannelToEnum('room', adapter.config.devices[u].room, 'root', _channels[j]._id);
                                    } else {
                                        adapter.deleteChannelFromEnum('room', 'root', _channels[j]._id);
                                    }
                                }
                            }
                        } else {
                            configToDelete.push(ip);
                        }
                        channels[ip.replace(/[.\s]+/g, '_')] = {
                            uuid:     "",
                            player:   null,
                            duration: 0,
                            elapsed:  0,
                            obj:      _channels[j]
                        };
                    }

                    if (configToAdd.length) {
                        for (var r = 0; r < adapter.config.devices.length; r++) {
                            if (configToAdd.indexOf(adapter.config.devices[r].ip) != -1) {
                                addChannel(adapter.config.devices[r].name, adapter.config.devices[r].ip, adapter.config.devices[r].room);
                            }
                        }
                    }
                    if (configToDelete.length) {
                        for (var e = 0; e < adapter.config.devices.length; e++) {
                            if (configToDelete.indexOf(adapter.config.devices[e].ip) != -1) {
                                adapter.deleteChannel('root', adapter.config.devices[e].ip.replace(/\./g, '_'));
                            }
                        }
                    }
                });
            }
        }
    });
}

var discovery   = null;
var playerIps   = [];
var playerCycle = 0;
var queues      = {};

function main() {
    syncConfig ();
    adapter.subscribeStates('*');

    discovery = new sonosDiscovery();
// from here the code is mostly from https://github.com/jishi/node-sonos-web-controller/blob/master/server.js

    if (adapter.config.webserverEnabled) {
        var cacheDir    = __dirname + '/cache';
        var fileServer  = new static.Server(__dirname + '/node_modules/sonos-web-controller/static');

        fs.mkdir(cacheDir, function (e) {
            if (e && e.code != 'EEXIST')
                console.log('creating cache dir failed.', e);
        });

        server = http.createServer(function (req, res) {
            if (/^\/getaa/.test(req.url)) {
                // this is a resource, download from player and put in cache folder
                var md5url = crypto.createHash('md5').update(req.url).digest('hex');
                var fileName = path.join(cacheDir, md5url);

                if (playerIps.length === 0) {
                    for (var i in discovery.players) {
                        playerIps.push(discovery.players[i].address);
                    }
                }

                fs.exists = fs.exists || path.exists;
                fs.exists(fileName, function (exists) {
                    if (exists) {
                        var readCache = fs.createReadStream(fileName);
                        readCache.pipe(res);
                        return;
                    }

                    var playerIp = playerIps[playerCycle++%playerIps.length];
                    console.log('fetching album art from', playerIp);
                    http.get({
                        hostname: playerIp,
                        port: 1400,
                        path: req.url
                    }, function (res2) {
                        console.log(res2.statusCode);
                        if (res2.statusCode == 200) {
                            if (!fs.exists(fileName)) {
                                var cacheStream = fs.createWriteStream(fileName);
                                res2.pipe(cacheStream);
                            } else {
                                res2.resume();
                            }
                        } else if (res2.statusCode == 404) {
                            // no image exists! link it to the default image.
                            //console.log(res2.statusCode, 'linking', fileName)
                            fs.link(missingAlbumArt, fileName, function (e) {
                                res2.resume();
                                if (e) console.log(e);
                            });
                        }

                        res2.on('end', function () {
                            console.log('serving', req.url);
                            var readCache = fs.createReadStream(fileName);
                            readCache.on('error', function (e) {
                                console.log(e);
                            });
                            readCache.pipe(res);
                        });
                    }).on('error', function (e) {
                        console.log("Got error: " + e.message);
                    });
                });
            } else {
                req.addListener('end', function () {
                    fileServer.serve(req, res);
                }).resume();
            }
        });

        socketServer = io.listen(server);
        socketServer.set('log level', 1);

        socketServer.sockets.on('connection', function (socket) {
            // Send it in a better format
            var players = [];
            var player;
            for (var uuid in discovery.players) {
                player = discovery.players[uuid];
                players.push(player.convertToSimple());
            }

            if (players.length === 0) return;

            socket.emit('topology-change', players);
            player.getFavorites(function (success, favorites) {
                socket.emit('favorites', favorites);
            });

            socket.on('transport-state', function (data) {
                // find player based on uuid
                var player = discovery.getPlayerByUUID(data.uuid);

                if (!player) return;

                // invoke action
                player[data.state]();
            });

            socket.on('group-volume', function (data) {
                // find player based on uuid
                var player = discovery.getPlayerByUUID(data.uuid);
                if (!player) return;

                // invoke action
                //console.log(data)
                player.groupSetVolume(data.volume);
            });

            socket.on('group-management', function (data) {
                // find player based on uuid
                //console.log(data)
                var player = discovery.getPlayerByUUID(data.player);
                if (!player) return;

                if (data.group === null) {
                    player.becomeCoordinatorOfStandaloneGroup();
                    return;
                }

                player.setAVTransportURI('x-rincon:' + data.group);
            });

            socket.on('play-favorite', function (data) {
                //console.log(data)
                var player = discovery.getPlayerByUUID(data.uuid);
                if (!player) return;

                player.replaceWithFavorite(data.favorite, function (success) {
                    if (success) player.play();
                });
            });

            socket.on('queue', function (data) {
                loadQueue(data.uuid, socket);
            });

            socket.on('seek', function (data) {
                var player = discovery.getPlayerByUUID(data.uuid);
                if (player.avTransportUri.startsWith('x-rincon-queue')) {
                    player.seek(data.trackNo);
                    return;
                }

                // Player is not using queue, so start queue first
                player.setAVTransportURI('x-rincon-queue:' + player.uuid + '#0', '', function (success) {
                    if (success)
                        player.seek(data.trackNo, function (success) {
                            player.play();
                        });
                });
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
                //console.log(data)
                var player = discovery.getPlayerByUUID(data.uuid);
                player.groupMute(data.mute);
            });

            socket.on('mute', function (data) {
                var player = discovery.getPlayerByUUID(data.uuid);
                player.mute(data.mute);
            });

            socket.on('track-seek', function (data) {
                var player = discovery.getPlayerByUUID(data.uuid);
                player.trackSeek(data.elapsed);
            });

            socket.on("error", function (e) {
                console.log(e);
            });
        });
    }

    discovery.on('topology-change', function (data) {
        var players = [];
        for (var uuid in discovery.players) {
            var player = discovery.players[uuid];
            players.push(player.convertToSimple());
        }
        if (socketServer) socketServer.sockets.emit('topology-change', players);

        processSonosEvents ('topology-change', data);
    });

    discovery.on('transport-state', function (data) {
        if (socketServer) socketServer.sockets.emit('transport-state', data);
        processSonosEvents ('transport-state', data);
    });

    discovery.on('group-volume', function (data) {
        if (socketServer) socketServer.sockets.emit('group-volume', data);
        processSonosEvents ('group-volume', data);
    });

    discovery.on('group-mute', function (data) {
        if (socketServer)socketServer.sockets.emit('group-mute', data);
    });

    discovery.on('mute', function (data) {
        if (socketServer) socketServer.sockets.emit('mute', data);
    });

    discovery.on('favorites', function (data) {
        if (socketServer) socketServer.sockets.emit('favorites', data);
        processSonosEvents ('favorites', data);
    });

    discovery.on('queue-changed', function (data) {
        console.log('queue-changed', data);
        delete queues[data.uuid];
        if (socketServer)loadQueue(data.uuid, socketServer.sockets);
        processSonosEvents ('queue-changed', data);
    });


    function loadQueue(uuid, socket) {
        console.time('loading-queue');
        var maxRequestedCount = 600;
        function getQueue(startIndex, requestedCount) {
            console.log('getqueue', startIndex, requestedCount);
            var player = discovery.getPlayerByUUID(uuid);
            if (player) {
                player.getQueue(startIndex, requestedCount, function (success, queue) {
                    if (!success) return;
                    socket.emit('queue', {uuid: uuid, queue: queue});

                    if (!queues[uuid] || queue.startIndex === 0) {
                        queues[uuid] = queue;
                    } else {
                        queues[uuid].items = queues[uuid].items.concat(queue.items);
                    }

                    if (queue.startIndex + queue.numberReturned < queue.totalMatches) {
                        getQueue(queue.startIndex + queue.numberReturned, maxRequestedCount);
                    } else {
                        console.timeEnd('loading-queue');
                    }
                });
            }
        }

        if (!queues[uuid]) {
            getQueue(0, maxRequestedCount);
        } else {
            var queue = queues[uuid];
            queue.numberReturned = queue.items.length;
            socket.emit('queue', {uuid: uuid, queue: queue});
            if (queue.totalMatches > queue.items.length) {
                getQueue(queue.items.length, maxRequestedCount);
            }
        }
    }

    if (adapter.config.webserverEnabled) {
        server.listen(adapter.config.webserverPort);
        console.log("http sonos server listening on port", adapter.config.webserverPort);
    }
}
