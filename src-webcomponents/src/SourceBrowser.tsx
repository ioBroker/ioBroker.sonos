/**
 * The source selection: favorites, SONOS playlists, the queue, recently played tracks and the browsable sources of
 * the speaker (radio, music library, line-in, TV and the music services) - the library of the native widgets.
 *
 *     <room>.favorites_list_array   string[] as JSON           -> favorites_set
 *     <room>.playlist_list_array    string[] as JSON           -> playlist_set
 *     <room>.queue_array / queue    the tracks of the queue    -> current_track_number
 *     <room>.recent_tracks          RecentTrack[] as JSON      -> play_uri
 *     <room>.media_browse           write: the object to browse, `root` = the sources
 *     <room>.media_browse_result    MediaBrowseResult as JSON  -> media_play
 *
 * The adapter routes every command to the group coordinator and writes the answers to its channel: the lists are
 * read from `coordinator`, the commands go to the room the user picked.
 */
import { useState, type JSX } from 'react';

import { parseJson } from './constants';
import { Button, Cover } from './controls';
import { Icon, type IconName } from './icons';
import type { WordKey } from './texts';
import type { Word } from './words';

/** One entry of `media_browse_result` */
interface MediaBrowseItem {
    id: string;
    title: string;
    uri?: string;
    metadata?: string;
    artist?: string;
    album?: string;
    cover?: string;
    folder?: boolean;
    favorite?: string;
    playlist?: string;
}

/** The value of `media_browse_result` */
interface MediaBrowseResult {
    id: string;
    title: string;
    items: MediaBrowseItem[];
    serviceName?: string;
    searchable?: boolean;
    loginUrl?: string;
    loginHint?: string;
}

/** One entry of `recent_tracks` */
interface RecentTrack {
    title: string;
    artist?: string;
    album?: string;
    cover?: string;
    uri?: string;
}

type Tab = 'favorites' | 'playlists' | 'queue' | 'recent' | 'sources';

const TABS: { id: Tab; label: WordKey; icon: IconName }[] = [
    { id: 'favorites', label: 'sonosdm_favorites', icon: 'star' },
    { id: 'playlists', label: 'sonosdm_playlists', icon: 'playlist' },
    { id: 'queue', label: 'sonosdm_queue', icon: 'queue' },
    { id: 'recent', label: 'sonosdm_recent', icon: 'history' },
    { id: 'sources', label: 'sonosdm_sources', icon: 'folder' },
];

export interface SourceBrowserProps {
    /** The room the commands go to */
    room: string;
    /** The room the lists are read from: the group coordinator of `room`, or `room` itself */
    coordinator: string;
    /** A value of a state of a room */
    value: (room: string, name: string) => ioBroker.StateValue | undefined;
    /** Write a state of `room` */
    command: (name: string, value: ioBroker.StateValue) => void;
    word: Word;
}

interface Row {
    key: string;
    title: string;
    sub?: string;
    cover?: string;
    icon: IconName;
    onClick: () => void;
}

