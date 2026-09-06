/**
 * Library-neutral description of a SONOS household.
 *
 * Nothing in here refers to a concrete client library. The adapter talks to these types
 * only, so the implementation behind {@link SonosBackend} can be replaced without touching
 * `main.ts` - see `src/lib/backend/discovery-backend.ts` for the current one.
 */

/** One track, as reported by the player */
export interface SonosTrack {
    uri?: string;
    title?: string;
    artist?: string;
    album?: string;
    albumArtUri?: string;
    /** Name of the radio station, empty for everything else */
    stationName?: string;
    /** Length in seconds; 0 for streams */
    duration: number;
    /** `radio`, `track` or `line_in` */
    type?: string;
}

export interface SonosPlayMode {
    shuffle: boolean;
    /** `none`, `all` or `one` */
    repeat: string;
    crossfade: boolean;
}

export interface SonosGroupState {
    volume: number;
    mute: boolean;
}

export interface SonosEqualizer {
    bass?: number;
    treble?: number;
    loudness?: boolean;
    nightMode?: boolean;
    speechEnhancement?: boolean;
}

/** Everything the adapter needs to fill the states of one channel */
export interface SonosDeviceState {
    currentTrack: SonosTrack;
    nextTrack?: SonosTrack;
    playMode?: SonosPlayMode;
    /** `PLAYING`, `PAUSED_PLAYBACK`, `STOPPED`, `TRANSITIONING` */
    playbackState: string;
    elapsedTime: number;
    elapsedTimeFormatted: string;
    trackNo: number;
    volume: number;
    mute: boolean;
    groupState?: SonosGroupState;
    equalizer?: SonosEqualizer;
}

/** An entry of the favorites or of the saved playlists */
export interface SonosMediaEntry {
    title?: string;
    uri?: string;
    albumArtUri?: string;
    metadata?: string;
}

export interface SonosQueueEntry {
    title?: string;
    artist?: string;
    album?: string;
    albumArtUri?: string;
    uri?: string;
}

/** A music service the household knows about */
export interface SonosMusicService {
    id: number;
    type: number;
    capabilities?: number;
}

/**
 * Events the adapter reacts to. The names are the adapter's own - the backend translates
 * whatever its library emits into these.
 */
export type SonosBackendEvent =
    | 'topology-change'
    | 'transport-state'
    | 'group-volume'
    | 'group-mute'
    | 'volume'
    | 'mute'
    | 'favorites'
    | 'queue'
    | 'treble'
    | 'bass';

export interface SonosTransportEvent {
    uuid: string;
    state: SonosDeviceState;
}

/** One group of the household: a coordinator and the devices that follow it */
export interface SonosZoneGroup {
    /** uuid of the coordinator */
    uuid: string;
    members: { uuid: string; roomName?: string }[];
}

/**
 * Either the full topology, or a single device that announced itself. The household reports
 * both under the same event, and the adapter reacts differently to each.
 */
export interface SonosTopologyEvent {
    /** All groups; undefined when only a single device announced itself */
    groups?: SonosZoneGroup[];
    /** The device that announced itself; undefined when the full topology was reported */
    uuid?: string;
}

export interface SonosVolumeEvent {
    uuid: string;
    roomName: string;
    newVolume: number;
}

export interface SonosMuteEvent {
    uuid: string;
    roomName: string;
    newMute: boolean;
}

export interface SonosQueueEvent {
    uuid: string;
    queue: SonosQueueEntry[];
}

export interface SonosEqEvent {
    uuid: string;
    /** Value of the changed band */
    value: number;
}

/** Payload per event name */
export interface SonosBackendEventMap {
    'topology-change': SonosTopologyEvent;
    'transport-state': SonosTransportEvent;
    'group-volume': SonosVolumeEvent;
    'group-mute': SonosMuteEvent;
    volume: SonosVolumeEvent;
    mute: SonosMuteEvent;
    favorites: void;
    queue: SonosQueueEvent;
    treble: SonosEqEvent;
    bass: SonosEqEvent;
}

/** One entry of a browsable media list: a container, a track or a music service */
export interface MediaBrowseItem {
    id: string;
    title: string;
    uri: string;
    metadata: string;
    artist: string;
    album: string;
    cover: string;
    folder: boolean;
    /** True for the entry of a music service itself */
    service?: boolean;
    /** Title of the favorite this entry stands for */
    favorite?: string;
    /** Title of the playlist this entry stands for */
    playlist?: string;
}

/** The answer to one browse request, written to `media_browse_result` */
export interface MediaBrowseResult {
    id: string;
    title: string;
    items: MediaBrowseItem[];
    serviceName?: string;
    searchable?: boolean;
    /** URL the user has to open once to link a music service account */
    loginUrl?: string;
    /** Text shown next to that URL */
    loginHint?: string;
}

/** What a music service answered to a browse or search */
export interface SmapiResult {
    items: MediaBrowseItem[];
    loginUrl?: string;
    loginHint?: string;
}
