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

import type { SonosPlayer, SonosPlayerState } from 'sonos-discovery';

const audioExtensions = ['mp3', 'aiff', 'flac', 'less', 'wav'];

const FADE_STEP_MS = 100;

interface TtsTask {
    uri: string;
    /** The volume is extracted from the file name, so it can be a string */
    volume: number | string | null;
}

interface FadeOptions {
    actual: number;
    step: number;
}

interface WaitPlayerStarted {
    resolve: () => void;
    timer: NodeJS.Timeout | null;
}

interface StoredState extends SonosPlayerState {
    avTransportUriMetadata: unknown;
    time: number;
    /** false if a file is playing, else true or the schema of the stream URI */
    radio: boolean | string;
}

export class TTS {
    private readonly adapter: ioBroker.Adapter;
    private readonly player: SonosPlayer;
    private readonly fadeInMs: number;
    private readonly fadeOutMs: number;
    private readonly queue: TtsTask[] = [];
    private storedState: StoredState | null = null;
    private ttsPlaying = false;
    private restoring = false;
    private lastAddedTrack: number | null = null;
    private waitPlayerStarted: WaitPlayerStarted | null = null;
    private playStopped = 0;
    private playStoppedTimeout: NodeJS.Timeout | null = null;

    constructor(adapter: ioBroker.Adapter, player: SonosPlayer) {
        this.adapter = adapter;
        this.player = player;
        this.fadeInMs = parseInt(String(adapter.config.fadeIn), 10) || 0;
        this.fadeOutMs = parseInt(String(adapter.config.fadeOut), 10) || 0;
    }

    /** Add a new file to the TTS queue and start playing if not yet started */
    add(uri: string, volume: number | string | null): void {
        this.queue.push({ uri, volume });
        this.startTTS();
    }

    /** Stop the running TTS immediately, drop all pending files and restore the state before TTS */
    immediatelyStopTTS(): void {
        if (!this.ttsPlaying) {
            return;
        }

        // drop all files, that are waiting to be played
        this.queue.length = 0;

        // stop wait for "speech end timeout"
        if (this.playStoppedTimeout) {
            clearTimeout(this.playStoppedTimeout);
            this.playStoppedTimeout = null;
        }

        void this.player
            .pause()
            .then(() => this.removeAddedTrack())
            .then(() => this.restoreState())
            .catch(error => this.adapter.log.error(`Cannot stop TTS: ${error}`));
    }

    /** The player reported, that it started playing */
    playingStarted(): void {
        this.adapter.log.debug('[TTS] playing started');
        if ((this.restoring || this.ttsPlaying) && this.waitPlayerStarted) {
            if (this.waitPlayerStarted.timer) {
                clearTimeout(this.waitPlayerStarted.timer);
                this.waitPlayerStarted.timer = null;
            }
            setImmediate(() => this.waitPlayerStarted?.resolve());
        }
    }

    /** The player reported, that it stopped playing */
    playingEnded(): void {
        this.adapter.log.debug('[TTS] playing ended');
        setImmediate(() => this.afterPlayingStopped());
    }

    destroy(): void {
        if (this.playStoppedTimeout) {
            clearTimeout(this.playStoppedTimeout);
            this.playStoppedTimeout = null;
        }
        if (this.waitPlayerStarted?.timer) {
            clearTimeout(this.waitPlayerStarted.timer);
            this.waitPlayerStarted = null;
        }
    }

    private async restoreState(): Promise<void> {
        this.adapter.log.debug(`Restore after ${JSON.stringify(this.player.state)}`);
        this.ttsPlaying = false;

        const storedState = this.storedState;

        if (!storedState || this.restoring) {
            return;
        }

        this.restoring = true;

        try {
            // restore mute state. If the player was muted, it was unmuted for the announcement,
            // so mute it again in any case: the mute event of the player could be still on the way
            if (storedState.mute) {
                await this.player.mute();
            } else if (this.isPlayerMuted()) {
                await this.player.unMute();
            }

            // required for fadeIn
            if (this.fadeInMs) {
                await this.player.setVolume(0);
            }

            if (storedState.radio) {
                // if was radio playing
                try {
                    await this.player.setAVTransport(
                        storedState.currentTrack.uri || '',
                        storedState.avTransportUriMetadata,
                    );
                } catch (error) {
                    this.adapter.log.error(`Cannot setAVTransport: ${error}`);
                }
            } else {
                // if not radio
                // Set old track number
                await this.player.trackSeek(storedState.trackNo);
                await this.wait(200);
                // Set elapsed time
                await this.player.timeSeek(storedState.elapsedTime);
                await this.wait(200);
            }

            if (storedState.playbackState === 'PLAYING') {
                await this.player.play();

                if (this.fadeInMs) {
                    // wait till the player started to play
                    await this.waitTillPlayerStarted();
                }
            }

            this.clearWaitPlayerStarted();

            if (storedState.playbackState === 'PLAYING') {
                await this.fadeIn(storedState.volume);
            } else {
                await this.player.setVolume(storedState.volume);
            }
        } catch (e) {
            this.adapter.log.error(`Cannot restore state: ${e}`);
        }

        this.restoring = false;
        this.storedState = null;

        // If during state restoring new file added => start TTS anew
        if (this.queue.length) {
            this.startTTS();
        }
    }

