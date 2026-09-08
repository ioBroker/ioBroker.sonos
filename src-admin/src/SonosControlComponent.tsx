// SONOS control panel for the admin instance configuration.
//
// Rendered by JsonConfig as a `custom` item (see the `controlTab` in `admin/jsonConfig.json`), so
// the whole speaker set can be watched and controlled without leaving the adapter settings.
//
// Everything runs over the states the adapter creates below `sonos.<instance>.root.<room>` - the
// component needs no message handler of its own:
//
//     state_simple / prev / next / seek / volume / muted    transport
//     current_*                                             what is playing
//     coordinator / membersChannels / add_to_group / ...    groups
//     favorites_* / playlist_* / queue / recent_tracks      the library sheets
//     media_browse / media_browse_result / media_play       browsing the music services
//
// The library of a group member is written to the channel of its coordinator, so those states are
// always read from `coordinatorOf(room)`.

import React from 'react';

import {
    Box,
    Checkbox,
    Chip,
    Divider,
    FormControlLabel,
    IconButton,
    InputAdornment,
    LinearProgress,
    Paper,
    Slider,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    ArrowBack,
    Clear,
    Folder,
    Hearing,
    Login,
    MusicNote,
    NightsStay,
    PauseRounded,
    PlayArrowRounded,
    QueueMusic,
    Refresh,
    Repeat,
    RepeatOne,
    Search,
    ShuffleRounded,
    SkipNextRounded,
    SkipPreviousRounded,
    Speaker,
    Star,
    Tv,
    VolumeOff,
    VolumeUp,
} from '@mui/icons-material';
import { I18n } from '@iobroker/gui-components';
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';

import type { LibraryTab, MediaBrowseItem, MediaBrowseResult, RecentTrack, SonosRoomInfo } from './types';

/** States read for every room, so the room list and the player can be rendered. */
const ROOM_STATES = [
    'alive',
    'coordinator',
    'current_album',
    'current_artist',
    'current_cover',
    'current_duration',
    'current_elapsed',
    'current_station',
    'current_title',
    'current_type',
    'group_volume',
    'membersChannels',
    'muted',
    'night_mode',
    'repeat',
    'shuffle',
    'speech_enhancement',
    'state_simple',
    'volume',
] as const;

/** States of the library sheets - always read from the coordinator of the selected room. */
const LIBRARY_STATES = [
    'favorites_list_array',
    'playlist_list_array',
    'queue',
    'queue_array',
    'recent_tracks',
    'media_browse_result',
] as const;

const TABS: { id: LibraryTab; label: string; icon: React.JSX.Element }[] = [
    { id: 'favorites', label: 'sonos_ctrl_favorites', icon: <Star fontSize="small" /> },
    { id: 'playlists', label: 'sonos_ctrl_playlists', icon: <QueueMusic fontSize="small" /> },
    { id: 'queue', label: 'sonos_ctrl_queue', icon: <MusicNote fontSize="small" /> },
    { id: 'recent', label: 'sonos_ctrl_recent', icon: <Speaker fontSize="small" /> },
    { id: 'sources', label: 'sonos_ctrl_sources', icon: <Folder fontSize="small" /> },
];

