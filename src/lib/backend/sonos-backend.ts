import type {
    SonosBackendEvent,
    SonosBackendEventMap,
    SonosDeviceState,
    SonosGroupState,
    SonosMediaEntry,
    SonosMusicService,
    SonosQueueEntry,
} from './types';

/**
 * One SONOS speaker.
 *
 * Everything the adapter does to a speaker goes through this interface. The properties that
 * the adapter used to attach to the library's player object itself (`_address`, `_volume`,
 * `_isMuted`) are proper members here.
 */
export interface SonosDevice {
    /** `RINCON_...` */
    readonly uuid: string;
    /** Name of the speaker as configured in the SONOS app */
    readonly roomName: string;
    /** `http://<ip>:1400` */
    readonly baseUrl: string;
    /** IP address with dots, e.g. `192.168.1.50` */
    readonly ip: string | null;
    /** IP address with underscores - the channel name used by this adapter */
    readonly channel: string | null;

    /** The device that coordinates the group this device plays in; the device itself when standalone */
    readonly coordinator: SonosDevice;
    /** True if the device plays in a group and is not the coordinator of it */
    readonly isGroupMember: boolean;
    /** All devices that share playback with this one, including itself */
    readonly groupMembers: SonosDevice[];

    readonly state: SonosDeviceState;
    readonly groupState: SonosGroupState;
    /** URI the player was told to play; `x-rincon:RINCON_...` while it follows a coordinator */
    readonly transportUri: string;
    /** DIDL metadata belonging to {@link transportUri} */
    readonly transportUriMetadata: string;

    /** Last volume seen by the adapter, kept so that TTS can restore it */
    volume: number;
    /** Last mute state seen by the adapter, kept so that TTS can restore it */
    muted: boolean;

    // playback ------------------------------------------------------------
    play(): Promise<void>;
    pause(): Promise<void>;
    next(): Promise<void>;
    previous(): Promise<void>;
    /** Jump to a position inside the current track */
    seekTime(seconds: number): Promise<void>;
    /** Jump to a track of the queue, 1-based */
    seekTrack(trackNo: number): Promise<void>;

    setShuffle(enabled: boolean): Promise<void>;
    /** `none`, `all` or `one` */
    setRepeat(mode: string): Promise<void>;
    setCrossfade(enabled: boolean): Promise<void>;

    // volume and sound ----------------------------------------------------
    setVolume(volume: number): Promise<void>;
    setMute(muted: boolean): Promise<void>;
    setGroupVolume(volume: number): Promise<void>;
    setGroupMute(muted: boolean): Promise<void>;
    setBass(value: number): Promise<void>;
    setTreble(value: number): Promise<void>;
    setNightMode(enabled: boolean): Promise<void>;
    setSpeechEnhancement(enabled: boolean): Promise<void>;

    // sources -------------------------------------------------------------
    /** Point the player at a URI without starting it */
    setTransportUri(uri: string, metadata?: string): Promise<void>;
    /** Start a saved favorite by its title */
    playFavorite(title: string): Promise<void>;
    /** Start a saved playlist by its title */
    playPlaylist(title: string): Promise<void>;

    // queue ---------------------------------------------------------------
    getQueue(): Promise<SonosQueueEntry[]>;
    /**
     * Append a URI to the queue
     *
     * @returns the number of the first enqueued track, so that it can be played directly
     */
    addToQueue(uri: string, metadata?: string): Promise<number>;
    removeFromQueue(trackNo: number): Promise<void>;
    clearQueue(): Promise<void>;

    // grouping ------------------------------------------------------------
    /** Leave the current group and play on its own */
    leaveGroup(): Promise<void>;
}

/**
 * The SONOS household.
 *
 * Created once at adapter start. `main.ts` knows this interface and nothing below it.
 */
export interface SonosBackend {
    /** All known devices */
    readonly devices: SonosDevice[];
    /** Music services the household reports, keyed by service name */
    readonly musicServices: Record<string, SonosMusicService>;
    /** Address the speakers can reach this adapter at, used for the TTS files */
    readonly localEndpoint: string;

    getDeviceByUuid(uuid: string): SonosDevice | undefined;
    /** Look a device up by its channel name, so the IP address with underscores */
    getDeviceByChannel(channel: string): SonosDevice | undefined;

    getFavorites(): Promise<SonosMediaEntry[]>;
    getPlaylists(): Promise<SonosMediaEntry[]>;

    on<E extends SonosBackendEvent>(event: E, listener: (data: SonosBackendEventMap[E]) => void): void;

    dispose(): void;
}
