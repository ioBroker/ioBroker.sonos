// The SONOS control page, served by the `web` adapter under http://<host>:8082/sonos/
//
// Everything goes through the states of the sonos adapter - the page owns no protocol knowledge:
//
//     sonos.<instance>.root.<room>.state_simple      play (true) / pause (false)
//     sonos.<instance>.root.<room>.prev|next         write-only buttons
//     sonos.<instance>.root.<room>.volume|muted|seek playback controls
//     sonos.<instance>.root.<room>.current_*         what is playing
//     sonos.<instance>.root.<room>.coordinator       the room this one follows in a group
//
// A grouped speaker mirrors the playback of its group, but the library and the queue are written
// to the channel of the coordinator only - hence `coordinatorOf()`.

import React from 'react';

import {
    AppBar,
    Box,
    Checkbox,
    Chip,
    CircularProgress,
    FormControlLabel,
    IconButton,
    LinearProgress,
    MenuItem,
    Paper,
    Slider,
    TextField,
    Toolbar,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    Hearing,
    MusicNote,
    NightsStay,
    PauseRounded,
    PlayArrowRounded,
    Repeat,
    RepeatOne,
    ShuffleRounded,
    SkipNextRounded,
    SkipPreviousRounded,
    Tv,
    VolumeOff,
    VolumeUp,
} from '@mui/icons-material';

import type { Connection } from '@iobroker/socket-client';

import { createConnection } from './socket';
import { setLanguage, t, translated } from './i18n';
import SourceBrowser, { LIBRARY_STATES } from './SourceBrowser';
import type { SonosRoomInfo } from './types';

/** States the page reads for every discovered room. */
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
    'membersChannels',
    'muted',
    'night_mode',
    'repeat',
    'shuffle',
    'speech_enhancement',
    'state_simple',
    'volume',
] as const;

/** Remembers the room across reloads, so the page opens where it was left. */
const STORAGE_ROOM = 'sonos.web.room';

const SONOS_RED = '#e31c23';

interface AppState {
    /** False while the socket is down - the page then greys out instead of lying about values. */
    connected: boolean;
    /** True once the first connect finished, so "connecting" is only shown at the very beginning. */
    ready: boolean;
    /** All `sonos.x` instances that exist, so a household with two instances can be switched. */
    instances: string[];
    instance: string;
    rooms: SonosRoomInfo[];
    selectedRoom: string;
    /** Latest value of every subscribed state, keyed by the full object id. */
    values: Record<string, ioBroker.StateValue>;
    /** Volume while the slider is being dragged, so it does not jump back to the old value. */
    localVolume: number | null;
}

export default class App extends React.Component<Record<string, never>, AppState> {
    private socket: Connection | null = null;

    private subscribed: string[] = [];

    private volumeTimer: ReturnType<typeof setTimeout> | null = null;

    private unmounted = false;

    constructor(props: Record<string, never>) {
        super(props);
        this.state = {
            connected: false,
            ready: false,
            instances: [],
            instance: '',
            rooms: [],
            selectedRoom: '',
            values: {},
            localVolume: null,
        };
    }

    async componentDidMount(): Promise<void> {
        try {
            this.socket = await createConnection(
                () => void this.onReady(),
                connected => !this.unmounted && this.setState({ connected }),
            );
        } catch (error) {
            console.error(`Cannot connect to ioBroker: ${error as string}`);
            this.setState({ ready: true });
        }
    }

    componentWillUnmount(): void {
        this.unmounted = true;
        if (this.volumeTimer) {
            clearTimeout(this.volumeTimer);
            this.volumeTimer = null;
        }
        this.unsubscribeAll();
    }

