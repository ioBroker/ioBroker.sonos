// The source selection both SONOS widgets for ioBroker.devices open.
//
// It is the counterpart of the library of the vis-2 player widget: favorites, Sonos playlists,
// the current queue, recently played tracks and the browsable sources of the speaker (TuneIn,
// music library, network shares, line-in, HDMI and every music service the household uses).
//
//     sonos.<instance>.<room>.favorites_list_array   string[]  as JSON
//     sonos.<instance>.<room>.playlist_list_array    string[]  as JSON
//     sonos.<instance>.<room>.queue                  string    one track per line
//     sonos.<instance>.<room>.recent_tracks          RecentTrack[] as JSON
//     sonos.<instance>.<room>.media_browse           write     object id to browse, `root` = sources
//     sonos.<instance>.<room>.media_browse_result    MediaBrowseResult as JSON
//     sonos.<instance>.<room>.media_play             write     the browsed item to play
//
// The adapter routes every command to the group coordinator and writes the answers to ITS channel,
// so the lists are read from `coordinator` while the commands go to the room the user picked.

import { React, MuiMaterial, AdapterReact } from '@iobroker/dm-widgets';
import type { IStateContext } from '@iobroker/dm-widgets';
import type * as ReactTypes from 'react';
import type {
    BoxProps,
    DialogContentProps,
    DialogProps,
    DialogTitleProps,
    TextFieldProps,
    TypographyProps,
} from '@mui/material';
import type { I18n as I18nType } from '@iobroker/gui-components';

import { coordinatorOf, parseJson, stateId } from './utils';
import {
    BackIcon,
    ClearIcon,
    CloseIcon,
    FolderIcon,
    HistoryIcon,
    LibraryIcon,
    LoginIcon,
    MusicIcon,
    PlaylistIcon,
    SearchIcon,
    SONOS_RED,
    StarIcon,
    TvIcon,
} from './icons';
import type { MediaBrowseItem, MediaBrowseResult, RecentTrack, SourceTab } from './types';

const Box: React.ComponentType<BoxProps> = MuiMaterial?.Box;
const Typography: React.ComponentType<TypographyProps> = MuiMaterial?.Typography;
const Dialog: React.ComponentType<DialogProps> = MuiMaterial?.Dialog;
const DialogTitle: React.ComponentType<DialogTitleProps> = MuiMaterial?.DialogTitle;
const DialogContent: React.ComponentType<DialogContentProps> = MuiMaterial?.DialogContent;
const TextField: React.ComponentType<TextFieldProps> = MuiMaterial?.TextField;
const I18n = AdapterReact.I18n as typeof I18nType;

/** The host's React, with the real typings attached so this component can be written type safe. */
const ReactRuntime = React as typeof ReactTypes;

/** Everything the dialog reads. All of them live on the channel of the group coordinator. */
const LIBRARY_STATES = [
    'favorites_list_array',
    'playlist_list_array',
    'queue',
    'queue_array',
    'recent_tracks',
    'media_browse_result',
] as const;

const TABS: { id: SourceTab; label: string; Icon: React.ComponentType<{ sx?: BoxProps['sx'] }> }[] = [
    { id: 'favorites', label: 'sonosdm_favorites', Icon: StarIcon },
    { id: 'playlists', label: 'sonosdm_playlists', Icon: PlaylistIcon },
    { id: 'queue', label: 'sonosdm_queue', Icon: MusicIcon },
    { id: 'recent', label: 'sonosdm_recent', Icon: HistoryIcon },
    { id: 'sources', label: 'sonosdm_sources', Icon: FolderIcon },
];

export interface SourceDialogProps {
    stateContext: IStateContext;
    /** sonos adapter instance, e.g. `sonos.0` */
    instance: string;
    /** Channel name of the speaker the commands are written to */
    room: string;
    /** Speaker name for the dialog title */
    roomName: string;
    onClose: () => void;
}

interface SourceDialogState {
    /** Latest value of every subscribed state, keyed by the full object id. */
    values: Record<string, ioBroker.StateValue>;
    tab: SourceTab;
    query: string;
    /** Breadcrumb of the `sources` sheet - one entry per folder the user opened. */
    path: { id: string; title: string }[];
}

