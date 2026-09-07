// SONOS rooms widget for ioBroker.devices - every speaker of an instance in one tile.
//
// The speakers are discovered from the object tree rather than from the adapter configuration:
// every direct channel below `sonos.<instance>.root.` is one player, and its `common.name` is
// the name the user configured (falling back to the IP). That way the widget also picks up
// speakers that were added after it was placed.
//
// Grouping: `membersChannels` of the group coordinator lists the rooms that follow it, and
// writing a room name to `add_to_group` / `remove_from_group` of the coordinator joins or
// removes it. The widget exposes that as a "link" mode: pick one room as the master, then
// toggle the others in and out of its group.

import WidgetGeneric, {
    React,
    MuiMaterial,
    getTileStyles,
    isNeumorphicTheme,
    AdapterReact,
    type WidgetGenericProps,
    type WidgetGenericState,
    type CustomWidgetPlugin,
} from '@iobroker/dm-widgets';
import type {
    BoxProps,
    DialogContentProps,
    DialogProps,
    DialogTitleProps,
    SliderProps,
    Theme,
    TooltipProps,
    TypographyProps,
} from '@mui/material';
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/dm-utils';
import type { ConfigItemPanel as JsonConfigItemPanel } from '@iobroker/json-config';
import type { I18n as I18nType, Icon as IconType } from '@iobroker/gui-components';

import { coordinatorOf, loadRooms, stateId, type SonosRoom } from './utils';
import {
    CloseIcon,
    LinkIcon,
    MusicIcon,
    MutedIcon,
    PauseIcon,
    PlayIcon,
    SONOS_RED,
    SpeakerIcon,
    VolumeIcon,
} from './icons';

const Box: React.ComponentType<BoxProps> = MuiMaterial?.Box;
const Typography: React.ComponentType<TypographyProps> = MuiMaterial?.Typography;
const Slider: React.ComponentType<SliderProps> = MuiMaterial?.Slider;
const Tooltip: React.ComponentType<TooltipProps> = MuiMaterial?.Tooltip;
const Dialog: React.ComponentType<DialogProps> = MuiMaterial?.Dialog;
const DialogTitle: React.ComponentType<DialogTitleProps> = MuiMaterial?.DialogTitle;
const DialogContent: React.ComponentType<DialogContentProps> = MuiMaterial?.DialogContent;
const I18n = AdapterReact.I18n as typeof I18nType;
const Icon = AdapterReact.Icon as typeof IconType;

/** Per-room states the overview subscribes to. */
const STATES = [
    'alive',
    'coordinator',
    'current_artist',
    'current_title',
    'membersChannels',
    'muted',
    'state_simple',
    'volume',
] as const;

type StateName = (typeof STATES)[number];

interface SonosRoomsSettings extends CustomWidgetPlugin {
    /** sonos adapter instance, e.g. `sonos.0` */
    instance?: string;
    /** Do not list speakers whose `alive` state is false. */
    hideOffline?: boolean;
    /** Show a volume slider in every row. */
    showVolume?: boolean;
    /** Offer the link button that joins and removes speakers from a group. */
    allowGrouping?: boolean;
}

interface SonosRoomsComponentState extends WidgetGenericState {
    /** Speakers of the instance, sorted by name. */
    rooms: SonosRoom[];
    /** `values[room][stateName]` - the latest value of every subscribed state. */
    values: Record<string, Partial<Record<StateName, ioBroker.StateValue>>>;
    /** The full room list is shown in a dialog when the tile itself is too small for it. */
    dialogOpen: boolean;
    /**
     * Room that was picked as the group master. While it is set, the link button of every other
     * room joins it to - or removes it from - that room's group.
     */
    linkMaster: string | null;
    /** Volume of the room that is currently being dragged, so the slider does not jump back. */
    localVolume: { room: string; value: number } | null;
}

export class SonosRoomsComponent extends WidgetGeneric<SonosRoomsComponentState, SonosRoomsSettings> {
    private subscribed: { id: string; handler: (id: string, state: ioBroker.State) => void }[] = [];

    private volumeTimer: ReturnType<typeof setTimeout> | null = null;

    /** Set in `componentWillUnmount`, so the room lookup does not call `setState` afterwards. */
    private unmounted = false;