    private storeState(): void {
        const storedState: StoredState = JSON.parse(JSON.stringify(this.player.state));
        storedState.avTransportUriMetadata = JSON.parse(JSON.stringify(this.player.avTransportUriMetadata));
        storedState.time = Date.now();
        storedState.radio = TTS.isRadio(storedState);
        this.storedState = storedState;

        this.adapter.log.debug(
            `[TTS / storeState] volume=${storedState.volume} currentTrack.uri=${
                storedState.currentTrack && storedState.currentTrack.uri
            } tts.playbackState=${storedState.playbackState}`,
        );
    }

    private static isRadio(state: SonosPlayerState): boolean | string {
        const extension =
            state.currentTrack && state.currentTrack.uri ? state.currentTrack.uri.split('.').pop() || '' : 'none';

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
        }

        return uri.split(':')[0];
    }

    private startTTS(): void {
        if (!this.queue.length) {
            if (this.ttsPlaying) {
                void this.removeAddedTrack()
                    .then(() => this.restoreState())
                    .catch(error => this.adapter.log.error(`Cannot restore state: ${error}`));
            }
            return;
        }

        if (this.ttsPlaying || this.restoring) {
            // do nothing
            return;
        }

        this.ttsPlaying = true;

        const task = this.queue.shift();

        this.storeState();

        if (task) {
            this.playTask(task).catch(error => this.adapter.log.error(`Cannot execute TTS: ${error}`));
        }
        // wait till ended in playingEnded
    }

    private async playTask(task: TtsTask): Promise<void> {
        let wasPlaying;

        await this.fadeOut();

        if (this.storedState?.radio) {
            wasPlaying = false;
            this.lastAddedTrack = null;
            await this.player.setAVTransport(task.uri);
        } else {
            wasPlaying = this.storedState?.playbackState === 'PLAYING';

            const res = await this.player.addURIToQueue(task.uri);
            // Find out added track
            this.lastAddedTrack = parseInt(String(res.firsttracknumberenqueued), 10);
            await this.player.trackSeek(this.lastAddedTrack);
        }

        // remember start of playing
        this.playStopped = Date.now();
        this.playStoppedTimeout = setTimeout(() => {
            this.playStoppedTimeout = null;
            this.afterPlayingStopped();
        }, 40_000);

        if (!wasPlaying) {
            await this.player.play();
        }

        // wait till playing started to start fadeIn process
        if (this.fadeInMs) {
            await this.waitTillPlayerStarted();
        }

        this.clearWaitPlayerStarted();

        await this.fadeIn(task.volume);
    }

    /** Wait till the player reports, that it started playing, but maximally 3 seconds */
    private waitTillPlayerStarted(): Promise<void> {
        return new Promise<void>(resolve => {
            this.waitPlayerStarted = {
                resolve,
                timer: setTimeout(() => {
                    if (this.waitPlayerStarted) {
                        this.waitPlayerStarted.timer = null;
                    }
                    resolve();
                }, 3_000),
            };
        });
    }

    private clearWaitPlayerStarted(): void {
        if (this.waitPlayerStarted) {
            if (this.waitPlayerStarted.timer) {
                clearTimeout(this.waitPlayerStarted.timer);
                this.waitPlayerStarted.timer = null;
            }
            this.waitPlayerStarted = null;
        }
    }

    private async removeAddedTrack(): Promise<void> {
        if (this.lastAddedTrack !== null) {
            // remove track
            try {
                await this.player.removeTrackFromQueue(this.lastAddedTrack);
            } catch (error) {
                this.adapter.log.error(`Cannot removeTrackFromQueue: ${error}`);
            }
            this.lastAddedTrack = null;
        }
    }

    private afterPlayingStopped(): void {
        // ignore stop state immediately after play. Sonos Bug?
        if (Date.now() - this.playStopped < 1_000) {
            this.adapter.log.debug('Stop state ignored, right after the play start');
            return;
        }

        // stop wait for "speech end timeout"
        if (this.playStoppedTimeout) {
            clearTimeout(this.playStoppedTimeout);
            this.playStoppedTimeout = null;
        }

        this.processNextTask().catch(error => this.adapter.log.error(`Cannot remove track: ${error}`));
    }

    private async processNextTask(): Promise<void> {
        await this.removeAddedTrack();

        // process next task
        if (!this.queue.length) {
            return this.restoreState();
        }

        const task = this.queue.shift();

        if (!task) {
            return;
        }

        if (this.storedState?.radio) {
            await this.player.setAVTransport(task.uri);
        } else {
            const res = await this.player.addURIToQueue(task.uri);
            // Find out added track
            this.lastAddedTrack = parseInt(String(res.firsttracknumberenqueued), 10);
            await this.player.trackSeek(this.lastAddedTrack);
        }

        await this.player.setVolume(this.getVolume(task.volume));
        await this.player.play();
    }

    /**
     * Read the current mute state of the player.
     * "state.mute" is maintained by sonos-discovery, "_isMuted" only by this adapter,
     * so it is undefined till the first mute event arrives.
     */
    private isPlayerMuted(): boolean {
        return this.player.state?.mute ?? this.player._isMuted ?? false;
    }

    private wait(ms: number): Promise<void> {
        return new Promise<void>(resolve => {
            setTimeout(() => resolve(), ms);
        });
    }

    private static toVolume(volume: number | string | null): number {
        return typeof volume === 'number' ? volume : parseInt(String(volume), 10);
    }

    /**
     * Determine the volume, the TTS file must be played with.
     * If no valid volume was given (the volume is optional in the file name), the volume before TTS is used,
     * because fadeOut() has set the volume of the player to 0 in the meantime.
     *
     * @param volume volume, extracted from the file name
     */
    private getVolume(volume: number | string | null): number {
        const requested = TTS.toVolume(volume);

        if (!isNaN(requested)) {
            return requested;
        }

        const stored = this.storedState?.volume ?? this.player.state?.volume ?? this.player._volume;

        if (typeof stored === 'number' && !isNaN(stored)) {
            return stored;
        }

        this.adapter.log.warn('[TTS] Cannot determine the volume for TTS. Playing with volume 0');

        return 0;
    }

    private async fadeIn(targetVolume: number | string | null, options?: FadeOptions): Promise<void> {
        const volume = this.getVolume(targetVolume);

        if (!this.fadeInMs) {
            await this.player.setVolume(volume);
            return;
        }

        if (options === undefined) {
            this.adapter.log.debug(`[TTS / fadeIn] << fadeIn start to ${volume}`);

            options = {
                step: Math.round(volume / Math.max(this.fadeInMs / FADE_STEP_MS, 1)) || 1,
                actual: 0,
            };
        }

        this.adapter.log.debug(`[TTS / fadeIn] >> fadeIn to ${options.actual} of ${volume}`);

        options.actual += options.step;

        if (options.actual >= volume) {
            this.adapter.log.debug(`[TTS / fadeIn] << fadeIn end to ${volume}`);
            await this.player.setVolume(volume);
            return;
        }

        await this.player.setVolume(options.actual);
        await this.wait(FADE_STEP_MS);
        return this.fadeIn(volume, options);
    }

    private async fadeOut(options?: FadeOptions): Promise<void> {
        const muted = this.isPlayerMuted();

        // player was in mute state, so no fadeout required
        if (!this.fadeOutMs || muted || this.player.state.playbackState !== 'PLAYING') {
            await this.player.setVolume(0);
            if (muted) {
                // the announcement must be audible
                await this.player.unMute();
            }
            return;
        }

        if (options === undefined) {
            const actual = parseInt(String(this.player._volume), 10);

            options = {
                actual,
                step: Math.round(actual / Math.max(this.fadeOutMs / 100, 1)) || 1,
            };
        }

        options.actual -= options.step;

        if (options.actual > 0) {
            await this.player.setVolume(options.actual);
            this.adapter.log.debug(`[TTS / fadeOut] >> fadeOut: setVolume: ${options.actual}`);
            await this.wait(FADE_STEP_MS);
            return this.fadeOut(options);
        }

        await this.player.setVolume(0);
        this.adapter.log.debug('[TTS / fadeOut] << fadeOut ');
    }
}