    /** Called once the socket is up: pick the language, find the instances and load the rooms. */
    private async onReady(): Promise<void> {
        try {
            const config = await this.socket!.getSystemConfig();
            setLanguage(config?.common?.language);
        } catch {
            // the browser language stays
        }

        let instances: string[] = [];
        try {
            const objects = await this.socket!.getAdapterInstances('sonos');
            instances = (objects || []).map(obj => obj._id.replace('system.adapter.', '')).sort();
        } catch (error) {
            console.warn(`Cannot read the SONOS instances: ${error as string}`);
        }

        // `?instance=sonos.1` pins the page to one instance, e.g. for a bookmark or a vis iframe
        const wanted = new URLSearchParams(globalThis.location.search).get('instance');
        const instance = (wanted && instances.includes(wanted) ? wanted : instances[0]) || '';

        if (this.unmounted) {
            return;
        }
        this.setState({ instances, instance, connected: true, ready: true }, () => void this.loadRooms());
    }

    private async loadRooms(): Promise<void> {
        const instance = this.state.instance;
        if (!instance) {
            return;
        }

        const prefix = `${instance}.root.`;
        let rooms: SonosRoomInfo[] = [];
        try {
            const channels = await this.socket!.getObjectViewSystem('channel', prefix, `${prefix}香`);
            rooms = Object.keys(channels || {})
                .map(id => id.substring(prefix.length))
                // only direct children - a nested channel is not a speaker
                .filter(ip => ip && !ip.includes('.'))
                .map(ip => ({ ip, name: translated(channels[`${prefix}${ip}`]?.common?.name) || ip }))
                .sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            console.warn(`Cannot read the SONOS rooms of ${instance}: ${error as string}`);
        }

        if (this.unmounted) {
            return;
        }

        const wanted =
            new URLSearchParams(globalThis.location.search).get('room') ||
            globalThis.localStorage?.getItem(STORAGE_ROOM) ||
            '';
        const selected = rooms.find(room => room.ip === wanted || room.name === wanted) || rooms[0];

        this.setState({ rooms, selectedRoom: selected?.ip || '' }, () => this.resubscribe());
    }

    // ---- subscriptions ------------------------------------------------------

    /** Every room for the chips and the group list, plus the library of the selected room. */
    private wantedIds(): string[] {
        const instance = this.state.instance;
        if (!instance) {
            return [];
        }

        const ids: string[] = [];
        this.state.rooms.forEach(room => ROOM_STATES.forEach(name => ids.push(this.stateId(room.ip, name))));

        const selected = this.state.selectedRoom;
        if (selected) {
            const coordinator = this.coordinatorOf(selected);
            LIBRARY_STATES.forEach(name => {
                ids.push(this.stateId(selected, name));
                if (coordinator !== selected) {
                    ids.push(this.stateId(coordinator, name));
                }
            });
        }

        return [...new Set(ids)];
    }

