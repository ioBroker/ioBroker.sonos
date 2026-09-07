// SONOS player widget for ioBroker.devices - one speaker per tile.
//
// Data source: the sonos adapter mirrors the playback information of a group onto every member,
// so title / artist / cover / transport are read from the selected room itself. Only the group
// membership (`coordinator`, `membersChannels`) points at another room.
//
//     sonos.<instance>.root.<room>.state_simple      boolean  play (true) / pause (false)
//     sonos.<instance>.root.<room>.prev|next         boolean  write-only buttons
//     sonos.<instance>.root.<room>.volume            number   0..100
//     sonos.<instance>.root.<room>.muted             boolean
//     sonos.<instance>.root.<room>.seek              number   0..100 (percent)
//     sonos.<instance>.root.<room>.current_*         playback information
//     sonos.<instance>.root.<room>.alive             boolean  speaker reachable
//
// `<room>` is the IP address with underscores; the settings dialog fills that picker from the
// adapter's `sonos:getRooms` message handler.

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
import type { BoxProps, SliderProps, Theme, TooltipProps, TypographyProps } from '@mui/material';
// `WidgetGeneric.getConfigSchema()` declares its return through dm-utils' copy of these types, so
// the override signature has to use the same source, while the schema literal is authored against
// the richer json-config types - hence the second import plus one cast at the return.
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/dm-utils';
import type { ConfigItemPanel as JsonConfigItemPanel } from '@iobroker/json-config';
import type { I18n as I18nType, Icon as IconType } from '@iobroker/gui-components';

import { coordinatorOf, stateId, timeString, translated } from './utils';
import {
    MusicIcon,
    MutedIcon,
    NextIcon,
    PauseIcon,
    PlayIcon,
    PrevIcon,
    RepeatIcon,
    RepeatOneIcon,
    ShuffleIcon,
    SONOS_RED,
    TvIcon,
    VolumeIcon,
} from './icons';

// Pull the components from the host-shared bridge instead of importing `@mui/material` directly,
// so the widget uses the host's React and MUI instances rather than a second copy of its own.
const Box: React.ComponentType<BoxProps> = MuiMaterial?.Box;
const Typography: React.ComponentType<TypographyProps> = MuiMaterial?.Typography;
const Slider: React.ComponentType<SliderProps> = MuiMaterial?.Slider;
const Tooltip: React.ComponentType<TooltipProps> = MuiMaterial?.Tooltip;
const I18n = AdapterReact.I18n as typeof I18nType;
const Icon = AdapterReact.Icon as typeof IconType;

/** Every state the widget subscribes to, relative to the room channel. */
const STATES = [
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
    'repeat',
    'shuffle',
    'state_simple',
    'volume',
] as const;

type StateName = (typeof STATES)[number];

interface SonosPlayerSettings extends CustomWidgetPlugin {
    /** sonos adapter instance, e.g. `sonos.0` */
    instance?: string;
    /** Channel name of the speaker - the IP with underscores, e.g. `192_168_1_50` */
    room?: string;
    /** Show the album cover. */
    showCover?: boolean;
    /** Show the volume slider. */
    showVolume?: boolean;
    /** Show the progress bar with elapsed / total time. */
    showSeek?: boolean;
    /** Show shuffle and repeat next to the transport buttons. */
    showModes?: boolean;
}

interface SonosPlayerComponentState extends WidgetGenericState {
    /** Latest value of every subscribed state, keyed by the state name. */
    values: Partial<Record<StateName, ioBroker.StateValue>>;
    /** Volume while the slider is being dragged, so it does not jump back to the old value. */
    localVolume: number | null;
    /** `common.name` of the room channel - the name the user gave the speaker in the adapter. */
    roomName: string;
}

export class SonosPlayerComponent extends WidgetGeneric<SonosPlayerComponentState, SonosPlayerSettings> {
    private subscribed: { id: string; handler: (id: string, state: ioBroker.State) => void }[] = [];

