// How works TTS
// 0. If now tts is playing, just add new text to queue and finished. If TTS is not playing now =>
// 1. Store current state
// 2. Start fade out.
// 2. Pause/Stop playing after fadeout finished
// 3. Add track to list
// 4. Set Volume to 0
// 5. Start play
// 6. Start fade in or Set volume to TTS volume
// 7. Wait till the track played
// 8. If Play paused and it was TTS,
// 9. Remove track from list
// 10. check if we have the next text, if yes go to 4, but without fade in/fade out
// 11. Restore the state stored on step 1

const audioExtensions = ['mp3', 'aiff', 'flac', 'less', 'wav'];

const FADE_STEP_MS = 100;

function TTS(adapter, player) {
    let fadeInMs  = parseInt(adapter.config.fadeIn,  10) || 0;
    let fadeOutMs = parseInt(adapter.config.fadeOut, 10) || 0;

    this._player = player;
    this._queue = [];
    this._storedState = null;
    this._ttsPlaying = false;
    this._restoring = false;
    this._lastAddedTrack = null;

    this._restoreState = function () {
        adapter.log.debug('Restore after ' + JSON.stringify(this._player.state));
        this._ttsPlaying = false;

        if (this._storedState && !this._restoring) {
            this._restoring = true;

            // restore mute state
            return new Promise(resolve => {
                if (this._player._isMuted !== this._storedState.mute) {
                    return (this._storedState.mute ? this._player.mute() : this._player.unMute())
                        .then(() => resolve());
                } else {
                    return resolve();
                }
            })
                // required for fadeIn
                .then(() => fadeInMs && this._player.setVolume(0))
                .then(() => {
                    let promise;
                    // if was radio playing
                    if (this._storedState.radio) {
                        promise = this._player.setAVTransport(this._storedState.currentTrack.uri, this._storedState.avTransportUriMetadata)
                            .catch(error =>
                                adapter.log.error('Cannot setAVTransport: ' + error));
                    } else {
                        // if not radio
                        // Set old track number
                        promise = this._player.trackSeek(this._storedState.trackNo)
                            .then(() => this._wait(200))
                            // Set elapsed time
                            .then(() => this._player.timeSeek(this._storedState.elapsedTime))
                            .then(() => this._wait(200));
                    }

                    return promise
                        .then(() => this._storedState.playbackState === 'PLAYING' ? this._player.play() : Promise.resolve())
                        .then(() => {
                            if (fadeInMs && this._storedState.playbackState === 'PLAYING') {
                                return new Promise(resolve => {
                                    this._waitPlayerStarted = {
                                        resolve,
                                        timer: setTimeout(() => {
                                            this._waitPlayerStarted.timer = null;
                                            resolve();
                                        }, 3000),
                                    };
                                });
                            } else {
                                return Promise.resolve();
                            }
                        })
                        .then(() => {
                            if (this._waitPlayerStarted) {
                                this._waitPlayerStarted.timer && clearTimeout(this._waitPlayerStarted);
                                this._waitPlayerStarted.timer = null;
                                this._waitPlayerStarted = null;
                            }

                            return this._storedState.playbackState === 'PLAYING' ? this._fadeIn(this._storedState.volume) : this._player.setVolume(this._storedState.volume);
                        })
                })
                .catch(e => adapter.log.error('Cannot restore state: ' + e))
                .then(() => {
                    this._restoring = false;
                    this._storedState = null;

                    // If during state restoring new file added => start TTS anew
                    this._queue.length && this._startTTS();
                });
        }
    };

    this._storeState = function () {
        this._storedState = JSON.parse(JSON.stringify(this._player.state));
        this._storedState.avTransportUriMetadata = JSON.parse(JSON.stringify(this._player.avTransportUriMetadata));
        this._storedState.time = Date.now();
        this._storedState.radio = this._isRadio(this._storedState);
        adapter.log.debug(`[TTS / _storeState] volume=${this._storedState.volume} currentTrack.uri=${this._storedState.currentTrack && this._storedState.currentTrack.uri} tts.playbackState=${this._storedState.playbackState}`);
    };

    this._isRadio = function (state) {
        const extension = state.currentTrack && state.currentTrack.uri ? state.currentTrack.uri.split('.').pop() : 'none';

        const uri = state.currentTrack && state.currentTrack.uri;

        if (!uri) {
            return true;
        }

        // If not radio
        const isFile =
            uri.includes('x-file-cifs:') ||
            uri.includes('x-sonos-spotify:') ||
            uri.includes('x-sonosapi-hls-static:') ||
            audioExtensions.includes(extension);

        if (isFile) {
            return false;
        } else {
            return state.currentTrack.uri.split(':')[0];
        }
    };

    this._startTTS = function () {
        if (!this._queue.length) {
            if (this._ttsPlaying) {
                this._removeAddedTrack()
                    .then(() => this._restoreState());
            }
        } else {
            if (!this._ttsPlaying && !this._restoring) {
                this._ttsPlaying = true;
                let wasPlaying;

                const task = this._queue.shift();

                this._storeState();

                this._fadeOut()
                    .then(() => {
                        if (this._storedState.radio) {
                            wasPlaying = false;
                            this._lastAddedTrack = null;
                            return this._player.setAVTransport(task.uri);
                        } else {
                            wasPlaying = this._storedState.playbackState === 'PLAYING';

                            return this._player.addURIToQueue(task.uri)
                                .then(res => {
                                    // Find out added track
                                    this._lastAddedTrack = parseInt(res.firsttracknumberenqueued, 10);
                                    return this._player.trackSeek(this._lastAddedTrack);
                                });
                        }
                    })
                    .then(() => {
                        // remember start of playing
                        this._playStopped = Date.now();
                        this._playStoppedTimeout = setTimeout(() => {
                            this._playStoppedTimeout = null;
                            this._afterPlayingStopped();
                        }, 40000);

                        return !wasPlaying ? this._player.play() : Promise.resolve();
                    })
                    .then(() => {
                        // wait till playing started to start fadeIn process
                        if (fadeInMs) {
                            return new Promise(resolve => {
                                this._waitPlayerStarted = {
                                    resolve,
                                    timer: setTimeout(() => {
                                        this._waitPlayerStarted.timer = null;
                                        resolve();
                                    }, 3000),
                                };
                            });
                        } else {
                            return Promise.resolve();
                        }
                    })
                    .then(() => {
                        if (this._waitPlayerStarted && this._waitPlayerStarted.timer) {
                            clearTimeout(this._waitPlayerStarted);
                            this._waitPlayerStarted.timer = null;
                        }
                        this._waitPlayerStarted = null;
                        return this._fadeIn(task.volume);
                    })
                    .catch(error => {
                        adapter.log.error('Cannot execute TTS: ' + error.toString());
                    })
                    // wait till ended in playingEnded
            } else {
                // do nothing
            }
        }
    };

    this.immediatelyStopTTS = function () {
        if (this._ttsPlaying) {
            this._restoring = true;
            this._player.pause()
                .then(() => this._restoreState());
        }
    };

    this.add = function (uri, volume) {
        this._queue.push({uri, volume});
        this._startTTS();
    };

    this._removeAddedTrack = function () {
        if (this._lastAddedTrack !== null) {
            // remove track
            return this._player.removeTrackFromQueue(this._lastAddedTrack)
                .catch(error => adapter.log.error(`Cannot removeTrackFromQueue: ${error}`))
                .then(() => this._lastAddedTrack = null);
        } else {
            return Promise.resolve();
        }
    };

    this._afterPlayingStopped = function () {
        // ignore stop state immediately after play. Sonos Bug?
        if (Date.now() - this._playStopped < 1000) {
            return adapter.log.debug('Stop state ignored, right after the play start');
        }

        // stop wait for "speech end timeout"
        if (this._playStoppedTimeout) {
            clearTimeout(this._playStoppedTimeout);
            this._playStoppedTimeout = null;
        }

        this._removeAddedTrack()
            .then(() => {
                // process next task
                if (!this._queue.length) {
                    return this._restoreState();
                } else {
                    const task = this._queue.shift();

                    let promise;

                    if (this._storedState.radio) {
                        promise = this._player.setAVTransport(task.uri);
                    } else {
                        promise = player.addURIToQueue(task.uri)
                            .then(res => {
                                // Find out added track
                                this._lastAddedTrack = parseInt(res.firsttracknumberenqueued, 10);
                                return this._player.trackSeek(this._lastAddedTrack);
                            });
                    }
                    return promise
                        .then(() => this._player.setVolume(task.volume))
                        .then(() => this._player.play());
                }
            })
            .catch(error => adapter.log.error('Cannot remove track: ' + error.toString()));
    };

    this.playingStarted = function() {
        console.log('PLAYING STARTED!!!');
        if ((this._restoring || this._ttsPlaying) && this._waitPlayerStarted) {
            clearTimeout(this._waitPlayerStarted.timer);
            this._waitPlayerStarted.timer = null;
            setImmediate(() =>
                this._waitPlayerStarted.resolve());
        }
    };

    this.playingEnded = function() {
        console.log('PLAYING ENDED!!!');
        setImmediate(() =>
            this._afterPlayingStopped());
    };

    this._wait = function (ms) {
        return new Promise(resolve => setTimeout(() => resolve(), ms));
    };

    this._fadeIn = function (targetVolume, options) {
        if (!fadeInMs) {
            return this._player.setVolume(targetVolume);
        }

        if (options === undefined) {
            adapter.log.debug(`[TTS / _fadeIn] << fadeIn start to ${targetVolume}`);
            targetVolume = parseInt(targetVolume, 10);

            options = {
                step: Math.round(targetVolume / Math.max(fadeInMs / FADE_STEP_MS, 1)) || 1,
                actual: 0
            };
        }

        adapter.log.debug(`[TTS / _fadeIn] >> fadeIn to ${options.actual} of ${targetVolume}`);

        options.actual += options.step;

        if (options.actual >= targetVolume) {
            adapter.log.debug(`[TTS / _fadeIn] << fadeIn end to ${targetVolume}`);
            return player.setVolume(targetVolume);
        } else {
            return player.setVolume(options.actual)
                .then(() => this._wait(FADE_STEP_MS))
                .then(() => this._fadeIn(targetVolume, options));
        }
    };

    this._fadeOut = function (options) {
        // player was in mute state, so no fadeout required
        if (!fadeOutMs || this._player._isMute || this._player.state.playbackState !== 'PLAYING') {
            return this._player.setVolume(0)
                .then(() => this._player._isMute && this._player.unMute());
        }

        if (options === undefined) {
            const actual = parseInt(this._player._volume, 10);

            options = {
                actual,
                step: Math.round(actual / Math.max(fadeOutMs / 100, 1)) || 1
            };
        }

        options.actual -= options.step;

        if (options.actual > 0) {
            return player.setVolume(options.actual)
                .then(() => {
                    adapter.log.debug(`[TTS / _fadeOut] >> fadeOut: setVolume: ${options.actual}`);

                    return this._wait(FADE_STEP_MS)
                        .then(() => this._fadeOut(options));
                });
        } else {
            return player.setVolume(0)
                .then(() => adapter.log.debug('[TTS / _fadeOut] << fadeOut '));
        }
    };

    this.destroy = function () {
        if (this._playStoppedTimeout) {
            clearTimeout(this._playStoppedTimeout);
            this._playStoppedTimeout = null;
        }
        if (this._playStoppedTimeout) {
            clearTimeout(this._playStoppedTimeout);
            this._playStoppedTimeout = null;
        }
    }
}

module.exports = TTS;
