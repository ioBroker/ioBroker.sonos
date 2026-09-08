// Shapes of the JSON states the source selection reads. They mirror the payloads the adapter
// writes in `src/main.ts` - see `handleMediaBrowse()` and `takeSonosFavorites()`.

/** One entry of `media_browse_result`. */
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

/** The sheets the source selection offers. */
export type SourceTab = 'favorites' | 'playlists' | 'queue' | 'recent' | 'sources';
