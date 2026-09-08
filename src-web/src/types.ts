/** One discovered SONOS device, taken from the channel objects under `sonos.<instance>.root`. */
export interface SonosRoomInfo {
    /** Channel name, so the IP address with underscores, e.g. `192_168_1_50` */
    ip: string;
    /** Name from the adapter configuration, falls back to the IP address */
    name: string;
}

/** One entry of `media_browse_result`, written by the adapter. */
export interface MediaBrowseItem {
    id: string;
    title: string;
    uri?: string;
    metadata?: string;
    artist?: string;
    album?: string;
    cover?: string;
    folder?: boolean;
    service?: boolean;
    favorite?: string;
    playlist?: string;
}

/** Payload of the `media_browse_result` state. */
export interface MediaBrowseResult {
    id: string;
    title: string;
    items: MediaBrowseItem[];
    serviceName?: string;
    searchable?: boolean;
    loginUrl?: string;
    loginHint?: string;
}

/** One entry of the `recent_tracks` state. */
export interface RecentTrack {
    title: string;
    artist?: string;
    album?: string;
    station?: string;
    cover?: string;
    uri?: string;
    ts?: number;
}

/** One entry of the `queue_array` state. */
export interface QueueTrack {
    title: string;
    artist?: string;
    album?: string;
    cover?: string;
}

/** The sheets the source selection offers. */
export type LibraryTab = 'favorites' | 'playlists' | 'queue' | 'recent' | 'sources';
