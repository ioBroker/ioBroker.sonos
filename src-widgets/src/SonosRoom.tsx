import React from 'react';

import { Box, Dialog, DialogContent, DialogTitle, IconButton, Slider, Tooltip, Typography } from '@mui/material';
import {
    Close,
    LibraryMusic,
    MusicNote,
    PauseRounded,
    PlayArrowRounded,
    SkipNextRounded,
    SkipPreviousRounded,
    Tv,
    VolumeOff,
    VolumeUp,
} from '@mui/icons-material';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic from './Generic';
import SourceBrowser, { LIBRARY_STATES } from './SourceBrowser';
import type { SonosRoomInfo } from './types';

/** Only what a single compact card shows. `coordinator` points at the room the library lives on. */
const ROOM_STATES = [
    'alive',
    'coordinator',
    'current_album',
    'current_artist',
    'current_cover',
    'current_station',
    'current_title',
    'current_type',
    'muted',
    'state_simple',
    'volume',
] as const;

const styles: Record<string, React.CSSProperties> = {
    root: { display: 'flex', gap: 10, width: '100%', height: '100%', alignItems: 'center' },
    cover: {
        width: 64,
        height: 64,
        flex: '0 0 auto',
        borderRadius: 6,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    meta: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 2 },
    title: { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    sub: { opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    buttons: { display: 'flex', alignItems: 'center' },
    volume: { display: 'flex', alignItems: 'center', gap: 6 },
};

interface SonosRoomRxData {
    noCard: boolean;
    widgetTitle: string;
    instance: string;
    room: string;
    showVolume: boolean;
    showSource: boolean;
}

interface SonosRoomState extends VisRxWidgetState {
    rooms: SonosRoomInfo[];
    sonos: Record<string, ioBroker.StateValue>;
    localVolume: number | null;
    /** The source selection is a dialog here - the card itself has no room for it. */
    sourceOpen: boolean;
}

/**
 * One SONOS device as a compact card - cover, title, transport and volume.
 * For rooms, groups and the library use the `Sonos player` widget.
 */
export default class SonosRoom extends Generic<SonosRoomRxData, SonosRoomState> {
    private subscribed: string[] = [];

    private volumeTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, rooms: [], sonos: {}, localVolume: null, sourceOpen: false };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplSonosRoom',
            visSet: 'sonos',
            visName: 'Sonos room',
            visWidgetLabel: 'room',
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
                        { name: 'room', type: 'text', label: 'room', tooltip: 'room_tooltip' },
                        { name: 'noCard', type: 'checkbox', label: 'without_card' },
                        { name: 'widgetTitle', label: 'name', hidden: '!!data.noCard' },
                        { name: 'showVolume', type: 'checkbox', default: true, label: 'show_volume' },
                        { name: 'showSource', type: 'checkbox', default: true, label: 'show_source' },
                    ],
                },
            ],
            visDefaultStyle: { width: '100%', height: 120, position: 'relative' },
            visPrev: 'widgets/sonos/img/prev_sonos_room.png',
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return SonosRoom.getWidgetInfo();
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

    async onRxDataChanged(prevRxData: SonosRoomRxData): Promise<void> {
        if (prevRxData.instance !== this.state.rxData.instance) {
            this.setState({ sonos: {} });
            await this.refreshRooms();
        } else if (prevRxData.room !== this.state.rxData.room) {
            this.resubscribe();
        }
    }

    private async refreshRooms(): Promise<void> {
        let rooms: SonosRoomInfo[] = [];
        try {
            rooms = await this.loadRooms();
        } catch (e) {
            console.warn(`Cannot read SONOS rooms: ${e as string}`);
        }
        this.setState({ rooms }, () => this.resubscribe());
    }

    /** The configured room, matched by channel name or by device name; falls back to the first one. */
    private currentRoom(): SonosRoomInfo | undefined {
        const wanted = String(this.state.rxData.room || '').trim();
        if (!wanted) {
            return this.state.rooms[0];
        }
        return (
            this.state.rooms.find(room => room.ip === wanted || room.name === wanted) ||
            // tolerate a room typed with dots instead of underscores
            this.state.rooms.find(room => room.ip === wanted.replace(/\./g, '_'))
        );
    }

    /** The room whose playback this one follows - its library is the one the source dialog shows. */
    private coordinatorOf(ip: string): string {
        const coordinator = this.str(ip, 'coordinator').trim();
        return coordinator && coordinator !== ip ? coordinator : ip;
    }

    private onSonosState = (id: string, state: ioBroker.State | null | undefined): void => {
        this.setState(
            prev => ({ sonos: { ...prev.sonos, [id]: state ? state.val : null } }),
            () => {
                // The library of a group member is written to the coordinator's channel, and the
                // coordinator is only known once its state arrived - so the subscription follows it.
                const room = this.currentRoom();
                if (room && id === this.getRoomStateId(room.ip, 'coordinator')) {
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

    /** The card itself only needs `ROOM_STATES`; the library is added while the dialog is open. */
    private wantedIds(): string[] {
        const room = this.currentRoom();
        if (!room) {
            return [];
        }

        const ids = ROOM_STATES.map(name => this.getRoomStateId(room.ip, name));
        if (this.state.sourceOpen) {
            const coordinator = this.coordinatorOf(room.ip);
            LIBRARY_STATES.forEach(name => {
                ids.push(this.getRoomStateId(room.ip, name));
                if (coordinator !== room.ip) {
                    ids.push(this.getRoomStateId(coordinator, name));
                }
            });
        }

        return [...new Set(ids)];
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

    private val(ip: string, name: string): ioBroker.StateValue {
        return this.state.sonos[this.getRoomStateId(ip, name)] ?? null;
    }

    private str(ip: string, name: string): string {
        const value = this.val(ip, name);
        return value === null || value === undefined ? '' : String(value);
    }

    private set(ip: string, name: string, value: ioBroker.StateValue): void {
        this.props.context.setValue(this.getRoomStateId(ip, name), value);
    }

    /** Favorites, playlists, queue and the browsable sources of the speaker. */
    private renderSourceDialog(ip: string): React.JSX.Element | null {
        if (!this.state.sourceOpen) {
            return null;
        }

        return (
            <Dialog
                open
                maxWidth="sm"
                fullWidth
                onClose={() => this.setState({ sourceOpen: false }, () => this.resubscribe())}
            >
                <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <LibraryMusic />
                    <span style={{ flex: 1 }}>{Generic.t('sources')}</span>
                    <IconButton
                        size="small"
                        onClick={() => this.setState({ sourceOpen: false }, () => this.resubscribe())}
                    >
                        <Close />
                    </IconButton>
                </DialogTitle>
                <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 320 }}>
                    <SourceBrowser
                        ip={ip}
                        coordinator={this.coordinatorOf(ip)}
                        defaultTab="favorites"
                        getValue={(room, name) => this.val(room, name)}
                        setValue={(room, name, value) => this.set(room, name, value)}
                    />
                </DialogContent>
            </Dialog>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
        super.renderWidgetBody(props);

        const room = this.currentRoom();
        if (!room) {
            const missing = (
                <Typography
                    variant="body2"
                    style={{ padding: 8 }}
                >
                    {this.state.rooms.length ? Generic.t('unknown_room') : Generic.t('no_players')}
                </Typography>
            );
            return this.state.rxData.noCard ? missing : this.wrapContent(missing);
        }

        const ip = room.ip;
        const onTv = Number(this.val(ip, 'current_type')) === 2 && this.str(ip, 'current_title') === 'TV';
        const playing = this.val(ip, 'state_simple') === true;
        const muted = this.val(ip, 'muted') === true;
        const cover = this.str(ip, 'current_cover');
        const volume = this.state.localVolume ?? (Number(this.val(ip, 'volume')) || 0);
        const sub = [this.str(ip, 'current_artist'), this.str(ip, 'current_album') || this.str(ip, 'current_station')]
            .filter(Boolean)
            .join(' · ');

        const content = (
            <div style={styles.root}>
                {cover ? (
                    <div style={{ ...styles.cover, backgroundImage: `url("${encodeURI(cover)}")` }} />
                ) : (
                    <Box sx={{ ...styles.cover, backgroundColor: 'action.selected' }}>
                        {onTv ? <Tv /> : <MusicNote />}
                    </Box>
                )}
                <div style={styles.meta}>
                    <div style={styles.title}>{this.str(ip, 'current_title') || Generic.t('nothing_playing')}</div>
                    <Typography
                        variant="caption"
                        style={styles.sub}
                        component="div"
                    >
                        {sub}
                    </Typography>
                    <div style={styles.buttons}>
                        {onTv ? null : (
                            <IconButton
                                size="small"
                                onClick={() => this.set(ip, 'prev', true)}
                            >
                                <SkipPreviousRounded />
                            </IconButton>
                        )}
                        {onTv ? null : (
                            <IconButton
                                size="small"
                                onClick={() => this.set(ip, 'state_simple', !playing)}
                            >
                                {playing ? <PauseRounded /> : <PlayArrowRounded />}
                            </IconButton>
                        )}
                        {onTv ? null : (
                            <IconButton
                                size="small"
                                onClick={() => this.set(ip, 'next', true)}
                            >
                                <SkipNextRounded />
                            </IconButton>
                        )}
                        <IconButton
                            size="small"
                            onClick={() => this.set(ip, 'muted', !muted)}
                        >
                            {muted ? <VolumeOff /> : <VolumeUp />}
                        </IconButton>
                        {this.state.rxData.showSource ? (
                            <Tooltip title={Generic.t('sources')}>
                                <IconButton
                                    size="small"
                                    onClick={() => this.setState({ sourceOpen: true }, () => this.resubscribe())}
                                >
                                    <LibraryMusic />
                                </IconButton>
                            </Tooltip>
                        ) : null}
                    </div>
                    {this.state.rxData.showVolume ? (
                        <div style={styles.volume}>
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
                                style={{ minWidth: 26, textAlign: 'right' }}
                            >
                                {volume}
                            </Typography>
                        </div>
                    ) : null}
                </div>
                {this.renderSourceDialog(ip)}
            </div>
        );

        if (this.state.rxData.noCard || props.widget.usedInWidget) {
            return <div style={{ width: '100%', height: '100%' }}>{content}</div>;
        }

        return this.wrapContent(content);
    }
}