export default class SourceDialog extends ReactRuntime.Component<SourceDialogProps, SourceDialogState> {
    private subscribed: { id: string; handler: (id: string, state: ioBroker.State) => void }[] = [];

    constructor(props: SourceDialogProps) {
        super(props);
        this.state = { values: {}, tab: 'favorites', query: '', path: [] };
    }

    componentDidMount(): void {
        this.syncSubscriptions();
    }

    componentWillUnmount(): void {
        const context = this.props.stateContext;
        for (const { id, handler } of this.subscribed) {
            context.removeState(id, handler);
        }
        this.subscribed = [];
    }

    /**
     * Subscribes on the lists of the room and - as soon as `coordinator` is known and points
     * somewhere else - on the lists of the group coordinator as well.
     */
    private syncSubscriptions(): void {
        const { instance, room, stateContext } = this.props;
        const wanted = new Set<string>([stateId(instance, room, 'coordinator')]);
        for (const name of LIBRARY_STATES) {
            wanted.add(stateId(instance, room, name));
        }
        const coordinator = this.coordinator;
        if (coordinator !== room) {
            for (const name of LIBRARY_STATES) {
                wanted.add(stateId(instance, coordinator, name));
            }
        }

        for (const entry of this.subscribed.filter(item => !wanted.has(item.id))) {
            stateContext.removeState(entry.id, entry.handler);
        }
        this.subscribed = this.subscribed.filter(item => wanted.has(item.id));

        for (const id of wanted) {
            if (this.subscribed.some(item => item.id === id)) {
                continue;
            }
            const handler = (_id: string, state: ioBroker.State): void => {
                this.setState(
                    prev => ({ values: { ...prev.values, [id]: state ? state.val : null } }),
                    // The coordinator only becomes known once its state arrived, and the lists of a
                    // group member are written to the coordinator's channel - so follow it.
                    () => id.endsWith('.coordinator') && this.syncSubscriptions(),
                );
            };
            stateContext.getState(id, handler);
            this.subscribed.push({ id, handler });
        }
    }

    // ---- state access -------------------------------------------------------

    /** The room the lists are read from: the group coordinator, or the room itself. */
    private get coordinator(): string {
        const { instance, room } = this.props;
        const value = this.state.values[stateId(instance, room, 'coordinator')];
        return coordinatorOf(room, value === null || value === undefined ? '' : String(value));
    }

    private value(room: string, name: string): ioBroker.StateValue {
        return this.state.values[stateId(this.props.instance, room, name)] ?? null;
    }

    private json<T>(room: string, name: string): T | null {
        return parseJson<T>(this.value(room, name));
    }

    private browseResult(): MediaBrowseResult | null {
        return this.json<MediaBrowseResult>(this.coordinator, 'media_browse_result');
    }

