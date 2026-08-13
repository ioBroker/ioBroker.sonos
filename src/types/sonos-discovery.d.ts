/**
 * Type definitions for the "sonos-discovery" package, that is written in plain javascript
 * and does not deliver any types. Only the API, that is used by this adapter, is described here.
 */
declare module 'sonos-discovery' {
    export interface SonosTrack {
        uri?: string;
        title?: string;
        artist?: string;
        album?: string;
        albumArtUri?: string;
        stationName?: string;
        duration: number;
        /** radio, track, line_in */
        type?: string;
    }

    export interface SonosPlayMode {
        shuffle: boolean;
        repeat: string;
        crossfade: boolean;
    }

    export interface SonosGroupState {
        volume: number;
        mute: boolean;
    }

    export interface SonosPlayerState {
        currentTrack: SonosTrack;
        nextTrack?: SonosTrack;
        playMode?: SonosPlayMode;
        playbackState: string;
        elapsedTime: number;
        elapsedTimeFormatted: string;
        trackNo: number;
        volume: number;
        mute: boolean;
        groupState?: SonosGroupState;
    }

    export interface SonosFavorite {
        title?: string;
        uri?: string;
        albumArtUri?: string;
    }

    export interface SonosQueueItem {
        title?: string;
        artist?: string;
        album?: string;
        albumArtUri?: string;
        uri?: string;
    }

    export interface SonosPlayer {
        uuid: string;
        roomName: string;
        baseUrl: string;
        state: SonosPlayerState;
        groupState: SonosGroupState;
        coordinator: SonosPlayer;
        avTransportUriMetadata: unknown;
        /** IP address of the player. It will be stored by this adapter and is not part of the library */
        _address?: string | null;
        _volume?: number;
        /** Mute state, that is stored by this adapter and is not part of the library */
        _isMuted?: boolean;
        /** TTS instance, that is attached to the player by this adapter (see src/lib/tts.ts) */
        tts?: {
            add(uri: string, volume: number | string | null): void;
            immediatelyStopTTS(): void;
            playingStarted(): void;
            playingEnded(): void;
            destroy(): void;
        } | null;

        play(): Promise<unknown>;
        pause(): Promise<unknown>;
        nextTrack(): Promise<unknown>;
        previousTrack(): Promise<unknown>;
        mute(): Promise<unknown>;
        unMute(): Promise<unknown>;
        muteGroup(): Promise<unknown>;
        unMuteGroup(): Promise<unknown>;
        becomeCoordinatorOfStandaloneGroup(): Promise<unknown>;
        trackSeek(trackNo: number): Promise<unknown>;
        timeSeek(elapsedSeconds: number): Promise<unknown>;
        setVolume(volume: number): Promise<unknown>;
        setGroupVolume(volume: number): Promise<unknown>;
        setTreble(treble: number): Promise<unknown>;
        setBass(bass: number): Promise<unknown>;
        shuffle(enabled: boolean): Promise<unknown>;
        crossfade(enabled: boolean): Promise<unknown>;
        repeat(mode: string): Promise<unknown>;
        replaceWithFavorite(favorite: string): Promise<unknown>;
        replaceWithPlaylist(playlist: string): Promise<unknown>;
        setAVTransport(uri: string, metadata?: unknown): Promise<unknown>;
        addURIToQueue(uri: string): Promise<{ firsttracknumberenqueued: string | number }>;
        removeTrackFromQueue(trackNo: number): Promise<unknown>;
        getQueue(): Promise<SonosQueueItem[]>;
    }

    export interface SonosDiscoveryOptions {
        household?: string | null;
        log?: unknown;
        cacheDir?: string;
        port?: number;
    }

    export default class SonosDiscovery {
        constructor(options?: SonosDiscoveryOptions);

        players: SonosPlayer[];
        localEndpoint: string;

        getPlayerByUUID(uuid: string): SonosPlayer | undefined;
        getFavorites(): Promise<Record<string, SonosFavorite>>;
        on(event: string, listener: (data: any) => void): this;
        dispose(): void;
    }
}
