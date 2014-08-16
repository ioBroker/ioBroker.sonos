/**
 *      CCU.IO Sonos Adapter
 *      12'2013-2014 Bluefox
 *
 *      Version 0.3
 *      derived from https://github.com/jishi/node-sonos-web-controller by Jimmy Shimizu
 */
var adapter = require(__dirname + '/../../lib/adapter.js')({

    name:           'sonos',

    objectChange: function (id, obj) {

    },

    stateChange: function (id, state) {
        adapter.log.info ("adapter sonos  try to control id " + id + " with " + val);

        if (val === "false") { val = false; }
        if (val === "true")  { val = true; }
        if (parseInt(val) == val) { val = parseInt(val); }


        var player = dev.player;
        if (!player) {
            player = discovery.getPlayerByUUID(dev.uuid);
            dev.player = player;
        }
        if (player) {
            if (id == dev.DPs.STATE) {
                if (val === 0)
                    player.pause();
                else
                    player.play();
            }
            else
            if (id == dev.DPs.MUTED) {
                player.mute (!!val); // !! is toBoolean()
            }
            else
            if (id == dev.DPs.VOLUME) {
                player.setVolume(val);
            }
            else
            if (id == dev.DPs.CONTROL) {
                if (val == "stop") {
                    player.pause ();
                } else
                if (val == "play") {
                    player.play ();
                } else
                if (val == "pause") {
                    player.pause ();
                } else
                if (val == "next") {
                    player.nextTrack ();
                } else
                if (val == "prev") {
                    player.previousTrack ();
                } else
                if (val == "mute") {
                    player.mute (true);
                }
                if (val == "unmute") {
                    player.mute (false);
                }
            }
            else if (id == dev.DPs.FAVORITE_SET) {
                player.replaceWithFavorite(val, function (success) {
                    if (success) {
                        player.play();
                        adapter.setState(dev.DPs.CURRENT_ALBUM,  val);
                        adapter.setState(dev.DPs.CURRENT_ARTIST, val);
                    }
                });
            }
            else
                adapter.log.warn("adapter sonos  try to control unknown id " + id);
        }
        else
            adapter.log.warn("adapter sonos   SONOS " + dev.uuid + " not found");
    },

    install: function () {
        adapter.createDevice("root", []);
    },

    unload: function (callback) {
        try {
            adapter.log.info('terminating');
            if (adapter.config.webserver.enabled) {
                socketServer.server.close();
            }
            callback();
        } catch (e) {
            callback();
        }
    },

    ready: function () {
        main();
    },

    // New message arrived. obj is array with current messages
    message: function (obj) {
        if (obj) {
            switch(obj.command) {
                case 'send':
                    text2speech(obj.message);
                    break;

                case 'add':
                    addChannel(obj.message);
                    break;

                case 'del':
                case 'delete':
                    adapter.deleteChannel("root", obj.message, function () {
                        sonosInit();
                    });
                    break;

                default:
                    this.log.warn("Unknown command: " + obj.command);
            }
        }

        if (obj.callback) {
            adapter.sendTo(obj.from, obj.command, obj.message, obj.callback);
        }

        return true;

        /*"_1": {
            "ip":    "0.0.0.0",
                "name":  "",
                "rooms": [],
                "funcs": []
        }*/

    }

});

var io             = require('./node_modules/sonos-web-controller/node_modules/socket.io'),
    http           = require('http'),
    static         = require('./node_modules/sonos-web-controller/node_modules/node-static'),
    fs             = require('fs'),
    crypto         = require('crypto'),
    sonosDiscovery = require('sonos-discovery');
var path           = require('path');

var channels    = {},
    server,        // Sonos HTTP server
    socketServer;  // Sonos socket for HTTP Server

function toFormattedTime(time) {
    var hours = Math.floor(time / 3600);
    hours = (hours) ? (hours + ":") : "";
    var min = Math.floor(time / 60) % 60;
    if (min < 10) min = "0"+min;
    var sec = time % 60;
    if (sec < 10) sec = "0"+sec;

    return hours + min + ":" + sec;
}

