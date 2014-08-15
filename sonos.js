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
        if (obj && obj.command == "send") processMessage(obj.message);
        processMessages();
        return true;
    }

});

var io             = require('socket.io'),
    http           = require('http'),
    static         = require('node-static'),
    fs             = require('fs'),
    crypto         = require('crypto'),
    sonosDiscovery = require('sonos-discovery');

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

function takeSonosState (ip, sonosState) {
    var channelName = 'root.' + ip;

    adapter.setState(channelName + '.ALIVE', true);
    if (sonosState.playerState != "TRANSITIONING") {
        adapter.setState(channelName + '.STATE', (sonosState.playerState == "PAUSED_PLAYBACK") ? 0 : ((sonosState.playerState == "PLAYING") ? 1 : 2));
        if (sonosState.playerState == "PLAYING") {
            if (!channels[ip].elapsedTimer) {
                channels[ip].elapsedTimer = setInterval(function (ip_) {
                    channels[ip_].elapsed += ((adapter.config.elapsedInterval || 5000) / 1000);

                    if (channels[ip_].elapsed > channels[ip_].duration) {
                        channels[ip_].elapsed = channels[ip_].duration;
                    }

                    adapter.setState(channelName + '.ELAPSED_TIME',   channels[ip_].elapsed);
                    adapter.setState(channelName + '.ELAPSED_TIME_S', toFormattedTime(channels[ip_].elapsed));

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
    adapter.setState(channelName + '.CURRENT_ALBUM',      sonosState.currentTrack.album);
    adapter.setState(channelName + '.CURRENT_ARTIST',     sonosState.currentTrack.artist);
    adapter.setState(channelName + '.CURRENT_TITLE',      sonosState.currentTrack.title);
    adapter.setState(channelName + '.CURRENT_DURATION',   sonosState.currentTrack.duration);
    adapter.setState(channelName + '.CURRENT_DURATION_S', toFormattedTime(sonosState.currentTrack.duration));
    adapter.setState(channelName + '.CURRENT_COVER',      "http://" + 1 + /*settings.binrpc.listenIp + */ ":" + adapter.config.webserver.port + sonosState.currentTrack.albumArtURI);
    adapter.setState(channelName + '.ELAPSED_TIME',       sonosState.elapsedTime);
    channel.elapsed  = sonosState.elapsedTime;
    channel.duration = sonosState.currentTrack.duration;
    adapter.setState(channelName + '.ELAPSED_TIME_S',     sonosState.elapsedTimeFormatted);
    adapter.setState(channelName + '.VOLUME',             sonosState.volume);
    if (sonosState.groupState) {
        adapter.setState(channelName + '.MUTED',          sonosState.groupState.mute);
    }
}

function takeSonosFavorites(ip, favorites) {
	var sFavorites = "";
	for (var favorite in favorites){
        if (favorites[favorite].title) {
            sFavorites += ((sFavorites) ? ", ": "") + favorites[favorite].title;
        }
	}
	
    adapter.setState('root.' + ip + '.FAVORITES', sFavorites);
}

function processSonosEvents(event, data) {
    var ids;

    if (event == "topology-change") {
        if (data.length > 1) {
            for (var i = 0; i < data[1]; i++) {
                if (!discovery.players[data[0].uuid]._address) {
                    discovery.players[data[0].uuid]._address = discovery.players[data[0].uuid].address.replace(/\./g, '_');
                }
                var ip = discovery.players[data[0].uuid]._address;
                if (channels[ip]) {
                    adapter.setState ('root.' + ip + '.ALIVE', true);
                    channels[discovery.players[data[0].uuid]].uuid = data[0].uuid;
                }
            }
        }
    } else if (event == "transport-state") {
        // Get ccu.io id
        if (!discovery.players[data.uuid]._address) {
            discovery.players[data.uuid]._address = discovery.players[data.uuid].address.replace(/\./g, '_');
        }
        var ip = discovery.players[data.uuid]._address;
        if (channels[ip]) {
            takeSonosState (ip, data.state);
            channels[ip].uuid = data.uuid;
        }
    } else if (event == "group-volume") {
        for (var s in data.playerVolumes) {
            if (!discovery.players[s]._address) {
                discovery.players[s]._address = discovery.players[s].address.replace(/\./g, '_');
            }
            var ip = discovery.players[s]._address;
            if (channels[ip]) {
                adapter.setState ('root.' + ip + '.VOLUME', data.playerVolumes[s]);
                adapter.setState ('root.' + ip + '.MUTED',  data.groupState.mute);
                channels[ip].uuid = s;
            }
        }
    } else if (event == "favorites") {
        // Go through all players
        for (var uuid in discovery.players) {
            if (!discovery.players[uuid]._address) {
                discovery.players[uuid]._address = discovery.players[uuid].address.replace(/\./g, '_');
            }
            var ip = discovery.players[uuid]._address;
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

    for (var id in adapter.config.devices) {
        var ip = adapter.config.devices[id].ip.replace(/\./g, '_');
        var i  = parseInt(id.substring(1));
        devChannels.push(ip);

        var states = [
            'STATE',
            'VOLUME',
            'MUTED',
            'CURRENT_TITLE',
            'CURRENT_ARTIST',
            'CURRENT_ALBUM',
            'CURRENT_COVER',
            'CURRENT_DURATION',
            'CURRENT_DURATION_S',
            'CONTROL',
            'ALIVE',
            'ELAPSED_TIME',
            'ELAPSED_TIME_S',
            'FAVORITES',
            'ALIVE',
            'ALIVE',
            'FAVORITE_SET'
        ];

        channels[ip] = {
            uuid:     "",
            player:   null,
            duration: 0,
            elapsed:  0,
            states:   states
        };


        adapter.createChannel(ip, 'root', states, 'media.music');

        /*if (adapter.config.channels[id].rooms) {
            chObject.rooms = adapter.config.channels[id].rooms;
        }
        if (adapter.config.channels[id].funcs) {
            chObject.funcs = adapter.config.channels[id].funcs;
        }*/
        for (var j = 0; j < states.length; j++) {
            adapter.createState(states[j], 'root', ip, 'unknown');
        }

        /*
        setObject(chnDp, chObject);

        setObject(channels[ip].DPs.STATE, {
            Name:         chObject.Address+".STATE",
            ValueType:    16,
            ValueSubType: 29,
            TypeName:     "HSSDP",
            Value:        0, // 0 - Pause, 1 - play, 2 - stop
            Parent:       chnDp
        });
        setObject(channels[ip].DPs.VOLUME, {
            Name:         chObject.Address+".VOLUME",
            ValueType:    4,
            ValueSubType: 0,
            TypeName:     "HSSDP",
            Value:        0,
            Parent:       chnDp
        });
        setObject(channels[ip].DPs.MUTED, {
            Name:         chObject.Address+".MUTED",
            ValueType:    2,
            ValueSubType: 2,
            TypeName:     "HSSDP",
            Value:        false,
            Parent:       chnDp
        });
        setObject(channels[ip].DPs.CURRENT_TITLE, {
            Name:         chObject.Address+".CURRENT_TITLE",
            ValueType:    20,
            ValueSubType: 11,
            TypeName:     "HSSDP",
            Value:        "",
            Parent:       chnDp
        });
        setObject(channels[ip].DPs.CURRENT_ARTIST, {
            Name:         chObject.Address+".CURRENT_ARTIST",
            ValueType:    20,
            ValueSubType: 11,
            TypeName:     "HSSDP",
            Value:        "",
            Parent:       chnDp
        });
        setObject(channels[ip].DPs.CURRENT_ALBUM, {
            Name:         chObject.Address+".CURRENT_ALBUM",
            ValueType:    20,
            ValueSubType: 11,
            TypeName:     "HSSDP",
            Value:        "",
            Parent:       chnDp
        });
        setObject(channels[ip].DPs.CURRENT_COVER, {
            Name:         chObject.Address+".CURRENT_COVER",
            ValueType:    20,
            ValueSubType: 11,
            TypeName:     "HSSDP",
            Value:        "",
            Parent:       chnDp
        });
        setObject(channels[ip].DPs.CURRENT_DURATION, {
            Name:         chObject.Address+".CURRENT_DURATION", // 116 seconds
            ValueType:    4,
            ValueSubType: 0,
            TypeName:     "HSSDP",
            Value:        0,
            Parent:       chnDp
        });
        setObject(channels[ip].DPs.CURRENT_DURATION_S, {
            Name:         chObject.Address+".CURRENT_DURATION_S", // "01:56"
            ValueType:    20,
            ValueSubType: 11,
            TypeName:     "HSSDP",
            Value:        "00:00",
            Parent:       chnDp
        });
        setObject(channels[ip].DPs.CONTROL, {
            Name:         chObject.Address+".CONTROL", // supported: pause, play, next, prev, mute, unmute
            ValueType:    20,
            ValueSubType: 11,
            TypeName:     "HSSDP",
            Value:        "",
            Parent:       chnDp
        });
        setObject(channels[ip].DPs.ALIVE, {
            Name:         chObject.Address+".ALIVE",
            ValueType:    2,
            ValueSubType: 2,
            TypeName:     "HSSDP",
            Value:        false,
            Parent:       chnDp
        });
        setObject(channels[ip].DPs.ELAPSED_TIME, {
            Name:         chObject.Address+".ELAPSED_TIME", // 116 seconds
            ValueType:    4,
            ValueSubType: 0,
            TypeName:     "HSSDP",
            Value:        0,
            Parent:       chnDp
        });
        setObject(channels[ip].DPs.ELAPSED_TIME_S, {
            Name:         chObject.Address+".ELAPSED_TIME_S", // "01:56"
            ValueType:    20,
            ValueSubType: 11,
            TypeName:     "HSSDP",
            Value:        "00:00",
            Parent:       chnDp
        });
        setObject(channels[ip].DPs.FAVORITES, {
            Name:         chObject.Address+".FAVORITES",
            ValueType:    20,
            ValueSubType: 11,
            TypeName:     "HSSDP",
            Value:        "",
            Parent:       chnDp
        });
        setObject(channels[ip].DPs.FAVORITE_SET, {
            Name:         chObject.Address+".FAVORITE_SET",
            ValueType:    20,
            ValueSubType: 11,
            TypeName:     "HSSDP",
            Value:        "",
            Parent:       chnDp
        });*/
    }

    adapter.createDevice(adapter.namespace, devChannels);
}

sonosInit ();

// from here the code is mostly from https://github.com/jishi/node-sonos-web-controller/blob/master/server.js
var discovery   = new sonosDiscovery();
var playerIps   = [];
var playerCycle = 0;
var queues      = {};

if (adapter.config.webserver.enabled) {
    var cacheDir    = __dirname + '/cache';
    var fileServer  = new static.Server(__dirname + '/www');

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