export function SourceBrowser({ room, coordinator, value, command, word }: SourceBrowserProps): JSX.Element {
    const [tab, setTab] = useState<Tab>('favorites');
    const [query, setQuery] = useState('');
    /** The folders the user opened on the sheet `sources` */
    const [path, setPath] = useState<{ id: string; title: string }[]>([]);

    const json = <T,>(from: string, name: string): T | null => parseJson<T>(value(from, name));
    const browse = json<MediaBrowseResult>(coordinator, 'media_browse_result');
    const term = query.trim().toLowerCase();
    const matches = (text: string): boolean => !term || text.toLowerCase().includes(term);

    const open = (next: Tab): void => {
        setTab(next);
        setQuery('');
        setPath([]);
        if (next === 'sources') {
            command('media_browse', 'root');
        }
    };

    const browseTo = (nextPath: { id: string; title: string }[], id: string): void => {
        setPath(nextPath);
        setQuery('');
        command('media_browse', id);
    };

    const play = (item: MediaBrowseItem): void => {
        if (item.folder) {
            browseTo([...path, { id: item.id, title: item.title }], item.id);
        } else if (item.uri || item.favorite || item.playlist || item.id === 'tv') {
            command(
                'media_play',
                JSON.stringify({
                    uri: item.uri || '',
                    metadata: item.metadata || '',
                    favorite: item.favorite,
                    playlist: item.playlist,
                    tv: item.id === 'tv' || undefined,
                }),
            );
        }
    };

    let rows: Row[];
    if (tab === 'favorites' || tab === 'playlists') {
        const isFavorites = tab === 'favorites';
        rows = (json<string[]>(coordinator, isFavorites ? 'favorites_list_array' : 'playlist_list_array') || [])
            .filter(name => typeof name === 'string' && matches(name))
            .map((name, index) => ({
                key: `${tab}-${index}`,
                title: name,
                icon: isFavorites ? 'star' : 'playlist',
                onClick: () => command(isFavorites ? 'favorites_set' : 'playlist_set', name),
            }));
    } else if (tab === 'queue') {
        // `queue_array` has one entry per track; an older adapter writes `queue` only, the tracks joined with a comma
        const array = json<{ title?: string; artist?: string; album?: string; cover?: string }[]>(
            coordinator,
            'queue_array',
        );
        const tracks = array?.length
            ? array.map(track => ({ ...track, title: track.title || '' }))
            : String(value(coordinator, 'queue') ?? '')
                  .split(/\r?\n|, /)
                  .map(line => line.trim())
                  .filter(Boolean)
                  .map(line => ({ title: line, artist: '', album: '', cover: '' }));
        rows = tracks
            // the index is the track number `current_track_number` expects
            .map((track, index) => ({ track, index }))
            .filter(({ track }) => matches(`${track.title} ${track.artist || ''}`))
            .map(({ track, index }) => ({
                key: `queue-${index}`,
                title: track.title,
                sub: track.artist || track.album,
                cover: track.cover,
                icon: 'music',
                onClick: () => command('current_track_number', index + 1),
            }));
    } else if (tab === 'recent') {
        rows = (json<RecentTrack[]>(room, 'recent_tracks') || [])
            .filter(track => matches(`${track.title} ${track.artist || ''} ${track.album || ''}`))
            .map((track, index) => ({
                key: `recent-${index}`,
                title: track.title,
                sub: track.artist || track.album,
                cover: track.cover,
                icon: 'music',
                onClick: () => track.uri && command('play_uri', track.uri),
            }));
    } else {
        rows = (browse?.items || [])
            .filter(item => matches(`${item.title} ${item.artist || ''} ${item.album || ''}`))
            .map((item, index) => ({
                key: `source-${index}-${item.id}`,
                title: item.title,
                sub: item.artist || item.album,
                cover: item.cover,
                icon: item.id === 'tv' ? 'tv' : item.folder ? 'folder' : 'music',
                onClick: () => play(item),
            }));
    }

    const searchable = tab === 'sources' && !!browse?.searchable && !!browse.serviceName;

    return (
        <>
            <div className="tabs">
                {TABS.map(entry => (
                    <Button
                        key={entry.id}
                        icon={entry.icon}
                        title={word(entry.label)}
                        active={tab === entry.id}
                        onClick={() => open(entry.id)}
                    >
                        {word(entry.label)}
                    </Button>
                ))}
            </div>
            <div className="search">
                <Icon name="search" />
                <input
                    type="search"
                    value={query}
                    placeholder={word('sonosdm_search')}
                    aria-label={word('sonosdm_search')}
                    onChange={e => setQuery(e.currentTarget.value)}
                    onKeyUp={e => {
                        // full-text search in a music service; the adapter answers on `media_browse_result`
                        if (e.key === 'Enter' && searchable && query.trim()) {
                            command(
                                'media_browse',
                                `smapi-search:${encodeURIComponent(browse?.serviceName || '')}:${encodeURIComponent(query.trim())}`,
                            );
                        }
                    }}
                />
                {query ? (
                    <Button
                        icon="clear"
                        className="small"
                        title={word('wc_clear')}
                        onClick={() => setQuery('')}
                    />
                ) : null}
            </div>
            {tab === 'sources' ? (
                <div className="crumb secondary">
                    {path.length ? (
                        <Button
                            icon="back"
                            className="small"
                            title={word('wc_back')}
                            onClick={() => {
                                const rest = path.slice(0, -1);
                                browseTo(rest, rest.length ? rest[rest.length - 1].id : 'root');
                            }}
                        />
                    ) : null}
                    <span className="ellipsis">{path.length ? path[path.length - 1].title : browse?.title || ''}</span>
                    {browse?.loginUrl ? (
                        <Button
                            icon="login"
                            className="small"
                            title={browse.loginHint || word('wc_sign_in')}
                            onClick={() =>
                                command('media_browse', `smapi-auth:${encodeURIComponent(browse.serviceName || '')}`)
                            }
                        />
                    ) : null}
                </div>
            ) : null}
            <div className="items">
                {rows.length ? (
                    rows.map(row => (
                        <button
                            key={row.key}
                            type="button"
                            className="item"
                            onClick={row.onClick}
                        >
                            <Cover
                                url={row.cover || ''}
                                icon={row.icon}
                            />
                            <span className="text">
                                <span className="ellipsis">{row.title}</span>
                                {row.sub ? <span className="sub secondary ellipsis">{row.sub}</span> : null}
                            </span>
                        </button>
                    ))
                ) : (
                    <div className="empty secondary">{word('sonosdm_nothing_found')}</div>
                )}
            </div>
        </>
    );
}
