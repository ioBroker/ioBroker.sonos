// SONOS player widget for ioBroker.devices - one speaker per tile.
//
// Built like the media player of ioBroker.devices: the tile shows cover, title, artist and the
// progress, and a click on it opens the full player as a dialog - transport, shuffle, repeat,
// seek, volume and the source selection.
//
// Data source: the sonos adapter mirrors the playback information of a group onto every member,
// so title / artist / cover / transport are read from the selected room itself. Only the group
// membership (`coordinator`, `membersChannels`) points at another room.
//
//     sonos.<instance>.root.<room>.state_simple      boolean  play (true) / pause (false)
//     sonos.<instance>.root.<room>.prev|next         boolean  write-only buttons
//     sonos.<instance>.root.<room>.volume            number   0..100
//     sonos.<instance>.root.<room>.muted             boolean
//     sonos.<instance>.root.<room>.shuffle           boolean
//     sonos.<instance>.root.<room>.repeat            number   0 = off, 1 = all, 2 = one track
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
import type { BoxProps, DialogProps, SliderProps, Theme, TooltipProps, TypographyProps } from '@mui/material';
// `WidgetGeneric.getConfigSchema()` declares its return through dm-utils' copy of these types, so
// the override signature has to use the same source, while the schema literal is authored against
// the richer json-config types - hence the second import plus one cast at the return.
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/dm-utils';
import type { ConfigItemPanel as JsonConfigItemPanel } from '@iobroker/json-config';
import type { I18n as I18nType, Icon as IconType } from '@iobroker/gui-components';

import { coordinatorOf, stateId, timeString, translated } from './utils';
import SourceDialog from './SourceDialog';
import {
    CollapseIcon,
    LibraryIcon,
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
const Dialog: React.ComponentType<DialogProps> = MuiMaterial?.Dialog;
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

/** Tooltip of the repeat button per value of the `repeat` state. */
const REPEAT_TITLES = ['sonosdm_repeat', 'sonosdm_repeat_all', 'sonosdm_repeat_one'];

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
    /** Offer the button that opens the source selection. */
    showSource?: boolean;
}

interface SonosPlayerComponentState extends WidgetGenericState {
    /** Latest value of every subscribed state, keyed by the state name. */
    values: Partial<Record<StateName, ioBroker.StateValue>>;
    /** Volume while the slider is being dragged, so it does not jump back to the old value. */
    localVolume: number | null;
    /** Position in percent while the progress slider is dragged or the jump is not confirmed yet. */
    localSeek: number | null;
    /** `common.name` of the room channel - the name the user gave the speaker in the adapter. */
    roomName: string;
    /** The full player is a dialog on top of the tile, like the media player of ioBroker.devices. */
    playerOpen: boolean;
    /** The source selection is a second dialog - the player is far too small for the lists. */
    sourceOpen: boolean;
    /** `ts` of `current_cover`: the file name is the same for every track, this tells the covers apart. */
    coverTs: number;
    /** Cover URL that did not load (404, for example) - the placeholder is drawn instead. */
    brokenCover: string;
}

interface ButtonOptions {
    size?: number;
    /** Drawn in the accent colour with a dot below - shuffle and repeat while they are on. */
    active?: boolean;
    title?: string;
    /** `primary` is the big filled play/pause button, everything else is a flat round button. */
    variant?: 'plain' | 'primary';
}

/** A slider hands over an array for range sliders - all sliders here have a single value. */
function sliderValue(value: number | number[]): number {
    return Array.isArray(value) ? value[0] : value;
}

/** CSS `background-image` value of a cover URL. */
function coverImage(url: string): string {
    return `url("${encodeURI(url)}")`;
}

export class SonosPlayerComponent extends WidgetGeneric<SonosPlayerComponentState, SonosPlayerSettings> {
    private subscribed: { id: string; handler: (id: string, state: ioBroker.State) => void }[] = [];

    /** Debounces the writes while the volume slider is dragged. */
    private volumeTimer: ReturnType<typeof setTimeout> | null = null;

    /** Keeps the new position after a jump until the adapter reports it. */
    private seekTimer: ReturnType<typeof setTimeout> | null = null;

    /** Loads the cover a second time to notice a URL that does not load, see `checkCover`. */
    private coverProbe: HTMLImageElement | null = null;

    /** The cover URL the last probe was started for. */
    private probedCover = '';