    /** Debounces the writes while the volume slider is dragged. */
    private volumeTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: WidgetGenericProps<SonosPlayerSettings>) {
        super(props);
        this.state = {
            ...this.state,
            values: {},
            localVolume: null,
            roomName: '',
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
                room: {
                    // Asks the selected instance for its speaker list, see `sonos:getRooms`
                    // in src/main.ts of the adapter.
                    type: 'selectSendTo',
                    label: 'sonosdm_room',
                    command: 'sonos:getRooms',
                    // Re-query the list when the user picks another instance
                    alsoDependsOn: ['instance'],
                    instance: '${data.instance}',
                    sm: 12,
                },
                showCover: {
                    type: 'checkbox',
                    label: 'sonosdm_showCover',
                    default: true,
                    sm: 6,
                },
                showVolume: {
                    type: 'checkbox',
                    label: 'sonosdm_showVolume',
                    default: true,
                    sm: 6,
                },
                showSeek: {
                    type: 'checkbox',
                    label: 'sonosdm_showSeek',
                    default: true,
                    sm: 6,
                },
                showModes: {
                    type: 'checkbox',
                    label: 'sonosdm_showModes',
                    default: true,
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
                    sm: 6,
                },
            },
        };

        return { name: 'SonosPlayer', schema: schema as unknown as ConfigItemPanel };
    }

    private get instance(): string {
        return this.props.settings.instance || 'sonos.0';
    }

    private get room(): string {
        return this.props.settings.room || '';
    }

    componentDidMount(): void {
        super.componentDidMount?.();
        this.subscribeStates();
        void this.readRoomName();
    }

    componentDidUpdate(prevProps: Readonly<WidgetGenericProps<SonosPlayerSettings>>): void {
        super.componentDidUpdate?.(prevProps, this.state);
        if (prevProps.settings.instance !== this.props.settings.instance || prevProps.settings.room !== this.room) {
            this.unsubscribeStates();
            this.setState({ values: {}, localVolume: null, roomName: '' }, () => {
                this.subscribeStates();
                void this.readRoomName();
            });
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount?.();
        this.unsubscribeStates();
        if (this.volumeTimer) {
            clearTimeout(this.volumeTimer);
            this.volumeTimer = null;
        }
    }

    /**
     * The speaker name the user configured in the adapter. It is the `common.name` of the room
     * channel, so the tile shows "Kitchen" instead of the channel id `192_168_1_50`.
     */
    private async readRoomName(): Promise<void> {
        if (!this.room) {
            return;
        }
        const id = `${this.instance}.root.${this.room}`;
        try {
            const object = await this.props.stateContext.getObject<ioBroker.ChannelObject>(id);
            const name = translated(object?.common?.name, this.props.stateContext.language);
            if (name && name !== this.state.roomName) {
                this.setState({ roomName: name });
            }
        } catch (error) {
            console.warn(`Cannot read the name of ${id}: ${error as string}`);
        }
    }

    private subscribeStates(): void {
        if (!this.room) {
            return;
        }
        const context = this.props.stateContext;
        for (const name of STATES) {
            const id = stateId(this.instance, this.room, name);
            const handler = (_id: string, state: ioBroker.State): void => {
                this.setState(prev => ({ values: { ...prev.values, [name]: state ? state.val : null } }));
            };
            context.getState(id, handler);
            this.subscribed.push({ id, handler });
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

    private str(name: StateName): string {
        const value = this.state.values[name];
        return value === null || value === undefined ? '' : String(value);
    }

    private num(name: StateName): number {
        return Number(this.state.values[name]) || 0;
    }

    /** Write to a state of this room. */
    private set(name: string, value: ioBroker.StateValue): void {
        void this.props.stateContext.getSocket().setState(stateId(this.instance, this.room, name), value, false);
    }

    /** The HDMI/TV input has no transport control, so those buttons must not be offered. */
    private isOnTv(): boolean {
        return this.num('current_type') === 2 && this.str('current_title') === 'TV';
    }

    private get playing(): boolean {
        return this.state.values.state_simple === true;
    }

    private get volume(): number {
        return this.state.localVolume ?? this.num('volume');
    }

    private get displayName(): string {
        return (
            this.props.settings.name ||
            this.state.name ||
            this.state.roomName ||
            this.room ||
            I18n.t('sonosdm_no_room')
        );
    }

    // ---- WidgetGeneric override points --------------------------------------

    protected isTileActive(): boolean {
        return this.playing;
    }

    protected getHistoryIds(): { id: string; color: string }[] {
        return this.room ? [{ id: stateId(this.instance, this.room, 'volume'), color: SONOS_RED }] : [];
    }

    protected renderTileIcon(): React.JSX.Element | null {
        const custom = this.playing
            ? this.props.settings?.iconActive || this.props.settings?.icon
            : this.props.settings?.icon;
        if (custom) {
            return (
                <Icon
                    src={custom}
                    style={{ width: 22, height: 22, flex: '0 0 auto' }}
                />
            );
        }
        return this.isOnTv() ? <TvIcon /> : <MusicIcon />;
    }

    // ---- pieces -------------------------------------------------------------

    /** Album art, or a placeholder with the source icon when there is none. */
    private renderCover(size: number): React.JSX.Element | null {
        if (this.props.settings.showCover === false) {
            return null;
        }
        const cover = this.str('current_cover');
        if (cover) {
            return (
                <Box
                    sx={{
                        width: size,
                        height: size,
                        flex: '0 0 auto',
                        borderRadius: '8px',
                        backgroundImage: `url("${encodeURI(cover)}")`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                    }}
                />
            );
        }
        return (
            <Box
                sx={{
                    width: size,
                    height: size,
                    flex: '0 0 auto',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: `${Math.round(size * 0.45)}px`,
                    bgcolor: 'rgba(127,127,127,0.18)',
                }}
            >
                {this.isOnTv() ? <TvIcon sx={{ fontSize: 'inherit' }} /> : <MusicIcon sx={{ fontSize: 'inherit' }} />}
            </Box>
        );
    }

    /** One round transport button. Rendered as a styled Box so no MUI button has to be bridged. */
    private renderButton(
        key: string,
        content: React.ReactNode,
        onClick: () => void,
        opts?: { size?: number; active?: boolean; title?: string },
    ): React.JSX.Element {
        const size = opts?.size || 30;
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

    /** prev / play-pause / next, plus mute and - optionally - shuffle and repeat. */
    private renderTransport(size: number): React.JSX.Element {
        const muted = this.state.values.muted === true;
        const repeat = this.num('repeat');
        const onTv = this.isOnTv();
        const showModes = this.props.settings.showModes !== false && !onTv;

        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                {onTv
                    ? null
                    : this.renderButton(
                          'prev',
                          <PrevIcon sx={{ fontSize: 'inherit' }} />,
                          () => this.set('prev', true),
                          { size, title: I18n.t('sonosdm_previous') },
                      )}
                {onTv
                    ? null
                    : this.renderButton(
                          'play',
                          this.playing ? (
                              <PauseIcon sx={{ fontSize: 'inherit' }} />
                          ) : (
                              <PlayIcon sx={{ fontSize: 'inherit' }} />
                          ),
                          () => this.set('state_simple', !this.playing),
                          { size: size + 6, title: I18n.t(this.playing ? 'sonosdm_pause' : 'sonosdm_play') },
                      )}
                {onTv
                    ? null
                    : this.renderButton(
                          'next',
                          <NextIcon sx={{ fontSize: 'inherit' }} />,
                          () => this.set('next', true),
                          { size, title: I18n.t('sonosdm_next') },
                      )}
                {this.renderButton(
                    'mute',
                    muted ? <MutedIcon sx={{ fontSize: 'inherit' }} /> : <VolumeIcon sx={{ fontSize: 'inherit' }} />,
                    () => this.set('muted', !muted),
                    { size, active: muted, title: I18n.t('sonosdm_mute') },
                )}
                {showModes
                    ? this.renderButton(
                          'shuffle',
                          <ShuffleIcon sx={{ fontSize: 'inherit' }} />,
                          () => this.set('shuffle', this.state.values.shuffle !== true),
                          { size, active: this.state.values.shuffle === true, title: I18n.t('sonosdm_shuffle') },
                      )
                    : null}
                {showModes
                    ? this.renderButton(
                          'repeat',
                          repeat === 2 ? (
                              <RepeatOneIcon sx={{ fontSize: 'inherit' }} />
                          ) : (
                              <RepeatIcon sx={{ fontSize: 'inherit' }} />
                          ),
                          () => this.set('repeat', (repeat + 1) % 3),
                          { size, active: !!repeat, title: I18n.t('sonosdm_repeat') },
                      )
                    : null}
            </Box>
        );
    }

    /** Progress bar with elapsed / total time. Radio and TV have no duration, so it is hidden. */
    private renderSeek(): React.JSX.Element | null {
        const duration = this.num('current_duration');
        if (this.props.settings.showSeek === false || this.isOnTv() || duration <= 0) {
            return null;
        }
        const elapsed = this.num('current_elapsed');

        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <Typography
                    variant="caption"
                    sx={{ opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}
                >
                    {timeString(elapsed)}
                </Typography>
                <Slider
                    size="small"
                    min={0}
                    max={100}
                    value={Math.min(100, Math.max(0, (elapsed / duration) * 100))}
                    valueLabelDisplay="off"
                    sx={{ flex: 1, color: SONOS_RED }}
                    onChangeCommitted={(_e: Event | React.SyntheticEvent, value: number | number[]) =>
                        this.set('seek', Array.isArray(value) ? value[0] : value)
                    }
                />
                <Typography
                    variant="caption"
                    sx={{ opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}
                >
                    {timeString(duration)}
                </Typography>
            </Box>
        );
    }

    /**
     * Volume slider. The value is written 200 ms after the last move, so dragging does not send
     * dozens of commands to the speaker.
     */
    private renderVolume(): React.JSX.Element | null {
        if (this.props.settings.showVolume === false) {
            return null;
        }

        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <VolumeIcon sx={{ fontSize: '1rem', opacity: 0.75 }} />
                <Slider
                    size="small"
                    min={0}
                    max={100}
                    value={this.volume}
                    valueLabelDisplay="auto"
                    sx={{ flex: 1, color: SONOS_RED }}
                    onChange={(_e: Event, value: number | number[]) => {
                        const next = Array.isArray(value) ? value[0] : value;
                        this.setState({ localVolume: next });
                        if (this.volumeTimer) {
                            clearTimeout(this.volumeTimer);
                        }
                        this.volumeTimer = setTimeout(() => {
                            this.volumeTimer = null;
                            this.set('volume', next);
                            this.setState({ localVolume: null });
                        }, 200);
                    }}
                />
                <Typography
                    variant="caption"
                    sx={{ minWidth: 26, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                >
                    {this.volume}
                </Typography>
            </Box>
        );
    }

    /** Room name, what is playing and - if the speaker is in a group - a hint about it. */
    private renderNowPlaying(compact: boolean): React.JSX.Element {
        const title = this.str('current_title') || I18n.t('sonosdm_nothing_playing');
        const station = this.str('current_station');
        const sub = [this.str('current_artist'), this.str('current_album') || station].filter(Boolean).join(' · ');
        const members = this.str('membersChannels')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
        const grouped = coordinatorOf(this.room, this.str('coordinator')) !== this.room || members.length > 1;

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0 }}>
                    <Typography
                        ref={this.nameRef}
                        variant="caption"
                        sx={{
                            fontWeight: 600,
                            opacity: 0.75,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {this.displayName}
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
                    variant={compact ? 'body2' : 'body1'}
                    sx={{
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        lineHeight: 1.3,
                    }}
                >
                    {title}
                </Typography>
                {sub ? (
                    <Typography
                        variant="caption"
                        sx={{ opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                        {sub}
                    </Typography>
                ) : null}
            </Box>
        );
    }

    /** Shown instead of the player while no room is configured or the speaker is unreachable. */
    private renderHint(): React.JSX.Element | null {
        const text = !this.room
            ? I18n.t('sonosdm_no_room')
            : this.state.values.alive === false
              ? I18n.t('sonosdm_offline')
              : null;

        if (!text) {
            return null;
        }

        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <Typography
                    ref={this.nameRef}
                    variant="caption"
                    sx={{ fontWeight: 600, opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden' }}
                >
                    {this.displayName}
                </Typography>
                <Typography
                    variant="caption"
                    sx={{ opacity: 0.7 }}
                >
                    {text}
                </Typography>
            </Box>
        );
    }

    /** The outer tile - the same frame the host draws around its own widgets. */
    private renderTile(
        outerStyle: (theme: Theme) => React.CSSProperties,
        padding: (neumorphic: boolean) => string,
        inner: React.CSSProperties,
        content: React.JSX.Element,
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
                    sx={theme => ({
                        boxSizing: 'border-box',
                        display: 'flex',
                        width: '100%',
                        overflow: 'hidden',
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
                    <div
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        style={{ display: 'contents' }}
                    >
                        {content}
                    </div>
                </Box>
            </Box>
        );
    }

    // ---- sizes --------------------------------------------------------------

    /** 1x1 - cover as the background, name and title over it, play/pause in the corner. */
    renderCompact(): React.JSX.Element {
        const hint = this.renderHint();
        const cover = this.props.settings.showCover === false ? '' : this.str('current_cover');

        const content = (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    width: '100%',
                    aspectRatio: '1',
                    position: 'relative',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    backgroundImage: cover ? `url("${encodeURI(cover)}")` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                }}
            >
                {cover ? (
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            background: 'linear-gradient(to top, rgba(0,0,0,0.78) 25%, rgba(0,0,0,0.10) 70%)',
                        }}
                    />
                ) : null}
                <Box
                    sx={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: 0.5,
                        width: '100%',
                        minWidth: 0,
                        color: cover ? '#fff' : 'inherit',
                    }}
                >
                    {hint || this.renderNowPlaying(true)}
                    {hint
                        ? null
                        : this.renderButton(
                              'play',
                              this.playing ? (
                                  <PauseIcon sx={{ fontSize: 'inherit' }} />
                              ) : (
                                  <PlayIcon sx={{ fontSize: 'inherit' }} />
                              ),
                              () => this.set('state_simple', !this.playing),
                              { size: 34, title: I18n.t(this.playing ? 'sonosdm_pause' : 'sonosdm_play') },
                          )}
                </Box>
            </Box>
        );

        return this.renderTile(
            theme => WidgetGeneric.getStyleCompact(theme),
            neumorphic => (neumorphic ? '6px' : '8px'),
            { flexDirection: 'column' },
            content,
        );
    }

    /** 2x0.5 - a single strip: cover thumbnail, what is playing, transport buttons. */
    renderWide(): React.JSX.Element {
        const hint = this.renderHint();

        const content = (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', minWidth: 0 }}>
                {hint ? null : this.renderCover(40)}
                {hint || this.renderNowPlaying(true)}
                {hint ? null : this.renderTransport(28)}
            </Box>
        );

        return this.renderTile(
            theme => WidgetGeneric.getStyleWide(theme),
            neumorphic => (neumorphic ? '6px' : '8px'),
            { alignItems: 'center' },
            content,
        );
    }

    /** 2x1 and 2x2 - the full player with progress and volume. */
    renderWideTall(): React.JSX.Element {
        const hint = this.renderHint();

        const content = (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.75,
                    width: '100%',
                    height: '100%',
                    minHeight: 0,
                    overflow: 'auto',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                    {hint ? null : this.renderCover(64)}
                    {hint || this.renderNowPlaying(false)}
                </Box>
                {hint ? null : this.renderTransport(32)}
                {hint ? null : this.renderSeek()}
                {hint ? null : this.renderVolume()}
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

export default SonosPlayerComponent;