function createChannel(ip, rooms) {
    var states = {
        'state': {             // media.state -            Text state of player: stop, play, pause (read, write)
            def:    'pause',
            type:   'string',
            read:   'true',
            write:  'true',
            values: 'play,stop,pause',
            role:   'media.state',
            desc:   'Play, stop, or pause'
        },
        'playing': {           // media.playing -          true if playing, false if stopped or paused (read, write)
            def:    'false',
            type:   'boolean',
            read:   'true',
            write:  'true',
            role:   'media.playing',
            min:    'false',
            max:    'true',
            desc:   'Is playing or stopped/paused'
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
        'control': {           // media.player.control  -  control as text: play, stop, next, previous, pause (write only)
            type:   'string',
            read:   'false',
            write:  'true',
            values: 'play,stop,pause,previous,next',
            role:   'media.current.control',
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

    adapter.createChannel('root', ip, states_list, 'media.music', function () {
        sonosInit();
    });

    /*if (rooms) {
     chObject.rooms = adapter.config.channels[id].rooms;
     }*/
    for (var j = 0; j < states_list.length; j++) {
        adapter.createState('root', ip, states_list[j], states[states_list[j]]);
    }
}

function addChannel (ip, rooms) {
    adapter.getObject("root", function (err, obj) {
        var channels = [];
        if (err || !obj) {
            adapter.createDevice('root', [], function () {
                createChannel(ip, rooms);
            });
        } else {
            createChannel(ip, rooms);
        }
    });
}

function takeSonosState (ip, sonosState) {
    var channelName = ip;

    adapter.setState(channelName + '.alive', true);
    if (sonosState.playerState != "TRANSITIONING") {
        adapter.setState(channelName + '.state', (sonosState.playerState == "PAUSED_PLAYBACK") ? 'pause' : ((sonosState.playerState == "PLAYING") ? 'play' : 'stop'));
        if (sonosState.playerState == "PLAYING") {
            if (!channels[ip].elapsedTimer) {
                channels[ip].elapsedTimer = setInterval(function (ip_) {
                    channels[ip_].elapsed += ((adapter.config.elapsedInterval || 5000) / 1000);

                    if (channels[ip_].elapsed > channels[ip_].duration) {
                        channels[ip_].elapsed = channels[ip_].duration;
                    }

                    adapter.setState(channelName + '.current_elapsed',   channels[ip_].elapsed);
                    adapter.setState(channelName + '.current_elapsed_s', toFormattedTime(channels[ip_].elapsed));

                }, adapter.config.elapsedInterval || 5000, ip);
            }
        }
        else {
            if (channels[ip].elapsedTimer) {
                clearInterval (channels[ip].elapsedTimer);
                channels[ip].elapsedTimer = null;
            }
        }
    }
    // elapsed time
    adapter.setState(channelName + '.current_album',      sonosState.currentTrack.album);
    adapter.setState(channelName + '.current_artist',     sonosState.currentTrack.artist);
    adapter.setState(channelName + '.current_title',      sonosState.currentTrack.title);
    adapter.setState(channelName + '.current_duration',   sonosState.currentTrack.duration);
    adapter.setState(channelName + '.current_duration_s', toFormattedTime(sonosState.currentTrack.duration));
    adapter.setState(channelName + '.current_cover',      "http://" + 1 + /*settings.binrpc.listenIp + */ ":" + adapter.config.webserver.port + sonosState.currentTrack.albumArtURI);
    adapter.setState(channelName + '.current_elapsed',    sonosState.elapsedTime);
    channels[ip].elapsed  = sonosState.elapsedTime;
    channels[ip].duration = sonosState.currentTrack.duration;
    adapter.setState(channelName + '.current_elapsed_s',  sonosState.elapsedTimeFormatted);
    adapter.setState(channelName + '.volume',             sonosState.volume);
    if (sonosState.groupState) {
        adapter.setState(channelName + '.muted',          sonosState.groupState.mute);
    }
}

function takeSonosFavorites(ip, favorites) {
	var sFavorites = "";
	for (var favorite in favorites){
        if (favorites[favorite].title) {
            sFavorites += ((sFavorites) ? ", ": "") + favorites[favorite].title;
        }
	}
	
    adapter.setState(ip + '.favorites_list', sFavorites);
}

function processSonosEvents(event, data) {
    var ids;

    if (event == "topology-change") {
        if (data.length > 1) {
            for (var i = 0; i < data[1]; i++) {
                if (!discovery.players[data[0].uuid]._address) {
                    discovery.players[data[0].uuid]._address = discovery.players[data[0].uuid].address.replace(/\./g, '_');
                }
                var ip = adapter.namespace + '.root.' + discovery.players[data[0].uuid]._address;
                if (channels[ip]) {
                    adapter.setState('root.' + ip + '.alive', true);
                    channels[ip].uuid = data[0].uuid;
                }
            }
        } else if (data.length) {
            for (var i = 0; i < data.length; i++) {
                if (!discovery.players[data[i].uuid]._address) {
                    discovery.players[data[i].uuid]._address = discovery.players[data[0].uuid].address.replace(/\./g, '_');
                }
                var ip = adapter.namespace + '.root.' + discovery.players[data[i].uuid]._address;
                if (channels[ip]) {
                    adapter.setState('root.' + ip + '.alive', true);
                    channels[ip].uuid = data[i].uuid;
                }
            }
        }
    } else if (event == "transport-state") {
        // Get ccu.io id
        if (!discovery.players[data.uuid]._address) {
            discovery.players[data.uuid]._address = discovery.players[data.uuid].address.replace(/\./g, '_');
        }
        var ip = adapter.namespace + '.root.' + discovery.players[data.uuid]._address;
        if (channels[ip]) {
            takeSonosState (ip, data.state);
            channels[ip].uuid = data.uuid;
        }
    } else if (event == "group-volume") {
        for (var s in data.playerVolumes) {
            if (!discovery.players[s]._address) {
                discovery.players[s]._address = discovery.players[s].address.replace(/\./g, '_');
            }
            var ip = adapter.namespace + '.root.' + discovery.players[s]._address;
            if (channels[ip]) {
                adapter.setState ('root.' + ip + '.volume', data.playerVolumes[s]);
                adapter.setState ('root.' + ip + '.muted',  data.groupState.mute);
                channels[ip].uuid = s;
            }
        }
    } else if (event == "favorites") {
        // Go through all players
        for (var uuid in discovery.players) {
            if (!discovery.players[uuid]._address) {
                discovery.players[uuid]._address = discovery.players[uuid].address.replace(/\./g, '_');
            }
            var ip = adapter.namespace + '.root.' + discovery.players[uuid]._address;
        	if (channels[ip]) {
            	takeSonosFavorites(ip, data);
    	 	}
        }
    }
    else {
        console.log (event + ' ' + data);
    }
}

function sonosInit() {
    var dp;
    var chnDp;
    var devChannels = [];
    delete channels;
    channels = {};

    adapter.getDevices(function (err, obj) {
        if (obj) {
            for (var i = 0; i < obj.length; i++) {
                if (obj[i].children) {
                    for (var j = 0; j < obj[i].children.length; j++) {
                        channels[obj[i].children[j]] = {
                            uuid:     "",
                            player:   null,
                            duration: 0,
                            elapsed:  0
                        };
                        adapter.objects.getObject(obj[i].children[j], function (err, _obj) {
                            if (_obj) {
                                channels[_obj._id].obj = _obj;
                            }
                        });
                    }
                }
            }
        }
    });
}

var discovery   = null;
var playerIps   = [];
var playerCycle = 0;
var queues      = {};

function main () {
    sonosInit ();
    discovery = new sonosDiscovery();
// from here the code is mostly from https://github.com/jishi/node-sonos-web-controller/blob/master/server.js

    if (adapter.config.webserver.enabled) {
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
                            } else { res2.resume(); }
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
                    }).on('error', function(e) {
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
            })
        });
    }

    discovery.on('topology-change', function (data) {
        var players = [];
        for (var uuid in discovery.players) {
            var player = discovery.players[uuid];
            players.push(player.convertToSimple());
        }
        if (socketServer)
            socketServer.sockets.emit('topology-change', players);

        processSonosEvents ('topology-change', data);
    });

    discovery.on('transport-state', function (data) {
        if (socketServer)
            socketServer.sockets.emit('transport-state', data);
        processSonosEvents ('transport-state', data);
    });

    discovery.on('group-volume', function (data) {
        if (socketServer)
            socketServer.sockets.emit('group-volume', data);
        processSonosEvents ('group-volume', data);
    });

    discovery.on('group-mute', function (data) {
        if (socketServer)
            socketServer.sockets.emit('group-mute', data);
    });

    discovery.on('mute', function (data) {
        if (socketServer)
            socketServer.sockets.emit('mute', data);
    });

    discovery.on('favorites', function (data) {
        if (socketServer)
            socketServer.sockets.emit('favorites', data);
        processSonosEvents ('favorites', data);
    });

    discovery.on('queue-changed', function (data) {
        console.log('queue-changed', data);
        delete queues[data.uuid];
        loadQueue(data.uuid, socketServer.sockets);
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

    if (adapter.config.webserver.enabled) {
        server.listen(adapter.config.webserver.port);
        console.log("http sonos server listening on port", adapter.config.webserver.port);
    }
}