    constructor(props: WidgetGenericProps<SonosRoomsSettings>) {
        super(props);
        this.state = {
            ...this.state,
            rooms: [],
            values: {},
            dialogOpen: false,
            linkMaster: null,
            localVolume: null,
        };
    }

    static override getConfigSchema(): { name: string; schema: ConfigItemPanel | ConfigItemTabs } {
        const schema: JsonConfigItemPanel = {
            type: 'panel',
            items: {
                instance: {
                    type: 'instance',
                    adapter: 'sonos',
                    label: 'sonosdm_instance',
                    default: 'sonos.0',
                    sm: 12,
                },
                showVolume: {
                    type: 'checkbox',
                    label: 'sonosdm_showVolume',
                    default: true,
                    sm: 6,
                },
                allowGrouping: {
                    type: 'checkbox',
                    label: 'sonosdm_allowGrouping',
                    default: true,
                    sm: 6,
                },
                hideOffline: {
                    type: 'checkbox',
                    label: 'sonosdm_hideOffline',
                    default: false,
                    sm: 6,
                },
                icon: {
                    type: 'component',
                    subType: 'iconSelect',
                    label: 'sonosdm_icon',
                    sm: 6,
                },
                name: {
                    type: 'text',
                    label: 'sonosdm_name',
                    sm: 12,
                },
            },
        };

        return { name: 'SonosRooms', schema: schema as unknown as ConfigItemPanel };
    }

    private get instance(): string {
        return this.props.settings.instance || 'sonos.0';
    }

    componentDidMount(): void {
        super.componentDidMount?.();
        // React remounts a component without constructing it again (StrictMode, fast refresh),
        // so the flag has to be cleared here and not only set in componentWillUnmount.
        this.unmounted = false;
        void this.reload();
    }