const styles: Record<string, React.CSSProperties> = {
    root: { display: 'flex', gap: 16, width: '100%', alignItems: 'flex-start', flexWrap: 'wrap' },
    roomList: { width: 260, flex: '1 1 240px', maxWidth: 320, padding: 8 },
    player: { flex: '3 1 420px', minWidth: 320, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
    cover: {
        width: 132,
        height: 132,
        flex: '0 0 auto',
        borderRadius: 8,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: { fontSize: '130%', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    sub: { opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    row: { display: 'flex', alignItems: 'center', gap: 8 },
    listButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        width: '100%',
        border: 0,
        borderRadius: 4,
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
    },
    thumb: { width: 36, height: 36, borderRadius: 4, backgroundSize: 'cover', backgroundPosition: 'center' },
    sheet: { maxHeight: 320, overflow: 'auto', display: 'flex', flexDirection: 'column' },
};

interface SonosControlState extends ConfigGenericState {
    rooms: SonosRoomInfo[];
    selectedRoom: string;
    /** Latest value of every subscribed state, keyed by the full object id. */
    sonos: Record<string, ioBroker.StateValue>;
    tab: LibraryTab | '';
    query: string;
    /** Breadcrumb of the `sources` sheet: one entry per folder the user opened. */
    path: { id: string; title: string }[];
    /** Volume while the slider is being dragged, so it does not jump back to the old value. */
    localVolume: number | null;
    loading: boolean;
}

export default class SonosControlComponent extends ConfigGeneric<ConfigGenericProps, SonosControlState> {
    private subscribed: string[] = [];

    private volumeTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: ConfigGenericProps) {
        super(props);
        this.state = {
            ...this.state,
            rooms: [],
            selectedRoom: '',
            sonos: {},
            tab: '',
            query: '',
            path: [],
            localVolume: null,
            loading: true,
        };
    }

    async componentDidMount(): Promise<void> {
        await super.componentDidMount();
        await this.refreshRooms();
    }

    componentWillUnmount(): void {
        super.componentWillUnmount();
        if (this.volumeTimer) {
            clearTimeout(this.volumeTimer);
            this.volumeTimer = null;
        }
        this.unsubscribeAll();
    }

    private get namespace(): string {
        return `sonos.${this.props.oContext.instance}`;
    }

    private stateId(room: string, name: string): string {
        return `${this.namespace}.root.${room}.${name}`;
    }

    /**
     * All speakers of the instance, read from the object tree rather than from the settings, so the
     * list also contains the devices of a configuration that has not been saved yet.
     */
    private async refreshRooms(): Promise<void> {
        const prefix = `${this.namespace}.root.`;
        const rooms: SonosRoomInfo[] = [];

        try {
            const channels = await this.props.oContext.socket.getObjectViewSystem('channel', prefix, `${prefix}香`);
            for (const id of Object.keys(channels || {})) {
                const room = id.substring(prefix.length);
                // only the direct children are speakers
                if (!room || room.includes('.')) {
                    continue;
                }
                rooms.push({ id, room, name: SonosControlComponent.getText(channels[id]?.common?.name) || room });
            }
            rooms.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            console.warn(`Cannot read the SONOS rooms: ${error as string}`);
        }

        const selected = rooms.find(item => item.room === this.state.selectedRoom) || rooms[0];
        this.setState({ rooms, selectedRoom: selected?.room || '', loading: false }, () => this.resubscribe());
    }

    /** `common.name` may be a plain string or a translation object. */
    private static getText(text: ioBroker.StringOrTranslated | undefined): string {
        if (!text) {
            return '';
        }
        if (typeof text === 'string') {
            return text;
        }
        return text[I18n.getLanguage()] || text.en || '';
    }

    // ---- subscriptions ------------------------------------------------------

    /** Every room for the list, plus the library of the selected room and of its coordinator. */
    private wantedIds(): string[] {
        const ids: string[] = [];
        for (const item of this.state.rooms) {
            for (const name of ROOM_STATES) {
                ids.push(this.stateId(item.room, name));
            }
        }

        const selected = this.state.selectedRoom;
        if (selected) {
            const coordinator = this.coordinatorOf(selected);
            for (const name of LIBRARY_STATES) {
                ids.push(this.stateId(selected, name));
                if (coordinator !== selected) {
                    ids.push(this.stateId(coordinator, name));
                }
            }
        }

        return [...new Set(ids)];
    }

    private onSonosState = (id: string, state: ioBroker.State | null | undefined): void => {
        this.setState(
            prev => ({ sonos: { ...prev.sonos, [id]: state ? state.val : null } }),
            () => {
                // The coordinator is only known once its state arrived, and the library of a group
                // member is written to the coordinator's channel - so the subscription follows it.
                if (id === this.stateId(this.state.selectedRoom, 'coordinator')) {
                    this.resubscribe();
                }
            },
        );
    };

    private unsubscribeAll(): void {
        if (this.subscribed.length) {
            this.props.oContext.socket.unsubscribeState(this.subscribed, this.onSonosState);
            this.subscribed = [];
        }
    }

    private resubscribe(): void {
        const wanted = this.wantedIds();
        if (wanted.length === this.subscribed.length && wanted.every(id => this.subscribed.includes(id))) {
            return;
        }

        this.unsubscribeAll();
        if (!wanted.length) {
            return;
        }

        this.subscribed = wanted;
        this.props.oContext.socket.subscribeState(wanted, this.onSonosState).catch((error: unknown) => {
            console.warn(`Cannot subscribe on the SONOS states: ${error as string}`);
        });
    }

    // ---- state access -------------------------------------------------------

    private val(room: string, name: string): ioBroker.StateValue {
        return this.state.sonos[this.stateId(room, name)] ?? null;
    }

    private str(room: string, name: string): string {
        const value = this.val(room, name);
        return value === null || value === undefined ? '' : String(value);
    }

    private num(room: string, name: string): number {
        return Number(this.val(room, name)) || 0;
    }

    private set(room: string, name: string, value: ioBroker.StateValue): void {
        this.props.oContext.socket.setState(this.stateId(room, name), value, false).catch((error: unknown) => {
            console.warn(`Cannot write ${this.stateId(room, name)}: ${error as string}`);
        });
    }

    /**
     * The play queue of the group.
     *
     * `queue_array` carries one entry per track. Adapters that have not written it yet only offer
     * `queue`, where the tracks are joined with a comma - good enough for a list, but a title
     * containing a comma is then split into two rows.
     */
    private queue(coordinator: string): { title: string; artist?: string; album?: string; cover?: string }[] {
        const array = this.parseJson<{ title?: string; artist?: string; album?: string; cover?: string }[]>(
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

    /** The room whose playback `room` follows - itself when it is not a group member. */
    private coordinatorOf(room: string): string {
        const coordinator = this.str(room, 'coordinator').trim();
        return coordinator && coordinator !== room ? coordinator : room;
    }

    private parseJson<T>(room: string, name: string): T | null {
        const raw = this.val(room, name);
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

    /** The HDMI/TV input has no transport control, so those buttons must not be offered. */
    private isOnTv(room: string): boolean {
        return this.num(room, 'current_type') === 2 && this.str(room, 'current_title') === 'TV';
    }

    private static timeString(seconds: number): string {
        if (!seconds || seconds < 0 || !isFinite(seconds)) {
            return '0:00';
        }
        return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
            .toString()
            .padStart(2, '0')}`;
    }

    // ---- actions ------------------------------------------------------------

    private selectRoom(room: string): void {
        this.setState({ selectedRoom: room, path: [], query: '' }, () => this.resubscribe());
    }

    private browse(objectId: string, title: string, push: boolean): void {
        const selected = this.state.selectedRoom;
        if (!selected) {
            return;
        }
        this.setState(
            prev => ({ path: push ? [...prev.path, { id: objectId, title }] : prev.path, query: '' }),
            () => this.set(selected, 'media_browse', objectId),
        );
    }

    private browseBack(): void {
        const path = [...this.state.path];
        path.pop();
        const target = path.length ? path[path.length - 1] : { id: 'root', title: '' };
        this.setState({ path, query: '' }, () => this.set(this.state.selectedRoom, 'media_browse', target.id));
    }

    private playItem(item: MediaBrowseItem): void {
        const selected = this.state.selectedRoom;
        if (!selected) {
            return;
        }
        if (item.folder) {
            this.browse(item.id, item.title, true);
            return;
        }
        if (!item.uri && !item.favorite && !item.playlist && item.id !== 'tv') {
            return;
        }
        this.set(
            selected,
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

    private search(): void {
        const browse = this.parseJson<MediaBrowseResult>(
            this.coordinatorOf(this.state.selectedRoom),
            'media_browse_result',
        );
        const service = browse?.serviceName;
        const term = this.state.query.trim();
        if (!service || !term) {
            return;
        }
        this.set(
            this.state.selectedRoom,
            'media_browse',
            `smapi-search:${encodeURIComponent(service)}:${encodeURIComponent(term)}`,
        );
    }

    // ---- render helpers -----------------------------------------------------

    private renderRoomList(): React.JSX.Element {
        return (
            <Paper style={styles.roomList}>
                <div style={{ ...styles.row, justifyContent: 'space-between', padding: '0 4px 4px' }}>
                    <Typography variant="subtitle2">{I18n.t('sonos_ctrl_speakers')}</Typography>
                    <Tooltip title={I18n.t('sonos_ctrl_refresh')}>
                        <IconButton
                            size="small"
                            onClick={() => void this.refreshRooms()}
                        >
                            <Refresh fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </div>
                <Divider />
                {this.state.rooms.map(item => {
                    const alive = this.val(item.room, 'alive') !== false;
                    const playing = this.val(item.room, 'state_simple') === true;
                    const selected = item.room === this.state.selectedRoom;
                    const title = this.str(item.room, 'current_title');

                    return (
                        <Box
                            key={item.room}
                            component="button"
                            sx={{
                                ...styles.listButton,
                                opacity: alive ? 1 : 0.5,
                                backgroundColor: selected ? 'action.selected' : 'transparent',
                                '&:hover': { backgroundColor: 'action.hover' },
                            }}
                            onClick={() => this.selectRoom(item.room)}
                        >
                            {playing ? (
                                <PlayArrowRounded
                                    fontSize="small"
                                    color="primary"
                                />
                            ) : (
                                <Speaker fontSize="small" />
                            )}
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={styles.sub}>
                                    <Typography
                                        variant="body2"
                                        component="span"
                                        style={{ fontWeight: selected ? 600 : 400 }}
                                    >
                                        {item.name}
                                    </Typography>
                                </div>
                                <Typography
                                    variant="caption"
                                    component="div"
                                    style={styles.sub}
                                >
                                    {alive
                                        ? title || I18n.t('sonos_ctrl_nothing_playing')
                                        : I18n.t('sonos_ctrl_offline')}
                                </Typography>
                            </div>
                            <Typography
                                variant="caption"
                                style={{ opacity: 0.7 }}
                            >
                                {this.num(item.room, 'volume')}
                            </Typography>
                        </Box>
                    );
                })}
            </Paper>
        );
    }

    private renderTransport(room: string): React.JSX.Element {
        const muted = this.val(room, 'muted') === true;
        const repeat = this.num(room, 'repeat');

        if (this.isOnTv(room)) {
            return (
                <div style={styles.row}>
                    <Tooltip title={I18n.t('sonos_ctrl_mute')}>
                        <IconButton onClick={() => this.set(room, 'muted', !muted)}>
                            {muted ? <VolumeOff /> : <VolumeUp />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={I18n.t('sonos_ctrl_night_mode')}>
                        <IconButton
                            color={this.val(room, 'night_mode') === true ? 'primary' : 'default'}
                            onClick={() => this.set(room, 'night_mode', this.val(room, 'night_mode') !== true)}
                        >
                            <NightsStay />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={I18n.t('sonos_ctrl_speech_enhancement')}>
                        <IconButton
                            color={this.val(room, 'speech_enhancement') === true ? 'primary' : 'default'}
                            onClick={() =>
                                this.set(room, 'speech_enhancement', this.val(room, 'speech_enhancement') !== true)
                            }
                        >
                            <Hearing />
                        </IconButton>
                    </Tooltip>
                </div>
            );
        }

        const playing = this.val(room, 'state_simple') === true;

        return (
            <div style={styles.row}>
                <IconButton onClick={() => this.set(room, 'prev', true)}>
                    <SkipPreviousRounded fontSize="large" />
                </IconButton>
                <IconButton onClick={() => this.set(room, 'state_simple', !playing)}>
                    {playing ? <PauseRounded fontSize="large" /> : <PlayArrowRounded fontSize="large" />}
                </IconButton>
                <IconButton onClick={() => this.set(room, 'next', true)}>
                    <SkipNextRounded fontSize="large" />
                </IconButton>
                <Tooltip title={I18n.t('sonos_ctrl_shuffle')}>
                    <IconButton
                        color={this.val(room, 'shuffle') === true ? 'primary' : 'default'}
                        onClick={() => this.set(room, 'shuffle', this.val(room, 'shuffle') !== true)}
                    >
                        <ShuffleRounded />
                    </IconButton>
                </Tooltip>
                <Tooltip title={I18n.t('sonos_ctrl_repeat')}>
                    <IconButton
                        color={repeat ? 'primary' : 'default'}
                        onClick={() => this.set(room, 'repeat', (repeat + 1) % 3)}
                    >
                        {repeat === 2 ? <RepeatOne /> : <Repeat />}
                    </IconButton>
                </Tooltip>
                <Tooltip title={I18n.t('sonos_ctrl_mute')}>
                    <IconButton onClick={() => this.set(room, 'muted', !muted)}>
                        {muted ? <VolumeOff /> : <VolumeUp />}
                    </IconButton>
                </Tooltip>
            </div>
        );
    }

    private renderSeek(room: string): React.JSX.Element | null {
        const duration = this.num(room, 'current_duration');
        if (this.isOnTv(room) || duration <= 0) {
            return null;
        }
        const elapsed = this.num(room, 'current_elapsed');

        return (
            <div style={styles.row}>
                <Typography variant="caption">{SonosControlComponent.timeString(elapsed)}</Typography>
                <Slider
                    size="small"
                    min={0}
                    max={100}
                    value={Math.min(100, Math.max(0, (elapsed / duration) * 100))}
                    valueLabelDisplay="off"
                    onChangeCommitted={(_e, value) => this.set(room, 'seek', Array.isArray(value) ? value[0] : value)}
                />
                <Typography variant="caption">{SonosControlComponent.timeString(duration)}</Typography>
            </div>
        );
    }

    private renderVolume(room: string): React.JSX.Element {
        const volume = this.state.localVolume ?? this.num(room, 'volume');

        return (
            <div style={styles.row}>
                <VolumeUp fontSize="small" />
                <Slider
                    size="small"
                    min={0}
                    max={100}
                    value={volume}
                    valueLabelDisplay="auto"
                    onChange={(_e, value) => {
                        const next = Array.isArray(value) ? value[0] : value;
                        this.setState({ localVolume: next });
                        if (this.volumeTimer) {
                            clearTimeout(this.volumeTimer);
                        }
                        this.volumeTimer = setTimeout(() => {
                            this.volumeTimer = null;
                            this.set(room, 'volume', next);
                            this.setState({ localVolume: null });
                        }, 200);
                    }}
                />
                <Typography
                    variant="caption"
                    style={{ minWidth: 28, textAlign: 'right' }}
                >
                    {volume}
                </Typography>
            </div>
        );
    }

    /**
     * Group membership. The checkboxes are written to the coordinator's `add_to_group` /
     * `remove_from_group`, which is how the adapter expects group changes.
     */
    private renderGroups(room: string): React.JSX.Element | null {
        if (this.state.rooms.length < 2) {
            return null;
        }

        const coordinator = this.coordinatorOf(room);
        const members = this.str(coordinator, 'membersChannels')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);

        return (
            <div style={{ ...styles.row, flexWrap: 'wrap' }}>
                <Typography variant="caption">{I18n.t('sonos_ctrl_group')}</Typography>
                {this.state.rooms.map(item => (
                    <FormControlLabel
                        key={item.room}
                        control={
                            <Checkbox
                                size="small"
                                disabled={item.room === coordinator}
                                checked={item.room === coordinator || members.includes(item.room)}
                                onChange={(_e, checked) =>
                                    this.set(coordinator, checked ? 'add_to_group' : 'remove_from_group', item.room)
                                }
                            />
                        }
                        label={<Typography variant="caption">{item.name}</Typography>}
                    />
                ))}
            </div>
        );
    }

    static renderMediaItem(key: string, item: MediaBrowseItem, onClick: () => void): React.JSX.Element {
        return (
            <Box
                key={key}
                component="button"
                sx={{ ...styles.listButton, '&:hover': { backgroundColor: 'action.hover' } }}
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
                    <div style={styles.sub}>{item.title}</div>
                    {item.artist || item.album ? (
                        <Typography
                            variant="caption"
                            component="div"
                            style={styles.sub}
                        >
                            {item.artist || item.album}
                        </Typography>
                    ) : null}
                </div>
            </Box>
        );
    }

    private renderLibrary(room: string): React.JSX.Element {
        const coordinator = this.coordinatorOf(room);
        const tab = this.state.tab;

        const tabs = (
            <ToggleButtonGroup
                size="small"
                exclusive
                value={tab}
                onChange={(_e, value: LibraryTab | null) =>
                    this.setState({ tab: value || '', query: '', path: [] }, () => {
                        if (value === 'sources') {
                            this.set(room, 'media_browse', 'root');
                        }
                    })
                }
            >
                {TABS.map(entry => (
                    <ToggleButton
                        key={entry.id}
                        value={entry.id}
                    >
                        {entry.icon}
                        <span style={{ marginLeft: 4 }}>{I18n.t(entry.label)}</span>
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>
        );

        if (!tab) {
            return <div>{tabs}</div>;
        }

        const query = this.state.query.trim().toLowerCase();
        const matches = (text: string): boolean => !query || text.toLowerCase().includes(query);
        let list: React.JSX.Element[] = [];
        let header: React.JSX.Element | null = null;

        if (tab === 'favorites') {
            const favorites = this.parseJson<string[]>(coordinator, 'favorites_list_array') || [];
            list = favorites
                .filter(matches)
                .map(name =>
                    SonosControlComponent.renderMediaItem(`fav-${name}`, { id: name, title: name }, () =>
                        this.set(room, 'favorites_set', name),
                    ),
                );
        } else if (tab === 'playlists') {
            const playlists = this.parseJson<string[]>(coordinator, 'playlist_list_array') || [];
            list = playlists
                .filter(matches)
                .map(name =>
                    SonosControlComponent.renderMediaItem(`pl-${name}`, { id: name, title: name }, () =>
                        this.set(room, 'playlist_set', name),
                    ),
                );
        } else if (tab === 'queue') {
            // Keep the original index - it is the track number `current_track_number` expects
            list = this.queue(coordinator)
                .map((track, index) => ({ track, index }))
                .filter(entry => matches(`${entry.track.title} ${entry.track.artist || ''}`))
                .map(entry =>
                    SonosControlComponent.renderMediaItem(
                        `q-${entry.index}`,
                        { id: String(entry.index), ...entry.track },
                        () => this.set(room, 'current_track_number', entry.index + 1),
                    ),
                );
        } else if (tab === 'recent') {
            const recent = this.parseJson<RecentTrack[]>(room, 'recent_tracks') || [];
            list = recent
                .filter(track => matches(`${track.title} ${track.artist || ''} ${track.album || ''}`))
                .map((track, index) =>
                    SonosControlComponent.renderMediaItem(
                        `r-${index}`,
                        {
                            id: track.uri || String(index),
                            title: track.title,
                            artist: track.artist,
                            album: track.album,
                            cover: track.cover,
                            uri: track.uri,
                        },
                        () => track.uri && this.set(room, 'play_uri', track.uri),
                    ),
                );
        } else {
            const browse = this.parseJson<MediaBrowseResult>(coordinator, 'media_browse_result');
            const items = (browse?.items || []).filter(item =>
                matches(`${item.title} ${item.artist || ''} ${item.album || ''}`),
            );

            header = (
                <div style={styles.row}>
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
                                    this.set(
                                        room,
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

            list = items.map(item =>
                SonosControlComponent.renderMediaItem(`s-${item.id}-${item.title}`, item, () => this.playItem(item)),
            );
        }

        const searchable =
            tab === 'sources' && this.parseJson<MediaBrowseResult>(coordinator, 'media_browse_result')?.searchable;

        return (
            <>
                <div>{tabs}</div>
                <TextField
                    size="small"
                    variant="standard"
                    placeholder={I18n.t(searchable ? 'sonos_ctrl_search_service' : 'sonos_ctrl_search')}
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
                            {I18n.t('sonos_ctrl_nothing_found')}
                        </Typography>
                    )}
                </div>
            </>
        );
    }

    private renderPlayer(): React.JSX.Element {
        const room = this.state.selectedRoom;
        const cover = this.str(room, 'current_cover');
        const title = this.str(room, 'current_title') || I18n.t('sonos_ctrl_nothing_playing');
        const station = this.str(room, 'current_station');
        const sub = [this.str(room, 'current_artist'), this.str(room, 'current_album') || station]
            .filter(Boolean)
            .join(' · ');
        const coordinator = this.coordinatorOf(room);

        return (
            <Paper style={styles.player}>
                <div style={{ ...styles.row, alignItems: 'flex-start', gap: 12 }}>
                    {cover ? (
                        <div style={{ ...styles.cover, backgroundImage: `url("${encodeURI(cover)}")` }} />
                    ) : (
                        <Box sx={{ ...styles.cover, backgroundColor: 'action.selected' }}>
                            {this.isOnTv(room) ? <Tv fontSize="large" /> : <MusicNote fontSize="large" />}
                        </Box>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                        <div style={styles.row}>
                            <Typography
                                variant="subtitle2"
                                style={{ opacity: 0.75 }}
                            >
                                {this.state.rooms.find(item => item.room === room)?.name || room}
                            </Typography>
                            {coordinator !== room ? (
                                <Chip
                                    size="small"
                                    label={`${I18n.t('sonos_ctrl_follows')} ${
                                        this.state.rooms.find(item => item.room === coordinator)?.name || coordinator
                                    }`}
                                />
                            ) : null}
                            {this.val(room, 'alive') === false ? (
                                <Chip
                                    size="small"
                                    color="warning"
                                    label={I18n.t('sonos_ctrl_offline')}
                                />
                            ) : null}
                        </div>
                        <div style={styles.title}>{title}</div>
                        <div style={styles.sub}>{sub}</div>
                        {this.renderTransport(room)}
                        {this.renderSeek(room)}
                        {this.renderVolume(room)}
                    </div>
                </div>
                {this.renderGroups(room)}
                <Divider />
                {this.renderLibrary(room)}
            </Paper>
        );
    }

    renderItem(): React.JSX.Element {
        if (this.state.loading) {
            return <LinearProgress />;
        }

        if (!this.props.alive) {
            return (
                <Typography
                    variant="body2"
                    style={{ padding: 8 }}
                >
                    {I18n.t('sonos_ctrl_instance_not_running')}
                </Typography>
            );
        }

        if (!this.state.rooms.length) {
            return (
                <div style={{ padding: 8 }}>
                    <Typography variant="body2">{I18n.t('sonos_ctrl_no_players')}</Typography>
                    <Tooltip title={I18n.t('sonos_ctrl_refresh')}>
                        <IconButton
                            size="small"
                            onClick={() => void this.refreshRooms()}
                        >
                            <Refresh fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </div>
            );
        }

        return (
            <div style={styles.root}>
                {this.renderRoomList()}
                {this.renderPlayer()}
            </div>
        );
    }
}