    constructor(props: WidgetGenericProps<SonosPlayerSettings>) {
        super(props);
        this.state = {
            ...this.state,
            values: {},
            localVolume: null,
            localSeek: null,
            roomName: '',
            playerOpen: false,
            sourceOpen: false,
            coverTs: 0,
            brokenCover: '',
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
                showSource: {
                    type: 'checkbox',
                    label: 'sonosdm_showSource',
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
        this.checkCover();
        // Compare the normalized values: `settings.room` may be undefined while the `room` getter falls
        // back to an empty string. A raw comparison would then be true on every update and the setState
        // below would trigger the next componentDidUpdate forever (React error #185).
        const prevInstance = prevProps.settings.instance || 'sonos.0';
        const prevRoom = prevProps.settings.room || '';
        if (prevInstance !== this.instance || prevRoom !== this.room) {
            this.unsubscribeStates();
            this.setState(
                {
                    values: {},
                    localVolume: null,
                    localSeek: null,
                    roomName: '',
                    playerOpen: false,
                    sourceOpen: false,
                },
                () => {
                    this.subscribeStates();
                    void this.readRoomName();
                },
            );
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount?.();
        this.unsubscribeStates();
        if (this.coverProbe) {
            this.coverProbe.onload = null;
            this.coverProbe.onerror = null;
            this.coverProbe = null;
        }
        if (this.volumeTimer) {
            clearTimeout(this.volumeTimer);
            this.volumeTimer = null;
        }
        if (this.seekTimer) {
            clearTimeout(this.seekTimer);
            this.seekTimer = null;
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
                this.setState(prev => ({
                    values: { ...prev.values, [name]: state ? state.val : null },
                    coverTs: name === 'current_cover' ? state?.ts || 0 : prev.coverTs,
                }));
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

    private get muted(): boolean {
        return this.state.values.muted === true;
    }

    private get volume(): number {
        return this.state.localVolume ?? this.num('volume');
    }

    private get displayName(): string {
        return (
            this.props.settings.name || this.state.name || this.state.roomName || this.room || I18n.t('sonosdm_no_room')
        );
    }

    /** The cover to draw, or an empty string - then the placeholder is shown - also when it does not load. */
    private get cover(): string {
        const url = this.coverUrl;
        return url === this.state.brokenCover ? '' : url;
    }

    /**
     * A background image has no `onerror`, so the cover is loaded once more with an `Image`. If that
     * fails - the file was removed from the storage, for example - the placeholder is drawn instead.
     * The next track brings a new `ts` and with it a new URL, which is tried again.
     */
    private checkCover(): void {
        const url = this.coverUrl;
        if (url === this.probedCover) {
            return;
        }
        this.probedCover = url;
        if (this.coverProbe) {
            this.coverProbe.onload = null;
            this.coverProbe.onerror = null;
            this.coverProbe = null;
        }
        if (!url || url === this.state.brokenCover) {
            return;
        }
        const probe = new Image();
        probe.onload = () => {
            if (this.coverProbe === probe) {
                this.coverProbe = null;
            }
        };
        probe.onerror = () => {
            if (this.coverProbe === probe) {
                this.coverProbe = null;
                this.setState({ brokenCover: url });
            }
        };
        this.coverProbe = probe;
        probe.src = encodeURI(url);
    }

    /** The cover URL, or an empty string when there is none or it is switched off. */
    private get coverUrl(): string {
        const cover = this.props.settings.showCover === false ? '' : this.str('current_cover');
        if (!cover || /^(https?:|data:|\/\/)/.test(cover)) {
            return cover;
        }
        // `current_cover` is a path in the file storage (`/sonos/coverImage/<ip>.png`). Only the web
        // adapter serves the storage from its root - admin, where ioBroker.devices usually runs, needs
        // `/files/`. The host knows its own prefix.
        const url = this.props.stateContext.getImagePath(cover) || cover;
        return this.state.coverTs ? `${url}?ts=${this.state.coverTs}` : url;
    }

    /** The widget colour if the user set one, otherwise the SONOS red. */
    private get accent(): string {
        return this.getAccentColor() || SONOS_RED;
    }

    /** Title of the track, or a hint that nothing plays. */
    private get title(): string {
        return this.str('current_title') || I18n.t('sonosdm_nothing_playing');
    }

    /** Artist - or for a radio station, which has none, the station name. */
    private get artist(): string {
        return this.str('current_artist') || this.str('current_station');
    }

    /** The speaker follows another one, or others follow it. */
    private get grouped(): boolean {
        const members = this.str('membersChannels')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
        return coordinatorOf(this.room, this.str('coordinator')) !== this.room || members.length > 1;
    }

    /** Why the player cannot be used - no speaker configured or not reachable - or `null`. */
    private get hint(): string | null {
        if (!this.room) {
            return I18n.t('sonosdm_no_room');
        }
        return this.state.values.alive === false ? I18n.t('sonosdm_offline') : null;
    }

    /** Radio and the TV input have no duration, so there is no progress to show. */
    private get showsProgress(): boolean {
        return this.props.settings.showSeek !== false && !this.isOnTv() && this.num('current_duration') > 0;
    }

    /** Main and second line of the tiles: what is playing, or the speaker and why it cannot be used. */
    private tileLines(): { title: string; subtitle: string } {
        const hint = this.hint;
        if (hint) {
            const name = this.displayName;
            return { title: name, subtitle: hint === name ? '' : hint };
        }
        return { title: this.title, subtitle: this.artist };
    }

    // ---- actions ------------------------------------------------------------

    private openPlayer = (): void => {
        if (!this.hint) {
            this.setState({ playerOpen: true });
        }
    };

    private closePlayer = (): void => this.setState({ playerOpen: false });

    /** The value is written 200 ms after the last move, so dragging does not flood the speaker. */
    private onVolumeChange(value: number): void {
        this.setState({ localVolume: value });
        if (this.volumeTimer) {
            clearTimeout(this.volumeTimer);
        }
        this.volumeTimer = setTimeout(() => {
            this.volumeTimer = null;
            this.set('volume', value);
            this.setState({ localVolume: null });
        }, 200);
    }

    private onSeekChange(value: number, commit: boolean): void {
        if (this.seekTimer) {
            clearTimeout(this.seekTimer);
            this.seekTimer = null;
        }
        this.setState({ localSeek: value });
        if (!commit) {
            return;
        }
        this.set('seek', value);
        // `current_elapsed` only follows once the speaker jumped - keep the new position until then,
        // so the slider does not snap back for a moment.
        this.seekTimer = setTimeout(() => {
            this.seekTimer = null;
            this.setState({ localSeek: null });
        }, 1500);
    }

    // ---- WidgetGeneric override points --------------------------------------

    protected isTileActive(): boolean {
        return this.playing;
    }

    protected hasTileAction(): boolean {
        return !this.hint;
    }

    protected onTileClick(): void {
        this.openPlayer();
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

    /** Round button. Rendered as a styled Box so no MUI button has to be bridged. */
    private renderButton(
        key: string,
        content: React.ReactNode,
        onClick: () => void,
        opts?: ButtonOptions,
    ): React.JSX.Element {
        const size = opts?.size || 40;
        const primary = opts?.variant === 'primary';
        const accent = this.accent;

        const button = (
            <Box
                key={key}
                component="button"
                aria-label={opts?.title}
                onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onClick();
                }}
                sx={theme => ({
                    all: 'unset',
                    boxSizing: 'border-box',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: '0 0 auto',
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    cursor: 'pointer',
                    fontSize: `${Math.round(size * (primary ? 0.56 : 0.6))}px`,
                    lineHeight: 1,
                    transition: 'background-color 0.15s ease, transform 0.12s ease, opacity 0.15s ease',
                    '&:focus-visible': { outline: `2px solid ${accent}`, outlineOffset: '2px' },
                    ...(primary
                        ? {
                              color: theme.palette.background.paper,
                              backgroundColor: theme.palette.text.primary,
                              '&:hover': { opacity: 0.85, transform: 'scale(1.04)' },
                          }
                        : {
                              color: opts?.active ? accent : theme.palette.text.primary,
                              '&:hover': { backgroundColor: 'rgba(127,127,127,0.18)' },
                          }),
                    ...(opts?.active && !primary
                        ? {
                              '&::after': {
                                  content: '""',
                                  position: 'absolute',
                                  bottom: '2px',
                                  left: '50%',
                                  width: '4px',
                                  height: '4px',
                                  marginLeft: '-2px',
                                  borderRadius: '50%',
                                  backgroundColor: 'currentColor',
                              },
                          }
                        : {}),
                    '&:active': { transform: 'scale(0.92)' },
                })}
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

    /** Music note - or the TV symbol on the HDMI input - where no cover is available. */
    private renderPlaceholder(fontSize: string, active: boolean): React.JSX.Element {
        const sx = { fontSize, color: active ? this.accent : 'text.disabled', transition: 'color 0.25s ease' };
        return this.isOnTv() ? <TvIcon sx={sx} /> : <MusicIcon sx={sx} />;
    }

    /** Thin, non-interactive progress bar of the tiles. */
    private renderProgressBar(height: number): React.JSX.Element | null {
        if (!this.showsProgress) {
            return null;
        }
        const percent = Math.min(100, Math.max(0, (this.num('current_elapsed') / this.num('current_duration')) * 100));

        return (
            <Box
                sx={{
                    width: '100%',
                    height,
                    borderRadius: `${height / 2}px`,
                    overflow: 'hidden',
                    flexShrink: 0,
                    backgroundColor: 'rgba(127,127,127,0.3)',
                }}
            >
                <Box
                    sx={{
                        width: `${percent}%`,
                        height: '100%',
                        borderRadius: 'inherit',
                        backgroundColor: this.accent,
                        transition: 'width 0.5s linear',
                    }}
                />
            </Box>
        );
    }

    /** Progress bar with elapsed and total time, as the tiles show it. */
    private renderTileProgress(fontSize: string, height: number, onCover: boolean): React.JSX.Element | null {
        if (this.hint || !this.showsProgress) {
            return null;
        }
        const label = {
            fontSize,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            color: onCover ? 'rgba(255,255,255,0.6)' : 'text.secondary',
        };

        return (
            <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography
                    variant="caption"
                    sx={label}
                >
                    {timeString(this.num('current_elapsed'))}
                </Typography>
                <Box sx={{ flex: 1 }}>{this.renderProgressBar(height)}</Box>
                <Typography
                    variant="caption"
                    sx={label}
                >
                    {timeString(this.num('current_duration'))}
                </Typography>
            </Box>
        );
    }

    /** Name of the speaker as a small pill in the top left corner of the cover. */
    private renderRoomPill(): React.JSX.Element {
        return (
            <Box
                sx={{
                    position: 'absolute',
                    top: 'max(6px, 3cqi)',
                    left: 'max(6px, 3cqi)',
                    zIndex: 2,
                    display: 'flex',
                    maxWidth: 'calc(100% - 64px)',
                    px: 1,
                    py: 0.25,
                    borderRadius: '8px',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(4px)',
                    color: '#fff',
                }}
            >
                <Typography
                    ref={this.nameRef}
                    variant="caption"
                    noWrap
                    sx={{ fontWeight: 600, lineHeight: 1.5 }}
                >
                    {this.grouped ? `${this.displayName} · ${I18n.t('sonosdm_grouped')}` : this.displayName}
                </Typography>
            </Box>
        );
    }

    /** Play/pause state and - while muted - the muted marker, drawn over the cover. */
    private renderBadges(size: number, position: Record<string, string | number>): React.JSX.Element | null {
        if (this.hint) {
            return null;
        }
        const badge = (key: string, icon: React.JSX.Element): React.JSX.Element => (
            <Box
                key={key}
                sx={{
                    width: size,
                    height: size,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(4px)',
                    color: '#fff',
                    fontSize: `${Math.round(size * 0.62)}px`,
                }}
            >
                {icon}
            </Box>
        );

        return (
            <Box sx={{ position: 'absolute', zIndex: 2, display: 'flex', alignItems: 'center', gap: 0.5, ...position }}>
                {this.muted ? badge('muted', <MutedIcon sx={{ fontSize: 'inherit' }} />) : null}
                {this.isOnTv()
                    ? null
                    : badge(
                          'play',
                          this.playing ? (
                              <PauseIcon sx={{ fontSize: 'inherit' }} />
                          ) : (
                              <PlayIcon sx={{ fontSize: 'inherit' }} />
                          ),
                      )}
            </Box>
        );
    }

    /** The host's indicators and settings button - a click on them must not open the player. */
    private renderTileIndicators(): React.JSX.Element {
        return (
            <div
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                style={{ display: 'contents' }}
            >
                {this.renderIndicators(this.renderSettingsButton())}
            </div>
        );
    }

    /** Frame and surface of the clickable tile - the same the host draws around its own widgets. */
    private tileSx(theme: Theme): Record<string, unknown> {
        const clickable = !this.hint;
        return {
            boxSizing: 'border-box',
            position: 'relative',
            width: '100%',
            overflow: 'hidden',
            userSelect: 'none',
            cursor: clickable ? 'pointer' : 'default',
            ...(getTileStyles(
                theme,
                this.isTileActive(),
                this.getAccentColor(),
                clickable,
                this.getInactiveColor(),
            ) as Record<string, unknown>),
        };
    }

    /** The outer box the host sizes. The dialogs sit next to the tile, so their clicks do not reach it. */
    private renderFrame(outerStyle: (theme: Theme) => React.CSSProperties, tile: React.JSX.Element): React.JSX.Element {
        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={outerStyle}
            >
                {tile}
                {this.renderPlayerDialog()}
                {this.renderSourceDialog()}
            </Box>
        );
    }

    // ---- player dialog ------------------------------------------------------

    /** Collapse button, the speaker and - if it is in one - a note about the group. */
    private renderDialogHeader(): React.JSX.Element {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                {this.renderButton('close', <CollapseIcon sx={{ fontSize: 'inherit' }} />, this.closePlayer, {
                    size: 34,
                    title: I18n.t('sonosdm_close'),
                })}
                <Box sx={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                    <Typography
                        variant="caption"
                        noWrap
                        sx={{
                            display: 'block',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            fontSize: '0.65rem',
                            color: 'text.secondary',
                        }}
                    >
                        {this.displayName}
                    </Typography>
                    {this.grouped ? (
                        <Typography
                            variant="caption"
                            noWrap
                            sx={{ display: 'block', fontSize: '0.65rem', color: 'text.secondary', opacity: 0.8 }}
                        >
                            {I18n.t('sonosdm_grouped')}
                        </Typography>
                    ) : null}
                </Box>
                <Box sx={{ width: 34, flex: '0 0 auto' }} />
            </Box>
        );
    }

    /** The cover as large as the dialog allows, limited in landscape so the controls stay visible. */
    private renderDialogCover(): React.JSX.Element | null {
        if (this.props.settings.showCover === false) {
            return null;
        }
        const cover = this.cover;

        return (
            <Box
                sx={{
                    width: '100%',
                    maxWidth: '40vh',
                    aspectRatio: '1',
                    alignSelf: 'center',
                    flexShrink: 0,
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...(cover
                        ? { backgroundImage: coverImage(cover), backgroundSize: 'cover', backgroundPosition: 'center' }
                        : { backgroundColor: 'rgba(127,127,127,0.12)' }),
                }}
            >
                {cover ? null : this.renderPlaceholder('80px', false)}
            </Box>
        );
    }

    /** Title, artist and - when it adds something - the album. */
    private renderDialogTitle(): React.JSX.Element {
        const artist = this.artist;
        const album = this.str('current_album');

        return (
            <Box sx={{ minWidth: 0 }}>
                <Typography
                    variant="h6"
                    noWrap
                    sx={{ fontWeight: 700, lineHeight: 1.3 }}
                >
                    {this.title}
                </Typography>
                <Typography
                    variant="body2"
                    noWrap
                    sx={{ color: 'text.secondary', fontWeight: 500 }}
                >
                    {artist || ' '}
                </Typography>
                {album && album !== artist ? (
                    <Typography
                        variant="caption"
                        noWrap
                        sx={{ display: 'block', color: 'text.secondary', opacity: 0.8 }}
                    >
                        {album}
                    </Typography>
                ) : null}
            </Box>
        );
    }

    /** Progress slider to jump within the track, with elapsed and total time. */
    private renderSeek(): React.JSX.Element | null {
        if (!this.showsProgress) {
            return null;
        }
        const duration = this.num('current_duration');
        const { localSeek } = this.state;
        const elapsed = localSeek === null ? this.num('current_elapsed') : (localSeek / 100) * duration;
        const label = { color: 'text.secondary', fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums' };

        return (
            <Box>
                <Slider
                    size="small"
                    min={0}
                    max={100}
                    step={0.1}
                    value={Math.min(100, Math.max(0, (elapsed / duration) * 100))}
                    valueLabelDisplay="off"
                    onChange={(_e: Event, value: number | number[]) => this.onSeekChange(sliderValue(value), false)}
                    onChangeCommitted={(_e: Event | React.SyntheticEvent, value: number | number[]) =>
                        this.onSeekChange(sliderValue(value), true)
                    }
                    sx={{
                        color: this.accent,
                        height: 4,
                        p: '4px 0 !important',
                        '& .MuiSlider-thumb': { width: 12, height: 12 },
                        '& .MuiSlider-rail': { opacity: 0.2 },
                    }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: -0.5 }}>
                    <Typography
                        variant="caption"
                        sx={label}
                    >
                        {timeString(elapsed)}
                    </Typography>
                    <Typography
                        variant="caption"
                        sx={label}
                    >
                        {timeString(duration)}
                    </Typography>
                </Box>
            </Box>
        );
    }

    /** Shuffle - previous / play-pause / next - repeat. The TV input has no transport at all. */
    private renderTransport(): React.JSX.Element | null {
        if (this.isOnTv()) {
            return null;
        }
        const showModes = this.props.settings.showModes !== false;
        const shuffle = this.state.values.shuffle === true;
        const repeat = this.num('repeat');

        return (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: showModes ? 'space-between' : 'center',
                    gap: 1,
                }}
            >
                {showModes
                    ? this.renderButton(
                          'shuffle',
                          <ShuffleIcon sx={{ fontSize: 'inherit' }} />,
                          () => this.set('shuffle', !shuffle),
                          { size: 40, active: shuffle, title: I18n.t('sonosdm_shuffle') },
                      )
                    : null}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {this.renderButton(
                        'prev',
                        <PrevIcon sx={{ fontSize: 'inherit' }} />,
                        () => this.set('prev', true),
                        {
                            size: 48,
                            title: I18n.t('sonosdm_previous'),
                        },
                    )}
                    {this.renderButton(
                        'play',
                        this.playing ? (
                            <PauseIcon sx={{ fontSize: 'inherit' }} />
                        ) : (
                            <PlayIcon sx={{ fontSize: 'inherit' }} />
                        ),
                        () => this.set('state_simple', !this.playing),
                        {
                            size: 64,
                            variant: 'primary',
                            title: I18n.t(this.playing ? 'sonosdm_pause' : 'sonosdm_play'),
                        },
                    )}
                    {this.renderButton(
                        'next',
                        <NextIcon sx={{ fontSize: 'inherit' }} />,
                        () => this.set('next', true),
                        {
                            size: 48,
                            title: I18n.t('sonosdm_next'),
                        },
                    )}
                </Box>
                {showModes
                    ? this.renderButton(
                          'repeat',
                          repeat === 2 ? (
                              <RepeatOneIcon sx={{ fontSize: 'inherit' }} />
                          ) : (
                              <RepeatIcon sx={{ fontSize: 'inherit' }} />
                          ),
                          // off -> all -> one track -> off
                          () => this.set('repeat', (repeat + 1) % 3),
                          { size: 40, active: !!repeat, title: I18n.t(REPEAT_TITLES[repeat] || REPEAT_TITLES[0]) },
                      )
                    : null}
            </Box>
        );
    }

    /** Mute toggle and - unless switched off - the volume slider with the level. */
    private renderVolume(): React.JSX.Element {
        const muted = this.muted;
        const showVolume = this.props.settings.showVolume !== false;

        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {this.renderButton(
                    'mute',
                    muted ? <MutedIcon sx={{ fontSize: 'inherit' }} /> : <VolumeIcon sx={{ fontSize: 'inherit' }} />,
                    () => this.set('muted', !muted),
                    { size: 34, active: muted, title: I18n.t(muted ? 'sonosdm_unmute' : 'sonosdm_mute') },
                )}
                {showVolume ? (
                    <Slider
                        size="small"
                        min={0}
                        max={100}
                        value={this.volume}
                        valueLabelDisplay="off"
                        onChange={(_e: Event, value: number | number[]) => this.onVolumeChange(sliderValue(value))}
                        sx={{
                            flex: 1,
                            color: this.accent,
                            '& .MuiSlider-thumb': { width: 12, height: 12 },
                            '& .MuiSlider-rail': { opacity: 0.2 },
                        }}
                    />
                ) : null}
                {showVolume ? (
                    <Typography
                        variant="caption"
                        sx={{
                            minWidth: 26,
                            textAlign: 'right',
                            color: 'text.secondary',
                            fontVariantNumeric: 'tabular-nums',
                        }}
                    >
                        {this.volume}
                    </Typography>
                ) : null}
            </Box>
        );
    }

    /** Opens the source selection - favorites, playlists, queue, recently played and the sources. */
    private renderSourceButton(): React.JSX.Element | null {
        if (this.props.settings.showSource === false || !this.room) {
            return null;
        }

        return (
            <Box
                component="button"
                onClick={() => this.setState({ sourceOpen: true })}
                sx={{
                    all: 'unset',
                    boxSizing: 'border-box',
                    alignSelf: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 2,
                    py: 0.75,
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    color: 'text.primary',
                    backgroundColor: 'rgba(127,127,127,0.18)',
                    transition: 'background-color 0.15s ease',
                    '&:hover': { backgroundColor: 'rgba(127,127,127,0.32)' },
                    '&:focus-visible': { outline: `2px solid ${this.accent}`, outlineOffset: '2px' },
                }}
            >
                <LibraryIcon sx={{ fontSize: '1.1rem' }} />
                {I18n.t('sonosdm_select_source')}
            </Box>
        );
    }

    /** The full player, opened by a click on the tile. */
    private renderPlayerDialog(): React.JSX.Element | null {
        if (!this.state.playerOpen) {
            return null;
        }

        return (
            <Dialog
                open
                onClose={this.closePlayer}
                fullWidth
                maxWidth="xs"
                slotProps={{
                    paper: {
                        sx: (theme: Theme) => ({
                            borderRadius: '24px',
                            background:
                                theme.palette.mode === 'dark'
                                    ? 'linear-gradient(180deg, #1a1a2e 0%, #0d0d14 100%)'
                                    : 'linear-gradient(180deg, #f5f5f5 0%, #e0e0e0 100%)',
                            overflow: 'hidden',
                            maxHeight: '90vh',
                        }),
                    },
                }}
            >
                <Box
                    sx={{
                        p: 3,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        overflowY: 'auto',
                        maxHeight: '85vh',
                    }}
                >
                    {this.renderDialogHeader()}
                    {this.renderDialogCover()}
                    {this.renderDialogTitle()}
                    {this.renderSeek()}
                    {this.renderTransport()}
                    {this.renderVolume()}
                    {this.renderSourceButton()}
                </Box>
            </Dialog>
        );
    }

    private renderSourceDialog(): React.JSX.Element | null {
        if (!this.state.sourceOpen) {
            return null;
        }

        return (
            <SourceDialog
                stateContext={this.props.stateContext}
                instance={this.instance}
                room={this.room}
                roomName={this.displayName}
                onClose={() => this.setState({ sourceOpen: false })}
            />
        );
    }

    // ---- sizes --------------------------------------------------------------

    /** 1x1 - the cover fills the tile, title, artist and progress over its lower part. */
    renderCompact(): React.JSX.Element {
        const hint = this.hint;
        const cover = this.cover;
        const { title, subtitle } = this.tileLines();

        const tile = (
            <Box
                onClick={this.openPlayer}
                sx={theme => ({
                    ...this.tileSx(theme),
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    aspectRatio: '1',
                    textAlign: 'left',
                    padding: 0,
                })}
            >
                {cover ? (
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            backgroundImage: coverImage(cover),
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                        }}
                    />
                ) : (
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {this.renderPlaceholder('max(3rem, 30cqi)', this.isTileActive())}
                    </Box>
                )}
                {cover ? (
                    // Darkens the lower part, so the text stays readable on a bright cover
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            pointerEvents: 'none',
                            background:
                                'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)',
                        }}
                    />
                ) : null}
                {hint ? null : this.renderRoomPill()}
                {this.renderTileIndicators()}
                {cover ? this.renderBadges(28, { bottom: 'calc(50% + 4px)', left: 8 }) : null}