    componentDidUpdate(prevProps: Readonly<WidgetGenericProps<SonosRoomsSettings>>): void {
        super.componentDidUpdate?.(prevProps, this.state);
        if (prevProps.settings.instance !== this.props.settings.instance) {
            this.unsubscribeStates();
            this.setState({ rooms: [], values: {}, linkMaster: null }, () => void this.reload());
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount?.();
        this.unmounted = true;
        this.unsubscribeStates();
        if (this.volumeTimer) {
            clearTimeout(this.volumeTimer);
            this.volumeTimer = null;
        }
    }

    private async reload(): Promise<void> {
        let rooms: SonosRoom[] = [];
        try {
            rooms = await loadRooms(this.props.stateContext.getSocket(), this.instance);
        } catch (error) {
            console.warn(`Cannot read the SONOS rooms of ${this.instance}: ${error as string}`);
        }
        if (this.unmounted) {
            return;
        }
        this.setState({ rooms }, () => this.subscribeStates());
    }

    private subscribeStates(): void {
        const context = this.props.stateContext;
        for (const { room } of this.state.rooms) {
            for (const name of STATES) {
                const id = stateId(this.instance, room, name);
                const handler = (_id: string, state: ioBroker.State): void => {
                    this.setState(prev => ({
                        values: {
                            ...prev.values,
                            [room]: { ...prev.values[room], [name]: state ? state.val : null },
                        },
                    }));
                };
                context.getState(id, handler);
                this.subscribed.push({ id, handler });
            }
        }
    }

    private unsubscribeStates(): void {
        const context = this.props.stateContext;
        for (const { id, handler } of this.subscribed) {
            context.removeState(id, handler);
        }
        this.subscribed = [];
    }

    // ---- state access -------------------------------------------------------

    private str(room: string, name: StateName): string {
        const value = this.state.values[room]?.[name];
        return value === null || value === undefined ? '' : String(value);
    }

    private set(room: string, name: string, value: ioBroker.StateValue): void {
        void this.props.stateContext.getSocket().setState(stateId(this.instance, room, name), value, false);
    }

    private isPlaying(room: string): boolean {
        return this.state.values[room]?.state_simple === true;
    }

    private isAlive(room: string): boolean {
        return this.state.values[room]?.alive !== false;
    }

    /** The rooms actually shown - all of them, or only the reachable ones. */
    private get visibleRooms(): SonosRoom[] {
        return this.props.settings.hideOffline
            ? this.state.rooms.filter(item => this.isAlive(item.room))
            : this.state.rooms;
    }

    private get playingCount(): number {
        return this.visibleRooms.filter(item => this.isPlaying(item.room)).length;
    }

    /** Rooms that follow `master`, including `master` itself. */
    private membersOf(master: string): string[] {
        const members = this.str(master, 'membersChannels')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
        return members.includes(master) ? members : [master, ...members];
    }

    // ---- actions ------------------------------------------------------------

    /**
     * The link button. The first click marks a room as the group master; every further click on
     * another room joins it to that group or removes it again. Clicking the master clears the mode.
     */
    private onLink(room: string): void {
        const master = this.state.linkMaster;
        if (!master || master === room) {
            this.setState({ linkMaster: master === room ? null : room });
            return;
        }
        const joined = this.membersOf(master).includes(room);
        this.set(master, joined ? 'remove_from_group' : 'add_to_group', room);
    }

    private onVolume(room: string, value: number): void {
        this.setState({ localVolume: { room, value } });
        if (this.volumeTimer) {
            clearTimeout(this.volumeTimer);
        }
        this.volumeTimer = setTimeout(() => {
            this.volumeTimer = null;
            this.set(room, 'volume', value);
            this.setState({ localVolume: null });
        }, 200);
    }

    // ---- WidgetGeneric override points --------------------------------------

    protected isTileActive(): boolean {
        return this.playingCount > 0;
    }

    protected renderTileIcon(): React.JSX.Element | null {
        const custom = this.props.settings?.icon;
        if (custom) {
            return (
                <Icon
                    src={custom}
                    style={{ width: 22, height: 22, flex: '0 0 auto' }}
                />
            );
        }
        return <SpeakerIcon />;
    }

    // ---- pieces -------------------------------------------------------------

    /** Small round button, used for play/pause and the link toggle. */
    private renderButton(
        key: string,
        content: React.ReactNode,
        onClick: () => void,
        opts?: { size?: number; active?: boolean; title?: string },
    ): React.JSX.Element {
        const size = opts?.size || 28;
        const button = (
            <Box
                key={key}
                component="button"
                onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onClick();
                }}
                sx={{
                    all: 'unset',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: '0 0 auto',
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    cursor: 'pointer',
                    fontSize: `${Math.round(size * 0.55)}px`,
                    lineHeight: 1,
                    color: opts?.active ? SONOS_RED : 'inherit',
                    bgcolor: 'rgba(127,127,127,0.18)',
                    transition: 'background-color 0.15s ease, transform 0.08s ease',
                    '&:hover': { bgcolor: 'rgba(127,127,127,0.32)' },
                    '&:active': { transform: 'scale(0.92)' },
                }}
            >
                {content}
            </Box>
        );