    private onState = (id: string, state: ioBroker.State | null | undefined): void => {
        if (this.unmounted) {
            return;
        }
        this.setState(
            prev => ({ values: { ...prev.values, [id]: state ? state.val : null } }),
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
        if (this.subscribed.length && this.socket) {
            this.socket.unsubscribeState(this.subscribed, this.onState);
        }
        this.subscribed = [];
    }

    private resubscribe(): void {
        const wanted = this.wantedIds();
        if (wanted.length === this.subscribed.length && wanted.every(id => this.subscribed.includes(id))) {
            return;
        }

        this.unsubscribeAll();
        if (!wanted.length || !this.socket) {
            return;
        }

        this.subscribed = wanted;
        this.socket.subscribeState(wanted, this.onState).catch((error: unknown) => {
            console.warn(`Cannot subscribe on SONOS states: ${error as string}`);
        });
    }

    // ---- state access -------------------------------------------------------

    private stateId(ip: string, name: string): string {
        return `${this.state.instance}.root.${ip}.${name}`;
    }

    private val = (ip: string, name: string): ioBroker.StateValue => this.state.values[this.stateId(ip, name)] ?? null;

    private str(ip: string, name: string): string {
        const value = this.val(ip, name);
        return value === null || value === undefined ? '' : String(value);
    }

    private num(ip: string, name: string): number {
        return Number(this.val(ip, name)) || 0;
    }

    private set = (ip: string, name: string, value: ioBroker.StateValue): void => {
        this.socket?.setState(this.stateId(ip, name), value).catch((error: unknown) => {
            console.warn(`Cannot write ${this.stateId(ip, name)}: ${error as string}`);
        });
    };

    /** The room whose playback `ip` follows: its group coordinator, or `ip` itself. */
    private coordinatorOf(ip: string): string {
        const coordinator = this.str(ip, 'coordinator').trim();
        return coordinator && coordinator !== ip ? coordinator : ip;
    }

    /** The HDMI/TV input has no transport control, so those buttons must not be offered. */
    private isOnTv(ip: string): boolean {
        return this.num(ip, 'current_type') === 2 && this.str(ip, 'current_title') === 'TV';
    }

    private selectRoom(ip: string): void {
        try {
            globalThis.localStorage?.setItem(STORAGE_ROOM, ip);
        } catch {
            // a browser that refuses storage just forgets the room
        }
        this.setState({ selectedRoom: ip, localVolume: null }, () => this.resubscribe());
    }

    private static timeString(seconds: number): string {
        if (!seconds || seconds < 0 || !isFinite(seconds)) {
            return '0:00';
        }
        return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
            .toString()
            .padStart(2, '0')}`;
    }

    // ---- pieces -------------------------------------------------------------

    private renderHeader(): React.JSX.Element {
        return (
            <AppBar
                position="static"
                sx={{ bgcolor: SONOS_RED }}
            >
                <Toolbar variant="dense">
                    <Typography
                        variant="h6"
                        sx={{ flex: 1, fontWeight: 800, letterSpacing: '0.12em' }}
                    >
                        SONOS
                    </Typography>
                    {this.state.instances.length > 1 ? (
                        <TextField
                            select
                            size="small"
                            variant="standard"
                            label={t('instance')}
                            value={this.state.instance}
                            sx={{ minWidth: 120, mr: 2 }}
                            onChange={e =>
                                this.setState({ instance: e.target.value, rooms: [], values: {} }, () => {
                                    this.unsubscribeAll();
                                    void this.loadRooms();
                                })
                            }
                        >
                            {this.state.instances.map(instance => (
                                <MenuItem
                                    key={instance}
                                    value={instance}
                                >
                                    {instance}
                                </MenuItem>
                            ))}
                        </TextField>
                    ) : null}
                    {this.state.connected ? null : (
                        <Tooltip title={t('disconnected')}>
                            <CircularProgress
                                size={20}
                                color="inherit"
                            />
                        </Tooltip>
                    )}
                </Toolbar>
            </AppBar>
        );
    }

    private renderRooms(): React.JSX.Element | null {
        if (this.state.rooms.length < 2) {
            return null;
        }

        return (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {this.state.rooms.map(room => (
                    <Chip
                        key={room.ip}
                        size="small"
                        label={room.name}
                        color={room.ip === this.state.selectedRoom ? 'primary' : 'default'}
                        variant={room.ip === this.state.selectedRoom ? 'filled' : 'outlined'}
                        disabled={this.val(room.ip, 'alive') === false}
                        onClick={() => this.selectRoom(room.ip)}
                    />
                ))}
            </Box>
        );
    }

    private renderTransport(ip: string): React.JSX.Element {
        const playing = this.val(ip, 'state_simple') === true;
        const muted = this.val(ip, 'muted') === true;
        const repeat = this.num(ip, 'repeat');

        if (this.isOnTv(ip)) {
            return (
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Tooltip title={t('mute')}>
                        <IconButton onClick={() => this.set(ip, 'muted', !muted)}>
                            {muted ? <VolumeOff /> : <VolumeUp />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={t('night_mode')}>
                        <IconButton
                            color={this.val(ip, 'night_mode') === true ? 'primary' : 'default'}
                            onClick={() => this.set(ip, 'night_mode', this.val(ip, 'night_mode') !== true)}
                        >
                            <NightsStay />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={t('speech_enhancement')}>
                        <IconButton
                            color={this.val(ip, 'speech_enhancement') === true ? 'primary' : 'default'}
                            onClick={() =>
                                this.set(ip, 'speech_enhancement', this.val(ip, 'speech_enhancement') !== true)
                            }
                        >
                            <Hearing />
                        </IconButton>
                    </Tooltip>
                </Box>
            );
        }

        return (
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <Tooltip title={t('previous')}>
                    <IconButton onClick={() => this.set(ip, 'prev', true)}>
                        <SkipPreviousRounded fontSize="large" />
                    </IconButton>
                </Tooltip>
                <Tooltip title={t(playing ? 'pause' : 'play')}>
                    <IconButton onClick={() => this.set(ip, 'state_simple', !playing)}>
                        {playing ? <PauseRounded fontSize="large" /> : <PlayArrowRounded fontSize="large" />}
                    </IconButton>
                </Tooltip>
                <Tooltip title={t('next')}>
                    <IconButton onClick={() => this.set(ip, 'next', true)}>
                        <SkipNextRounded fontSize="large" />
                    </IconButton>
                </Tooltip>
                <Tooltip title={t('shuffle')}>
                    <IconButton
                        color={this.val(ip, 'shuffle') === true ? 'primary' : 'default'}
                        onClick={() => this.set(ip, 'shuffle', this.val(ip, 'shuffle') !== true)}
                    >
                        <ShuffleRounded />
                    </IconButton>
                </Tooltip>
                <Tooltip title={t('repeat')}>
                    <IconButton
                        color={repeat ? 'primary' : 'default'}
                        onClick={() => this.set(ip, 'repeat', (repeat + 1) % 3)}
                    >
                        {repeat === 2 ? <RepeatOne /> : <Repeat />}
                    </IconButton>
                </Tooltip>
                <Tooltip title={t('mute')}>
                    <IconButton onClick={() => this.set(ip, 'muted', !muted)}>
                        {muted ? <VolumeOff /> : <VolumeUp />}
                    </IconButton>
                </Tooltip>
            </Box>
        );
    }

    /** Progress bar with elapsed / total time. Radio and TV have no duration, so it is hidden. */
    private renderSeek(ip: string): React.JSX.Element | null {
        const duration = this.num(ip, 'current_duration');
        if (this.isOnTv(ip) || duration <= 0) {
            return null;
        }
        const elapsed = this.num(ip, 'current_elapsed');

        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography
                    variant="caption"
                    sx={{ fontVariantNumeric: 'tabular-nums' }}
                >
                    {App.timeString(elapsed)}
                </Typography>
                <Slider
                    size="small"
                    min={0}
                    max={100}
                    value={Math.min(100, Math.max(0, (elapsed / duration) * 100))}
                    valueLabelDisplay="off"
                    sx={{ color: SONOS_RED }}
                    onChangeCommitted={(_e, value) => this.set(ip, 'seek', Array.isArray(value) ? value[0] : value)}
                />
                <Typography
                    variant="caption"
                    sx={{ fontVariantNumeric: 'tabular-nums' }}
                >
                    {App.timeString(duration)}
                </Typography>
            </Box>
        );
    }

    /** The value is written 200 ms after the last move, so dragging does not flood the speaker. */
    private renderVolume(ip: string): React.JSX.Element {
        const volume = this.state.localVolume ?? this.num(ip, 'volume');

        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Tooltip title={t('volume')}>
                    <VolumeUp fontSize="small" />
                </Tooltip>
                <Slider
                    size="small"
                    min={0}
                    max={100}
                    value={volume}
                    valueLabelDisplay="auto"
                    sx={{ color: SONOS_RED }}
                    onChange={(_e, value) => {
                        const next = Array.isArray(value) ? value[0] : value;
                        this.setState({ localVolume: next });
                        if (this.volumeTimer) {
                            clearTimeout(this.volumeTimer);
                        }
                        this.volumeTimer = setTimeout(() => {
                            this.volumeTimer = null;
                            this.set(ip, 'volume', next);
                            this.setState({ localVolume: null });
                        }, 200);
                    }}
                />
                <Typography
                    variant="caption"
                    sx={{ minWidth: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                >
                    {volume}
                </Typography>
            </Box>
        );
    }

    private renderGroups(ip: string): React.JSX.Element | null {
        if (this.state.rooms.length < 2) {
            return null;
        }

        const coordinator = this.coordinatorOf(ip);
        const members = this.str(coordinator, 'membersChannels')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);

        return (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption">{t('group')}</Typography>
                {this.state.rooms.map(room => (
                    <FormControlLabel
                        key={room.ip}
                        control={
                            <Checkbox
                                size="small"
                                disabled={room.ip === coordinator}
                                checked={room.ip === coordinator || members.includes(room.ip)}
                                onChange={(_e, checked) =>
                                    this.set(coordinator, checked ? 'add_to_group' : 'remove_from_group', room.ip)
                                }
                            />
                        }
                        label={<Typography variant="caption">{room.name}</Typography>}
                    />
                ))}
            </Box>
        );
    }

    private renderPlayer(ip: string): React.JSX.Element {
        const cover = this.str(ip, 'current_cover');
        const title = this.str(ip, 'current_title') || t('nothing_playing');
        const station = this.str(ip, 'current_station');
        const sub = [this.str(ip, 'current_artist'), this.str(ip, 'current_album') || station]
            .filter(Boolean)
            .join(' · ');
        const grouped = this.coordinatorOf(ip) !== ip;
        const alive = this.val(ip, 'alive') !== false;

        return (
            <Paper sx={{ p: 1.5, display: 'flex', gap: 1.5, flexWrap: 'wrap', opacity: alive ? 1 : 0.6 }}>
                {cover ? (
                    <Box
                        sx={{
                            width: 120,
                            height: 120,
                            flex: '0 0 auto',
                            borderRadius: 1,
                            backgroundImage: `url("${encodeURI(cover)}")`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                        }}
                    />
                ) : (
                    <Box
                        sx={{
                            width: 120,
                            height: 120,
                            flex: '0 0 auto',
                            borderRadius: 1,
                            bgcolor: 'action.selected',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {this.isOnTv(ip) ? <Tv fontSize="large" /> : <MusicNote fontSize="large" />}
                    </Box>
                )}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1, minWidth: 240 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0 }}>
                        <Typography
                            variant="h6"
                            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                            {alive ? title : t('offline')}
                        </Typography>
                        {grouped ? (
                            <Typography
                                variant="caption"
                                sx={{ opacity: 0.6, flex: '0 0 auto' }}
                            >
                                {`· ${t('grouped')}`}
                            </Typography>
                        ) : null}
                    </Box>
                    <Typography
                        variant="body2"
                        sx={{ opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                        {sub}
                    </Typography>
                    {this.renderTransport(ip)}
                    {this.renderSeek(ip)}
                    {this.renderVolume(ip)}
                </Box>
            </Paper>
        );
    }

    render(): React.JSX.Element {
        if (!this.state.ready) {
            return (
                <Box sx={{ p: 3 }}>
                    <Typography variant="body2">{t('connecting')}</Typography>
                    <LinearProgress sx={{ mt: 1 }} />
                </Box>
            );
        }

        let body: React.JSX.Element;
        if (!this.state.instance) {
            body = <Typography variant="body2">{t('no_instance')}</Typography>;
        } else if (!this.state.rooms.length) {
            body = <Typography variant="body2">{t('no_players')}</Typography>;
        } else {
            const ip = this.state.selectedRoom;
            body = (
                <>
                    {this.renderRooms()}
                    {this.renderPlayer(ip)}
                    {this.renderGroups(ip)}
                    <Paper sx={{ p: 1.5, display: 'flex', flex: 1, minHeight: 260 }}>
                        <SourceBrowser
                            ip={ip}
                            coordinator={this.coordinatorOf(ip)}
                            getValue={this.val}
                            setValue={this.set}
                        />
                    </Paper>
                </>
            );
        }

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                {this.renderHeader()}
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        p: 1.5,
                        flex: 1,
                        minHeight: 0,
                        overflow: 'auto',
                        maxWidth: 900,
                        width: '100%',
                        boxSizing: 'border-box',
                        mx: 'auto',
                    }}
                >
                    {body}
                </Box>
            </Box>
        );
    }
}