                <Box
                    sx={{
                        position: 'relative',
                        zIndex: 1,
                        minWidth: 0,
                        p: 'max(8px, 6cqi)',
                        pt: 0,
                        color: cover ? '#fff' : undefined,
                    }}
                >
                    <Typography
                        ref={hint ? this.nameRef : undefined}
                        variant="body2"
                        noWrap
                        sx={{
                            fontWeight: 700,
                            lineHeight: 1.3,
                            fontSize: 'max(0.75rem, 7.5cqi)',
                            textShadow: cover ? '0 1px 3px rgba(0,0,0,0.5)' : undefined,
                        }}
                    >
                        {title}
                    </Typography>
                    {subtitle ? (
                        <Typography
                            variant="caption"
                            noWrap
                            sx={{
                                display: 'block',
                                fontWeight: 500,
                                fontSize: 'max(0.6rem, 6cqi)',
                                color: cover ? 'rgba(255,255,255,0.7)' : 'text.secondary',
                                textShadow: cover ? '0 1px 2px rgba(0,0,0,0.5)' : undefined,
                            }}
                        >
                            {subtitle}
                        </Typography>
                    ) : null}
                    {this.renderTileProgress('max(0.5rem, 5cqi)', 3, !!cover)}
                </Box>
                {this.renderChart()}
            </Box>
        );

        return this.renderFrame(theme => WidgetGeneric.getStyleCompact(theme), tile);
    }

    /** 2x0.5 - blurred cover behind a thumbnail, the speaker, title · artist and the progress. */
    renderWide(): React.JSX.Element {
        const hint = this.hint;
        const cover = this.cover;
        const { title, subtitle } = this.tileLines();

        const tile = (
            <Box
                onClick={this.openPlayer}
                sx={theme => ({
                    ...this.tileSx(theme),
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    height: 80,
                })}
            >
                {cover ? (
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: 0,
                            backgroundImage: coverImage(cover),
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            filter: 'blur(12px) brightness(0.4)',
                            transform: 'scale(1.15)',
                        }}
                    />
                ) : null}

                <Box
                    sx={{
                        position: 'relative',
                        zIndex: 1,
                        flexShrink: 0,
                        width: 48,
                        height: 48,
                        borderRadius: '8px',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        ...(cover
                            ? {
                                  backgroundImage: coverImage(cover),
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                              }
                            : {}),
                    }}
                >
                    {cover ? null : this.renderPlaceholder('28px', this.isTileActive())}
                </Box>

                <Box
                    sx={{
                        position: 'relative',
                        zIndex: 1,
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.25,
                        color: cover ? '#fff' : undefined,
                    }}
                >
                    <Typography
                        ref={this.nameRef}
                        variant="caption"
                        noWrap
                        sx={{ fontWeight: 600, lineHeight: 1.2, opacity: 0.75 }}
                    >
                        {!hint && this.grouped
                            ? `${this.displayName} · ${I18n.t('sonosdm_grouped')}`
                            : this.displayName}
                    </Typography>
                    <Typography
                        variant="body2"
                        noWrap
                        sx={theme => ({
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            textShadow: cover ? '0 1px 3px rgba(0,0,0,0.5)' : undefined,
                            ...(isNeumorphicTheme(theme)
                                ? { textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.75rem' }
                                : {}),
                        })}
                    >
                        {hint ? subtitle || title : title}
                        {!hint && subtitle ? (
                            <Box
                                component="span"
                                sx={{ fontWeight: 400, opacity: 0.7 }}
                            >
                                {` · ${subtitle}`}
                            </Box>
                        ) : null}
                    </Typography>
                    {hint ? null : this.renderProgressBar(4)}
                </Box>
                {this.renderTileIndicators()}
                {this.renderChart()}
            </Box>
        );

        return this.renderFrame(theme => WidgetGeneric.getStyleWide(theme), tile);
    }

    /** 2x1 and 2x2 - the large cover with the speaker on it, title, artist and progress below. */
    renderWideTall(): React.JSX.Element {
        const hint = this.hint;
        const cover = this.cover;
        const active = this.isTileActive();
        const { title, subtitle } = this.tileLines();

        const tile = (
            <Box
                onClick={this.openPlayer}
                sx={theme => ({
                    ...this.tileSx(theme),
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    padding: 0,
                })}
            >
                <Box
                    sx={{
                        position: 'relative',
                        flex: '1 1 60%',
                        minHeight: 0,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        ...(cover
                            ? {
                                  backgroundImage: coverImage(cover),
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                              }
                            : { backgroundColor: 'rgba(127,127,127,0.08)' }),
                    }}
                >
                    {cover ? null : this.renderPlaceholder('64px', active)}
                    {hint ? null : this.renderRoomPill()}
                    {this.renderBadges(36, { bottom: 8, right: 12 })}
                    {this.renderTileIndicators()}
                </Box>

                <Box sx={{ p: 1.5, pt: 1, minWidth: 0 }}>
                    <Typography
                        ref={hint ? this.nameRef : undefined}
                        variant="body2"
                        noWrap
                        sx={theme => ({
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            ...(isNeumorphicTheme(theme)
                                ? { textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.8rem' }
                                : {}),
                        })}
                    >
                        {title}
                    </Typography>
                    {subtitle ? (
                        <Typography
                            variant="caption"
                            noWrap
                            sx={{ display: 'block', fontWeight: 500, color: active ? this.accent : 'text.secondary' }}
                        >
                            {subtitle}
                        </Typography>
                    ) : null}
                    {this.renderTileProgress('0.65rem', 4, false)}
                </Box>
                {this.renderChart()}
            </Box>
        );

        return this.renderFrame(theme => WidgetGeneric.getStyleWideTall(theme), tile);
    }
}

export default SonosPlayerComponent;