    /**
     * The play queue of the group.
     *
     * `queue_array` carries one entry per track. Adapters that have not written it yet only offer
     * `queue`, where the tracks are joined with a comma - good enough for a list, but a title
     * containing a comma is then split into two rows.
     */
    private queue(): { title: string; artist?: string; album?: string; cover?: string }[] {
        const coordinator = this.coordinator;
        const array = this.json<{ title?: string; artist?: string; album?: string; cover?: string }[]>(
            coordinator,
            'queue_array',
        );
        if (array?.length) {
            return array.map(track => ({ ...track, title: track.title || '' }));
        }

        return String(this.value(coordinator, 'queue') ?? '')
            .split(/\r?\n|, /)
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => ({ title: line }));
    }

    /** Every command goes to the room the user picked; the adapter forwards it to the group. */
    private set(name: string, value: ioBroker.StateValue): void {
        void this.props.stateContext
            .getSocket()
            .setState(stateId(this.props.instance, this.props.room, name), value, false);
    }

    // ---- actions ------------------------------------------------------------

    private setTab(tab: SourceTab): void {
        this.setState({ tab, query: '', path: [] }, () => {
            if (tab === 'sources') {
                this.set('media_browse', 'root');
            }
        });
    }

    private browseBack(): void {
        const path = [...this.state.path];
        path.pop();
        const target = path.length ? path[path.length - 1] : { id: 'root', title: '' };
        this.setState({ path, query: '' }, () => this.set('media_browse', target.id));
    }

    private playItem(item: MediaBrowseItem): void {
        if (item.folder) {
            this.setState(
                prev => ({ path: [...prev.path, { id: item.id, title: item.title }], query: '' }),
                () => this.set('media_browse', item.id),
            );
            return;
        }
        if (!item.uri && !item.favorite && !item.playlist && item.id !== 'tv') {
            return;
        }
        this.set(
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
        this.set('media_browse', `smapi-search:${encodeURIComponent(service)}:${encodeURIComponent(term)}`);
    }

    // ---- pieces -------------------------------------------------------------

    /** One pill of the tab bar. Rendered as a styled Box so no MUI button has to be bridged. */
    private renderTab(entry: (typeof TABS)[number]): React.JSX.Element {
        const active = this.state.tab === entry.id;

        return (
            <Box
                key={entry.id}
                component="button"
                onClick={() => this.setTab(entry.id)}
                sx={{
                    all: 'unset',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1,
                    py: 0.5,
                    borderRadius: '14px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    whiteSpace: 'nowrap',
                    color: active ? SONOS_RED : 'inherit',
                    bgcolor: active ? 'rgba(227,28,35,0.14)' : 'rgba(127,127,127,0.18)',
                    '&:hover': { bgcolor: active ? 'rgba(227,28,35,0.22)' : 'rgba(127,127,127,0.32)' },
                }}
            >
                <entry.Icon sx={{ fontSize: '1rem' }} />
                {I18n.t(entry.label)}
            </Box>
        );
    }

    /** One row of the list - cover thumbnail, title and, when known, artist or album. */
    // eslint-disable-next-line class-methods-use-this
    private renderItem(key: string, item: MediaBrowseItem, onClick: () => void): React.JSX.Element {
        return (
            <Box
                key={key}
                component="button"
                onClick={onClick}
                sx={{
                    all: 'unset',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    width: '100%',
                    p: 0.5,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'rgba(127,127,127,0.18)' },
                }}
            >
                {item.cover ? (
                    <Box
                        sx={{
                            width: 36,
                            height: 36,
                            flex: '0 0 auto',
                            borderRadius: '4px',
                            backgroundImage: `url("${encodeURI(item.cover)}")`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                        }}
                    />
                ) : (
                    <Box
                        sx={{
                            width: 36,
                            height: 36,
                            flex: '0 0 auto',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: 'rgba(127,127,127,0.18)',
                        }}
                    >
                        {item.id === 'tv' ? (
                            <TvIcon sx={{ fontSize: '1.1rem' }} />
                        ) : item.folder ? (
                            <FolderIcon sx={{ fontSize: '1.1rem' }} />
                        ) : (
                            <MusicIcon sx={{ fontSize: '1.1rem' }} />
                        )}
                    </Box>
                )}
                <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <Typography
                        variant="body2"
                        sx={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                        {item.title}
                    </Typography>
                    {item.artist || item.album ? (
                        <Typography
                            variant="caption"
                            sx={{ opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                            {item.artist || item.album}
                        </Typography>
                    ) : null}
                </Box>
            </Box>
        );
    }

    /** Back button and the name of the folder the user is in - only the `sources` sheet has one. */
    private renderBreadcrumb(): React.JSX.Element | null {
        if (this.state.tab !== 'sources') {
            return null;
        }
        const browse = this.browseResult();
        const current = this.state.path.length ? this.state.path[this.state.path.length - 1].title : browse?.title;

        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 24 }}>
                {this.state.path.length ? (
                    <Box
                        component="button"
                        onClick={() => this.browseBack()}
                        sx={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                        <BackIcon sx={{ fontSize: '1.1rem' }} />
                    </Box>
                ) : null}
                <Typography
                    variant="caption"
                    sx={{ opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                    {current || ''}
                </Typography>
                {browse?.loginUrl ? (
                    <Box
                        component="button"
                        title={browse.loginHint || browse.loginUrl}
                        onClick={() =>
                            this.set('media_browse', `smapi-auth:${encodeURIComponent(browse.serviceName || '')}`)
                        }
                        sx={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                        <LoginIcon sx={{ fontSize: '1.1rem' }} />
                    </Box>
                ) : null}
            </Box>
        );
    }

    /** The rows of the sheet that is open. */
    private renderList(): React.JSX.Element[] {
        const coordinator = this.coordinator;
        const query = this.state.query.trim().toLowerCase();
        const matches = (text: string): boolean => !query || text.toLowerCase().includes(query);

        if (this.state.tab === 'favorites') {
            return (this.json<string[]>(coordinator, 'favorites_list_array') || [])
                .filter(matches)
                .map(name =>
                    this.renderItem(`fav-${name}`, { id: name, title: name }, () => this.set('favorites_set', name)),
                );
        }

        if (this.state.tab === 'playlists') {
            return (this.json<string[]>(coordinator, 'playlist_list_array') || [])
                .filter(matches)
                .map(name =>
                    this.renderItem(`pl-${name}`, { id: name, title: name }, () => this.set('playlist_set', name)),
                );
        }

        if (this.state.tab === 'queue') {
            // Keep the original index - it is the track number `current_track_number` expects
            return this.queue()
                .map((track, index) => ({ track, index }))
                .filter(entry => matches(`${entry.track.title} ${entry.track.artist || ''}`))
                .map(entry =>
                    this.renderItem(`q-${entry.index}`, { id: String(entry.index), ...entry.track }, () =>
                        this.set('current_track_number', entry.index + 1),
                    ),
                );
        }

        if (this.state.tab === 'recent') {
            return (this.json<RecentTrack[]>(this.props.room, 'recent_tracks') || [])
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
                        () => track.uri && this.set('play_uri', track.uri),
                    ),
                );
        }

        return (this.browseResult()?.items || [])
            .filter(item => matches(`${item.title} ${item.artist || ''} ${item.album || ''}`))
            .map(item => this.renderItem(`s-${item.id}-${item.title}`, item, () => this.playItem(item)));
    }

    render(): React.JSX.Element {
        const list = this.renderList();
        const searchable = this.state.tab === 'sources' && this.browseResult()?.searchable;

        return (
            <Dialog
                open
                maxWidth="sm"
                fullWidth
                onClose={() => this.props.onClose()}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LibraryIcon />
                    <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {`${I18n.t('sonosdm_sources')} · ${this.props.roomName}`}
                    </Box>
                    <Box
                        component="button"
                        onClick={() => this.props.onClose()}
                        sx={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                        <CloseIcon />
                    </Box>
                </DialogTitle>
                <DialogContent
                    sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 320, overflow: 'hidden' }}
                >
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {TABS.map(entry => this.renderTab(entry))}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SearchIcon sx={{ fontSize: '1.1rem', opacity: 0.7 }} />
                        <TextField
                            size="small"
                            variant="standard"
                            fullWidth
                            placeholder={I18n.t('sonosdm_search')}
                            value={this.state.query}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                this.setState({ query: e.target.value })
                            }
                            onKeyUp={(e: React.KeyboardEvent) => {
                                if (e.key === 'Enter' && searchable) {
                                    this.search();
                                }
                            }}
                        />
                        {this.state.query ? (
                            <Box
                                component="button"
                                onClick={() => this.setState({ query: '' })}
                                sx={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            >
                                <ClearIcon sx={{ fontSize: '1.1rem' }} />
                            </Box>
                        ) : null}
                    </Box>
                    {this.renderBreadcrumb()}
                    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
                        {list.length ? (
                            list
                        ) : (
                            <Typography
                                variant="caption"
                                sx={{ opacity: 0.6, p: 1 }}
                            >
                                {I18n.t('sonosdm_nothing_found')}
                            </Typography>
                        )}
                    </Box>
                </DialogContent>
            </Dialog>
        );
    }
}
