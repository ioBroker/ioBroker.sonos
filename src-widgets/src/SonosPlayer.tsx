import React from 'react';

import {
    Box,
    Checkbox,
    Chip,
    FormControlLabel,
    IconButton,
    LinearProgress,
    Slider,
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

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic, { ROOM_STATES } from './Generic';
import SourceBrowser, { LIBRARY_STATES } from './SourceBrowser';
import type { SonosRoomInfo } from './types';

const styles: Record<string, React.CSSProperties> = {
    root: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', height: '100%', minHeight: 0 },
    rooms: { display: 'flex', flexWrap: 'wrap', gap: 4 },
    main: { display: 'flex', gap: 12, minHeight: 0 },
    cover: {
        width: 120,
        height: 120,
        flex: '0 0 auto',
        borderRadius: 8,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    meta: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 },
    title: { fontSize: '130%', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    sub: { opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    buttons: { display: 'flex', alignItems: 'center', flexWrap: 'wrap' },
    seek: { display: 'flex', alignItems: 'center', gap: 8 },
    volume: { display: 'flex', alignItems: 'center', gap: 8 },
    groups: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
};

interface SonosPlayerRxData {
    noCard: boolean;
    widgetTitle: string;
    instance: string;
    /** Instance object of the vis-1 widget, e.g. `sonos.0` */
    oid: string;
    defaultRoom: string;
    showRooms: boolean;
    showGroups: boolean;
    showVolume: boolean;
    showLibrary: boolean;
}

interface SonosPlayerState extends VisRxWidgetState {
    rooms: SonosRoomInfo[];
    selectedRoom: string;
    sonos: Record<string, ioBroker.StateValue>;
    /** Volume while the slider is being dragged, so it does not jump back */
    localVolume: number | null;
}

export default class SonosPlayer extends Generic<SonosPlayerRxData, SonosPlayerState> {
    private subscribed: string[] = [];

    private volumeTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            rooms: [],
            selectedRoom: '',
            sonos: {},
            localVolume: null,
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            // Same template id, set and name as the vis-1 widget in widgets/sonos.html.
            // vis-2 loads both sets and keeps the React implementation, so the palette shows
            // this widget once, and views built with the vis-1 widget keep working.
            id: 'tplSonosControl',
            visSet: 'sonos',
            visSetLabel: 'set_label',
            visSetColor: '#e31c23',
            visName: 'Sonos Control',
            visWidgetLabel: 'player',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'instance',
                            type: 'instance',
                            adapter: 'sonos',
                            isShort: true,
                            default: '0',
                            label: 'instance',
                        },
                        { name: 'noCard', type: 'checkbox', label: 'without_card' },
                        { name: 'widgetTitle', label: 'name', hidden: '!!data.noCard' },
                        { name: 'defaultRoom', type: 'text', label: 'default_room', tooltip: 'default_room_tooltip' },
                        // Kept so that views migrated from the vis-1 widget do not lose their
                        // binding; `instance` wins as soon as it is set. See Generic.getNamespace().
                        { name: 'oid', type: 'id', label: 'legacy_oid', hidden: '!!data.instance' },
                    ],
                },
                {
                    name: 'parts',
                    label: 'parts',
                    fields: [
                        { name: 'showRooms', type: 'checkbox', default: true, label: 'show_rooms' },
                        { name: 'showGroups', type: 'checkbox', default: true, label: 'show_groups' },
                        { name: 'showVolume', type: 'checkbox', default: true, label: 'show_volume' },
                        { name: 'showLibrary', type: 'checkbox', default: true, label: 'show_library' },
                    ],
                },
            ],
            visDefaultStyle: { width: '100%', height: 520, position: 'relative' },
            visPrev: 'widgets/sonos/img/prev_sonos_player.png',
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return SonosPlayer.getWidgetInfo();
    }

    async componentDidMount(): Promise<void> {
        super.componentDidMount();
        await this.refreshRooms();
    }

    componentWillUnmount(): void {
        if (this.volumeTimer) {
            clearTimeout(this.volumeTimer);
            this.volumeTimer = null;
        }
        this.unsubscribeAll();
        super.componentWillUnmount();
    }

    async onRxDataChanged(prevRxData: SonosPlayerRxData): Promise<void> {
        if (prevRxData.instance !== this.state.rxData.instance || prevRxData.oid !== this.state.rxData.oid) {
            this.setState({ selectedRoom: '', sonos: {} });
            await this.refreshRooms();
        } else if (prevRxData.defaultRoom !== this.state.rxData.defaultRoom) {
            await this.refreshRooms();
        }
    }

    private async refreshRooms(): Promise<void> {
        let rooms: SonosRoomInfo[] = [];
        try {
            rooms = await this.loadRooms();
        } catch (e) {
            console.warn(`Cannot read SONOS rooms: ${e as string}`);
        }

        const wanted = String(this.state.rxData.defaultRoom || '').trim();
        const preferred =
            rooms.find(room => room.ip === wanted || room.name === wanted) ||
            rooms.find(room => room.ip === this.state.selectedRoom) ||
            rooms[0];

        this.setState({ rooms, selectedRoom: preferred?.ip || '' }, () => this.resubscribe());
    }

    /** Ids the widget needs: every room for the chips and the group list, plus the library of the selected room. */
    private wantedIds(): string[] {
        const ids: string[] = [];
        this.state.rooms.forEach(room => ROOM_STATES.forEach(name => ids.push(this.getRoomStateId(room.ip, name))));

        const selected = this.state.selectedRoom;
        if (selected) {
            const coordinator = this.coordinatorOf(selected);
            LIBRARY_STATES.forEach(name => {
                ids.push(this.getRoomStateId(selected, name));
                if (coordinator !== selected) {
                    ids.push(this.getRoomStateId(coordinator, name));
                }
            });
        }

        return [...new Set(ids)];
    }

    private onSonosState = (id: string, state: ioBroker.State | null | undefined): void => {
        this.setState(
            prev => ({ sonos: { ...prev.sonos, [id]: state ? state.val : null } }),
            () => {
                // The coordinator is only known once its state arrived, and the library of a group
                // slave is written to the coordinator's channel - so the subscription has to follow.
                if (id === this.getRoomStateId(this.state.selectedRoom, 'coordinator')) {
                    this.resubscribe();
                }
            },
        );
    };

    private unsubscribeAll(): void {
        if (this.subscribed.length) {
            this.props.context.socket.unsubscribeState(this.subscribed, this.onSonosState);
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
        this.props.context.socket.subscribeState(wanted, this.onSonosState).catch((e: unknown) => {
            console.warn(`Cannot subscribe on SONOS states: ${e as string}`);
        });
    }

    // ---- state access -------------------------------------------------------

    private val(ip: string, name: string): ioBroker.StateValue {
        return this.state.sonos[this.getRoomStateId(ip, name)] ?? null;
    }

    private str(ip: string, name: string): string {
        const value = this.val(ip, name);
        return value === null || value === undefined ? '' : String(value);
    }

    private num(ip: string, name: string): number {
        return Number(this.val(ip, name)) || 0;
    }

    /** The room whose playback the selected room follows */
    private coordinatorOf(ip: string): string {
        const coordinator = this.str(ip, 'coordinator').trim();
        return coordinator && coordinator !== ip ? coordinator : ip;
    }

    private set(ip: string, name: string, value: ioBroker.StateValue): void {
        this.props.context.setValue(this.getRoomStateId(ip, name), value);
    }

    /** TV/HDMI has no transport control, so the buttons must not be offered */
    private isOnTv(ip: string): boolean {
        return this.num(ip, 'current_type') === 2 && this.str(ip, 'current_title') === 'TV';
    }

    // ---- actions ------------------------------------------------------------

    private selectRoom(ip: string): void {
        this.setState({ selectedRoom: ip }, () => this.resubscribe());
    }

    private toggleGroupMember(memberIp: string, join: boolean): void {
        const selected = this.state.selectedRoom;
        const coordinator = this.coordinatorOf(selected);
        this.set(coordinator, join ? 'add_to_group' : 'remove_from_group', memberIp);
    }

    // ---- render helpers -----------------------------------------------------

    private renderRooms(): React.JSX.Element | null {
        if (!this.state.rxData.showRooms || this.state.rooms.length < 2) {
            return null;
        }

        return (
            <div style={styles.rooms}>
                {this.state.rooms.map(room => {
                    const alive = this.val(room.ip, 'alive') !== false;
                    return (
                        <Chip
                            key={room.ip}
                            size="small"
                            label={room.name}
                            color={room.ip === this.state.selectedRoom ? 'primary' : 'default'}
                            variant={room.ip === this.state.selectedRoom ? 'filled' : 'outlined'}
                            disabled={!alive}
                            onClick={() => this.selectRoom(room.ip)}
                        />
                    );
                })}
            </div>
        );
    }

    private renderTransport(ip: string): React.JSX.Element {
        const onTv = this.isOnTv(ip);
        const playing = this.val(ip, 'state_simple') === true;
        const muted = this.val(ip, 'muted') === true;
        const repeat = this.num(ip, 'repeat');

        if (onTv) {
            return (
                <div style={styles.buttons}>
                    <Tooltip title={Generic.t('mute')}>
                        <IconButton onClick={() => this.set(ip, 'muted', !muted)}>
                            {muted ? <VolumeOff /> : <VolumeUp />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={Generic.t('night_mode')}>
                        <IconButton
                            color={this.val(ip, 'night_mode') === true ? 'primary' : 'default'}
                            onClick={() => this.set(ip, 'night_mode', this.val(ip, 'night_mode') !== true)}
                        >
                            <NightsStay />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={Generic.t('speech_enhancement')}>
                        <IconButton
                            color={this.val(ip, 'speech_enhancement') === true ? 'primary' : 'default'}
                            onClick={() =>
                                this.set(ip, 'speech_enhancement', this.val(ip, 'speech_enhancement') !== true)
                            }
                        >
                            <Hearing />
                        </IconButton>
                    </Tooltip>
                </div>
            );
        }

        return (
            <div style={styles.buttons}>
                <IconButton onClick={() => this.set(ip, 'prev', true)}>
                    <SkipPreviousRounded fontSize="large" />
                </IconButton>
                <IconButton onClick={() => this.set(ip, 'state_simple', !playing)}>
                    {playing ? <PauseRounded fontSize="large" /> : <PlayArrowRounded fontSize="large" />}
                </IconButton>
                <IconButton onClick={() => this.set(ip, 'next', true)}>
                    <SkipNextRounded fontSize="large" />
                </IconButton>
                <Tooltip title={Generic.t('shuffle')}>
                    <IconButton
                        color={this.val(ip, 'shuffle') === true ? 'primary' : 'default'}
                        onClick={() => this.set(ip, 'shuffle', this.val(ip, 'shuffle') !== true)}
                    >
                        <ShuffleRounded />
                    </IconButton>
                </Tooltip>
                <Tooltip title={Generic.t('repeat')}>
                    <IconButton
                        color={repeat ? 'primary' : 'default'}
                        onClick={() => this.set(ip, 'repeat', (repeat + 1) % 3)}
                    >
                        {repeat === 2 ? <RepeatOne /> : <Repeat />}
                    </IconButton>
                </Tooltip>
                <Tooltip title={Generic.t('mute')}>
                    <IconButton onClick={() => this.set(ip, 'muted', !muted)}>
                        {muted ? <VolumeOff /> : <VolumeUp />}
                    </IconButton>
                </Tooltip>
            </div>
        );
    }

    private static timeString(seconds: number): string {
        if (!seconds || seconds < 0) {
            return '0:00';
        }
        return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
            .toString()
            .padStart(2, '0')}`;
    }

    private renderSeek(ip: string): React.JSX.Element | null {
        const duration = this.num(ip, 'current_duration');
        if (this.isOnTv(ip) || duration <= 0) {
            return null;
        }
        const elapsed = this.num(ip, 'current_elapsed');

        return (
            <div style={styles.seek}>
                <Typography variant="caption">{SonosPlayer.timeString(elapsed)}</Typography>
                <Slider
                    size="small"
                    min={0}
                    max={100}
                    value={Math.min(100, Math.max(0, (elapsed / duration) * 100))}
                    valueLabelDisplay="off"
                    onChangeCommitted={(_e, value) => this.set(ip, 'seek', Array.isArray(value) ? value[0] : value)}
                />
                <Typography variant="caption">{SonosPlayer.timeString(duration)}</Typography>
            </div>
        );
    }

    private renderVolume(ip: string): React.JSX.Element | null {
        if (!this.state.rxData.showVolume) {
            return null;
        }
        const volume = this.state.localVolume ?? this.num(ip, 'volume');

        return (
            <div style={styles.volume}>
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
                            this.set(ip, 'volume', next);
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

    private renderGroups(ip: string): React.JSX.Element | null {
        if (!this.state.rxData.showGroups || this.state.rooms.length < 2) {
            return null;
        }

        const coordinator = this.coordinatorOf(ip);
        const members = this.str(coordinator, 'membersChannels')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);

        return (
            <div style={styles.groups}>
                <Typography variant="caption">{Generic.t('group')}</Typography>
                {this.state.rooms.map(room => (
                    <FormControlLabel
                        key={room.ip}
                        control={
                            <Checkbox
                                size="small"
                                disabled={room.ip === coordinator}
                                checked={room.ip === coordinator || members.includes(room.ip)}
                                onChange={(_e, checked) => this.toggleGroupMember(room.ip, checked)}
                            />
                        }
                        label={<Typography variant="caption">{room.name}</Typography>}
                    />
                ))}
            </div>
        );
    }

    /** Favorites, playlists, queue, recently played and the browsable sources of the speaker. */
    private renderLibrary(ip: string): React.JSX.Element | null {
        if (!this.state.rxData.showLibrary) {
            return null;
        }

        return (
            <SourceBrowser
                ip={ip}
                coordinator={this.coordinatorOf(ip)}
                getValue={(room, name) => this.val(room, name)}
                setValue={(room, name, value) => this.set(room, name, value)}
            />
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
        super.renderWidgetBody(props);

        if (!this.state.rooms.length) {
            const content = (
                <div style={{ padding: 8 }}>
                    <Typography variant="body2">{Generic.t('no_players')}</Typography>
                    <LinearProgress style={{ marginTop: 8 }} />
                </div>
            );
            return this.state.rxData.noCard ? content : this.wrapContent(content);
        }

        const ip = this.state.selectedRoom;
        const cover = this.str(ip, 'current_cover');
        const title = this.str(ip, 'current_title') || Generic.t('nothing_playing');
        const station = this.str(ip, 'current_station');
        const sub = [this.str(ip, 'current_artist'), this.str(ip, 'current_album') || station]
            .filter(Boolean)
            .join(' · ');

        const content = (
            <div style={styles.root}>
                {this.renderRooms()}
                <div style={styles.main}>
                    {cover ? (
                        <div style={{ ...styles.cover, backgroundImage: `url("${encodeURI(cover)}")` }} />
                    ) : (
                        <Box sx={{ ...styles.cover, backgroundColor: 'action.selected' }}>
                            {this.isOnTv(ip) ? <Tv fontSize="large" /> : <MusicNote fontSize="large" />}
                        </Box>
                    )}
                    <div style={styles.meta}>
                        <div style={styles.title}>{title}</div>
                        <div style={styles.sub}>{sub}</div>
                        {this.renderTransport(ip)}
                        {this.renderSeek(ip)}
                        {this.renderVolume(ip)}
                    </div>
                </div>
                {this.renderGroups(ip)}
                {this.renderLibrary(ip)}
            </div>
        );

        if (this.state.rxData.noCard || props.widget.usedInWidget) {
            return <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>{content}</div>;
        }

        return this.wrapContent(content, null, { display: 'flex', flexDirection: 'column', minHeight: 0 });
    }
}
