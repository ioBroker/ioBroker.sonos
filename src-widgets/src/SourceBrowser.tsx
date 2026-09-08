import React from 'react';

import {
    Box,
    IconButton,
    InputAdornment,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import { ArrowBack, Clear, Folder, Login, MusicNote, QueueMusic, Search, Speaker, Star, Tv } from '@mui/icons-material';

import Generic from './Generic';
import type { LibraryTab, MediaBrowseItem, MediaBrowseResult, RecentTrack } from './types';

/**
 * States the source selection reads. The adapter writes them to the channel of the group
 * coordinator, so a grouped room has to read them from the room it follows - see `wantedIds()`
 * of the widgets that embed this component.
 */
export const LIBRARY_STATES = [
    'favorites_list_array',
    'playlist_list_array',
    'queue',
    'queue_array',
    'recent_tracks',
    'media_browse_result',
] as const;

/** The sheets the source selection offers, in the order of the tab bar. */
const TABS: { id: LibraryTab; label: string; icon: React.JSX.Element }[] = [
    { id: 'favorites', label: 'favorites', icon: <Star fontSize="small" /> },
    { id: 'playlists', label: 'playlists', icon: <QueueMusic fontSize="small" /> },
    { id: 'queue', label: 'queue', icon: <MusicNote fontSize="small" /> },
    { id: 'recent', label: 'recent', icon: <Speaker fontSize="small" /> },
    { id: 'sources', label: 'sources', icon: <Folder fontSize="small" /> },
];

const styles: Record<string, React.CSSProperties> = {
    sheet: { flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' },
    item: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 4px',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        border: 0,
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        borderRadius: 4,
    },
    thumb: { width: 36, height: 36, borderRadius: 4, backgroundSize: 'cover', backgroundPosition: 'center' },
    title: { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    sub: { opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};

export interface SourceBrowserProps {
    /** Room the commands are written to - the channel name, i.e. the IP with underscores */
    ip: string;
    /** Room the library states are read from: the group coordinator of `ip`, or `ip` itself */
    coordinator: string;
    /** Reads one state of a room out of the cache of the embedding widget */
    getValue: (ip: string, name: string) => ioBroker.StateValue;
    /** Writes one state of a room */
    setValue: (ip: string, name: string, value: ioBroker.StateValue) => void;
    /** Sheet that is open initially. `''` shows only the tab bar, as the player widget does. */
    defaultTab?: LibraryTab | '';
}

interface SourceBrowserState {
    tab: LibraryTab | '';
    query: string;
    /** Breadcrumb of the `sources` sheet - one entry per folder the user opened */
    path: { id: string; title: string }[];
}

/**
 * The source selection: favorites, Sonos playlists, the queue, recently played tracks and the
 * browsable sources of the speaker (radio, music library, line-in, TV and the music services).
 *
 * The component is purely presentational - it neither subscribes nor writes on its own but goes
 * through `getValue` / `setValue` of the widget that embeds it.
 */
export default class SourceBrowser extends React.Component<SourceBrowserProps, SourceBrowserState> {
    constructor(props: SourceBrowserProps) {
        super(props);
        this.state = { tab: props.defaultTab || '', query: '', path: [] };
    }

    componentDidMount(): void {
        if (this.state.tab === 'sources') {
            this.props.setValue(this.props.ip, 'media_browse', 'root');
        }
    }

    componentDidUpdate(prevProps: SourceBrowserProps): void {
        // Another room shows another library, so the position inside the source tree is void
        if (prevProps.ip !== this.props.ip) {
            this.setState({ query: '', path: [] }, () => {
                if (this.state.tab === 'sources') {
                    this.props.setValue(this.props.ip, 'media_browse', 'root');
                }
            });
        }
    }

    private static parseJson<T>(raw: ioBroker.StateValue): T | null {
        if (raw === null || raw === undefined || raw === '') {
            return null;
        }
        if (typeof raw === 'object') {
            return raw;
        }
        try {
            return JSON.parse(String(raw)) as T;
        } catch {
            return null;
        }
    }

    private browseResult(): MediaBrowseResult | null {
        return SourceBrowser.parseJson<MediaBrowseResult>(
            this.props.getValue(this.props.coordinator, 'media_browse_result'),
        );
    }

    private json<T>(ip: string, name: string): T | null {
        return SourceBrowser.parseJson<T>(this.props.getValue(ip, name));
    }

    private str(ip: string, name: string): string {
        const value = this.props.getValue(ip, name);
        return value === null || value === undefined ? '' : String(value);
    }

    /**
     * The play queue of the group.
     *
     * `queue_array` carries one entry per track. Adapters that have not written it yet only offer
     * `queue`, where the tracks are joined with a comma - good enough for a list, but a title
     * containing a comma is then split into two rows.
     */
    private queue(): { title: string; artist?: string; album?: string; cover?: string }[] {
        const coordinator = this.props.coordinator;
        const array = this.json<{ title?: string; artist?: string; album?: string; cover?: string }[]>(
            coordinator,
            'queue_array',
        );
        if (array?.length) {
            return array.map(track => ({ ...track, title: track.title || '' }));
        }

        return this.str(coordinator, 'queue')
            .split(/\r?\n|, /)
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => ({ title: line }));
    }

    // ---- actions ------------------------------------------------------------

    private setTab(tab: LibraryTab | ''): void {
        this.setState({ tab, query: '', path: [] }, () => {
            if (tab === 'sources') {
                this.props.setValue(this.props.ip, 'media_browse', 'root');
            }
        });
    }

    private browseBack(): void {
        const path = [...this.state.path];
        path.pop();
        const target = path.length ? path[path.length - 1] : { id: 'root', title: '' };
        this.setState({ path, query: '' }, () => this.props.setValue(this.props.ip, 'media_browse', target.id));
    }

    private playItem(item: MediaBrowseItem): void {
        if (item.folder) {
            this.setState(
                prev => ({ path: [...prev.path, { id: item.id, title: item.title }], query: '' }),
                () => this.props.setValue(this.props.ip, 'media_browse', item.id),
            );
            return;
        }
        if (!item.uri && !item.favorite && !item.playlist && item.id !== 'tv') {
            return;
        }
        this.props.setValue(
            this.props.ip,
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

    /** Full-text search inside a music service; the adapter answers on `media_browse_result`. */
    private search(): void {
        const service = this.browseResult()?.serviceName;
        const term = this.state.query.trim();
        if (!service || !term) {
            return;
        }
        this.props.setValue(
            this.props.ip,
            'media_browse',
            `smapi-search:${encodeURIComponent(service)}:${encodeURIComponent(term)}`,
        );
    }

    // ---- render helpers -----------------------------------------------------

    // eslint-disable-next-line class-methods-use-this
    private renderItem(key: string, item: MediaBrowseItem, onClick: () => void): React.JSX.Element {
        return (
            <Box
                component="button"
                type="button"
                key={key}
                sx={{ ...styles.item, '&:hover': { backgroundColor: 'action.hover' } }}
                onClick={onClick}
            >
                {item.cover ? (
                    <div style={{ ...styles.thumb, backgroundImage: `url("${encodeURI(item.cover)}")` }} />
                ) : (
                    <Box
                        sx={{ ...styles.thumb, backgroundColor: 'action.selected' }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        {item.id === 'tv' ? (
                            <Tv fontSize="small" />
                        ) : item.folder ? (
                            <Folder fontSize="small" />
                        ) : (
                            <MusicNote fontSize="small" />
                        )}
                    </Box>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={styles.title}>{item.title}</div>
                    {item.artist || item.album ? (
                        <Typography
                            variant="caption"
                            style={styles.sub}
                            component="div"
                        >
                            {item.artist || item.album}
                        </Typography>
                    ) : null}
                </div>
            </Box>
        );
    }

    private renderTabs(): React.JSX.Element {
        return (
            <ToggleButtonGroup
                size="small"
                exclusive
                value={this.state.tab}
                onChange={(_e, value: LibraryTab | null) => this.setTab(value || '')}
            >
                {TABS.map(entry => (
                    <ToggleButton
                        key={entry.id}
                        value={entry.id}
                    >
                        {entry.icon}
                        <span style={{ marginLeft: 4 }}>{Generic.t(entry.label)}</span>
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>
        );
    }

    render(): React.JSX.Element {
        const { ip, coordinator } = this.props;
        const tab = this.state.tab;

        if (!tab) {
            return <div>{this.renderTabs()}</div>;
        }

        const query = this.state.query.trim().toLowerCase();
        const matches = (text: string): boolean => !query || text.toLowerCase().includes(query);
        let list: React.JSX.Element[] = [];
        let header: React.JSX.Element | null = null;

        if (tab === 'favorites') {
            const favorites = this.json<string[]>(coordinator, 'favorites_list_array') || [];
            list = favorites
                .filter(matches)
                .map(name =>
                    this.renderItem(`fav-${name}`, { id: name, title: name }, () =>
                        this.props.setValue(ip, 'favorites_set', name),
                    ),
                );
        } else if (tab === 'playlists') {
            const playlists = this.json<string[]>(coordinator, 'playlist_list_array') || [];
            list = playlists
                .filter(matches)
                .map(name =>
                    this.renderItem(`pl-${name}`, { id: name, title: name }, () =>
                        this.props.setValue(ip, 'playlist_set', name),
                    ),
                );
        } else if (tab === 'queue') {
            // Keep the original index - it is the track number `current_track_number` expects
            list = this.queue()
                .map((track, index) => ({ track, index }))
                .filter(entry => matches(`${entry.track.title} ${entry.track.artist || ''}`))
                .map(entry =>
                    this.renderItem(`q-${entry.index}`, { id: String(entry.index), ...entry.track }, () =>
                        this.props.setValue(ip, 'current_track_number', entry.index + 1),
                    ),
                );
        } else if (tab === 'recent') {
            const recent = this.json<RecentTrack[]>(ip, 'recent_tracks') || [];
            list = recent
                .filter(track => matches(`${track.title} ${track.artist || ''} ${track.album || ''}`))
                .map((track, index) =>
                    this.renderItem(
                        `r-${index}`,
                        {
                            id: track.uri || String(index),
                            title: track.title,
                            artist: track.artist,
                            album: track.album,
                            cover: track.cover,
                            uri: track.uri,
                        },
                        () => track.uri && this.props.setValue(ip, 'play_uri', track.uri),
                    ),
                );
        } else {
            const browse = this.browseResult();
            const items = (browse?.items || []).filter(item =>
                matches(`${item.title} ${item.artist || ''} ${item.album || ''}`),
            );

            header = (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {this.state.path.length ? (
                        <IconButton
                            size="small"
                            onClick={() => this.browseBack()}
                        >
                            <ArrowBack fontSize="small" />
                        </IconButton>
                    ) : null}
                    <Typography variant="caption">
                        {this.state.path.length ? this.state.path[this.state.path.length - 1].title : browse?.title}
                    </Typography>
                    {browse?.loginUrl ? (
                        <Tooltip title={browse.loginHint || browse.loginUrl}>
                            <IconButton
                                size="small"
                                onClick={() =>
                                    this.props.setValue(
                                        ip,
                                        'media_browse',
                                        `smapi-auth:${encodeURIComponent(browse.serviceName || '')}`,
                                    )
                                }
                            >
                                <Login fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    ) : null}
                </div>
            );

            list = items.map(item => this.renderItem(`s-${item.id}-${item.title}`, item, () => this.playItem(item)));
        }

        const searchable = tab === 'sources' && this.browseResult()?.searchable;

        return (
            <>
                <div>{this.renderTabs()}</div>
                <TextField
                    size="small"
                    variant="standard"
                    placeholder={Generic.t('search')}
                    value={this.state.query}
                    onChange={e => this.setState({ query: e.target.value })}
                    onKeyUp={e => e.key === 'Enter' && searchable && this.search()}
                    slotProps={{
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search fontSize="small" />
                                </InputAdornment>
                            ),
                            endAdornment: this.state.query ? (
                                <InputAdornment position="end">
                                    <IconButton
                                        size="small"
                                        onClick={() => this.setState({ query: '' })}
                                    >
                                        <Clear fontSize="small" />
                                    </IconButton>
                                </InputAdornment>
                            ) : null,
                        },
                    }}
                />
                {header}
                <div style={styles.sheet}>
                    {list.length ? (
                        list
                    ) : (
                        <Typography
                            variant="caption"
                            style={{ opacity: 0.6, padding: 8 }}
                        >
                            {Generic.t('nothing_found')}
                        </Typography>
                    )}
                </div>
            </>
        );
    }
}