        return opts?.title ? (
            <Tooltip
                key={key}
                title={opts.title}
            >
                <span style={{ display: 'flex' }}>{button}</span>
            </Tooltip>
        ) : (
            button
        );
    }

    /** One speaker: name, what it plays, play/pause, optional volume and the group link. */
    private renderRoomRow(item: SonosRoom): React.JSX.Element {
        const { room, name } = item;
        const alive = this.isAlive(room);
        const playing = this.isPlaying(room);
        const master = this.state.linkMaster;
        const isMaster = master === room;
        const linked = !!master && master !== room && this.membersOf(master).includes(room);
        const grouped = coordinatorOf(room, this.str(room, 'coordinator')) !== room;
        const title = alive
            ? [this.str(room, 'current_title'), this.str(room, 'current_artist')].filter(Boolean).join(' · ') ||
              I18n.t('sonosdm_nothing_playing')
            : I18n.t('sonosdm_offline');
        const volume =
            this.state.localVolume?.room === room
                ? this.state.localVolume.value
                : Number(this.state.values[room]?.volume) || 0;

        return (
            <Box
                key={room}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.5,
                    opacity: alive ? 1 : 0.5,
                    borderBottom: '1px solid rgba(127,127,127,0.18)',
                    '&:last-of-type': { borderBottom: 'none' },
                }}
            >
                {item.icon ? (
                    <Icon
                        src={item.icon}
                        style={{ width: 22, height: 22, flex: '0 0 auto' }}
                    />
                ) : (
                    <MusicIcon sx={{ fontSize: '1.1rem', flex: '0 0 auto', opacity: 0.7 }} />
                )}
                <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0 }}>
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                color: item.color || undefined,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {name}
                        </Typography>
                        {grouped ? (
                            <Typography
                                variant="caption"
                                sx={{ opacity: 0.55, whiteSpace: 'nowrap', flex: '0 0 auto' }}
                            >
                                {`· ${I18n.t('sonosdm_grouped')}`}
                            </Typography>
                        ) : null}
                    </Box>
                    <Typography
                        variant="caption"
                        sx={{ opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                        {title}
                    </Typography>
                </Box>

                {this.props.settings.showVolume !== false && alive ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: 110, flex: '0 0 auto' }}>
                        {this.state.values[room]?.muted === true ? (
                            <MutedIcon sx={{ fontSize: '0.9rem', opacity: 0.75 }} />
                        ) : (
                            <VolumeIcon sx={{ fontSize: '0.9rem', opacity: 0.75 }} />
                        )}
                        <Slider
                            size="small"
                            min={0}
                            max={100}
                            value={volume}
                            valueLabelDisplay="auto"
                            sx={{ flex: 1, color: SONOS_RED }}
                            onChange={(_e: Event, value: number | number[]) =>
                                this.onVolume(room, Array.isArray(value) ? value[0] : value)
                            }
                        />
                    </Box>
                ) : null}

                {this.props.settings.allowGrouping !== false && this.visibleRooms.length > 1 ? (
                    this.renderButton(
                        `link-${room}`,
                        <LinkIcon sx={{ fontSize: 'inherit' }} />,
                        () => this.onLink(room),
                        {
                            active: isMaster || linked,
                            title: I18n.t(
                                isMaster
                                    ? 'sonosdm_link_cancel'
                                    : master
                                      ? linked
                                          ? 'sonosdm_link_remove'
                                          : 'sonosdm_link_add'
                                      : 'sonosdm_link_start',
                            ),
                        },
                    )
                ) : null}

                {this.renderButton(
                    `play-${room}`,
                    playing ? <PauseIcon sx={{ fontSize: 'inherit' }} /> : <PlayIcon sx={{ fontSize: 'inherit' }} />,
                    () => this.set(room, 'state_simple', !playing),
                    { active: playing, title: I18n.t(playing ? 'sonosdm_pause' : 'sonosdm_play') },
                )}
            </Box>
        );
    }

    /** The scrollable list of speakers, used inline on the big tiles and inside the dialog. */
    private renderRoomList(): React.JSX.Element {
        const rooms = this.visibleRooms;
        if (!rooms.length) {
            return (
                <Typography
                    variant="caption"
                    sx={{ opacity: 0.7 }}
                >
                    {I18n.t('sonosdm_no_rooms')}
                </Typography>
            );
        }

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: 0, overflow: 'auto' }}>
                {this.state.linkMaster ? (
                    <Typography
                        variant="caption"
                        sx={{ color: SONOS_RED, pb: 0.5 }}
                    >
                        {I18n.t('sonosdm_link_hint')}
                    </Typography>
                ) : null}
                {rooms.map(item => this.renderRoomRow(item))}
            </Box>
        );
    }

    /** "2 / 5" plus the names of the playing rooms - what fits on a small tile. */
    private renderSummary(): React.JSX.Element {
        const rooms = this.visibleRooms;
        const playing = rooms.filter(item => this.isPlaying(item.room));

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, gap: 0.25 }}>
                <Typography
                    ref={this.nameRef}
                    variant="caption"
                    sx={{ fontWeight: 600, opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden' }}
                >
                    {this.props.settings.name || this.state.name || I18n.t('sonosdm_rooms_title')}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                    <Typography
                        variant="h5"
                        sx={{ fontWeight: 700, lineHeight: 1, color: playing.length ? SONOS_RED : undefined }}
                    >
                        {playing.length}
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{ opacity: 0.7 }}
                    >
                        {`/ ${rooms.length}`}
                    </Typography>
                </Box>
                <Typography
                    variant="caption"
                    sx={{ opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                    {playing.length
                        ? playing.map(item => item.name).join(', ')
                        : rooms.length
                          ? I18n.t('sonosdm_all_idle')
                          : I18n.t('sonosdm_no_rooms')}
                </Typography>
            </Box>
        );
    }

    /** Full list in a dialog - opened by clicking a tile that is too small for the list. */
    private renderDialog(): React.JSX.Element | null {
        if (!this.state.dialogOpen) {
            return null;
        }

        return (
            <Dialog
                open
                maxWidth="sm"
                fullWidth
                onClose={() => this.setState({ dialogOpen: false, linkMaster: null })}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}>
                    <SpeakerIcon />
                    {this.props.settings.name || I18n.t('sonosdm_rooms_title')}
                    {this.renderButton('close', <CloseIcon sx={{ fontSize: 'inherit' }} />, () =>
                        this.setState({ dialogOpen: false, linkMaster: null }),
                    )}
                </DialogTitle>
                <DialogContent>{this.renderRoomList()}</DialogContent>
            </Dialog>
        );
    }

    private renderTile(
        outerStyle: (theme: Theme) => React.CSSProperties,
        padding: (neumorphic: boolean) => string,
        inner: React.CSSProperties,
        content: React.JSX.Element,
        onClick?: () => void,
    ): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();

        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={outerStyle}
            >
                <Box
                    onClick={onClick}
                    sx={theme => ({
                        boxSizing: 'border-box',
                        display: 'flex',
                        width: '100%',
                        overflow: 'hidden',
                        cursor: onClick ? 'pointer' : undefined,
                        ...(getTileStyles(theme, isActive, accent) as Record<string, unknown>),
                        padding: padding(isNeumorphicTheme(theme)),
                        ...inner,
                    })}
                >
                    <div
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        style={{ display: 'contents' }}
                    >
                        {this.renderIndicators(this.renderSettingsButton())}
                    </div>
                    {content}
                </Box>
                {this.renderDialog()}
            </Box>
        );
    }

    // ---- sizes --------------------------------------------------------------

    /** 1x1 - only the counters fit; the list opens in a dialog. */
    renderCompact(): React.JSX.Element {
        const content = (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    width: '100%',
                    aspectRatio: '1',
                    minWidth: 0,
                }}
            >
                <SpeakerIcon sx={{ fontSize: 'max(24px, 14cqi)' }} />
                {this.renderSummary()}
            </Box>
        );

        return this.renderTile(
            theme => WidgetGeneric.getStyleCompact(theme),
            neumorphic => (neumorphic ? '10px' : '12px'),
            { flexDirection: 'column' },
            content,
            () => this.setState({ dialogOpen: true }),
        );
    }

    /** 2x0.5 - the summary as a strip, the list still opens in the dialog. */
    renderWide(): React.JSX.Element {
        const content = (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', minWidth: 0 }}>
                <SpeakerIcon sx={{ fontSize: '1.4rem', flex: '0 0 auto' }} />
                {this.renderSummary()}
            </Box>
        );

        return this.renderTile(
            theme => WidgetGeneric.getStyleWide(theme),
            neumorphic => (neumorphic ? '6px' : '8px'),
            { alignItems: 'center' },
            content,
            () => this.setState({ dialogOpen: true }),
        );
    }

    /** 2x1 and 2x2 - room for the whole list, so no dialog is needed. */
    renderWideTall(): React.JSX.Element {
        const content = (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                    width: '100%',
                    height: '100%',
                    minHeight: 0,
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <SpeakerIcon sx={{ fontSize: '1.2rem', flex: '0 0 auto' }} />
                    <Typography
                        ref={this.nameRef}
                        variant="caption"
                        sx={{ fontWeight: 600, opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden' }}
                    >
                        {this.props.settings.name || this.state.name || I18n.t('sonosdm_rooms_title')}
                    </Typography>
                    <Typography
                        variant="caption"
                        sx={{ opacity: 0.6, ml: 'auto', flex: '0 0 auto' }}
                    >
                        {`${this.playingCount} / ${this.visibleRooms.length}`}
                    </Typography>
                </Box>
                {this.renderRoomList()}
            </Box>
        );

        return this.renderTile(
            theme => WidgetGeneric.getStyleWideTall(theme),
            neumorphic => (neumorphic ? '8px' : '10px'),
            { flexDirection: 'column', height: '100%' },
            content,
        );
    }
}

export default SonosRoomsComponent;
