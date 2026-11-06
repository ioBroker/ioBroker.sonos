/**
 * What the web components share: their tags and files, the states they read and pure helpers.
 *
 * Imported by `vite.config.ts` as well (the tags and files), so nothing in here may touch the DOM.
 */

/** The components: tag of the custom element and the files the build writes into `admin/webcomponents/` */
export const COMPONENTS = {
    player: { tag: 'iob-sonos-player', module: 'sonos-player.js', manifest: 'sonos-player.json' },
    rooms: { tag: 'iob-sonos-rooms', module: 'sonos-rooms.js', manifest: 'sonos-rooms.json' },
    control: { tag: 'iob-sonos-control', module: 'sonos-control.js', manifest: 'sonos-control.json' },
} as const;

export type ComponentName = keyof typeof COMPONENTS;

/** Where `tasks.mts` puts the modules in the admin folder; the React import is relative to it */
export const MODULE_FOLDER = 'webcomponents';

/**
 * The states of a speaker the player reads, below `sonos.<instance>.root.<room>`. The adapter mirrors the playback
 * of a group onto every member, so title, cover and transport are read from the room itself; `membersChannels` of
 * the group coordinator lists the rooms that follow it.
 */
export const PLAYER_STATES = [
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

/** The states of every speaker the overview of all rooms reads */
export const ROOMS_STATES = [
    'alive',
    'coordinator',
    'current_artist',
    'current_title',
    'membersChannels',
    'muted',
    'state_simple',
    'volume',
] as const;

/**
 * What the source selection reads. The adapter writes the lists to the channel of the group coordinator, so a
 * grouped speaker reads them from the room it follows - `recent_tracks` excepted, which is the room's own.
 */
export const LIBRARY_STATES = [
    'favorites_list_array',
    'playlist_list_array',
    'queue',
    'queue_array',
    'recent_tracks',
    'media_browse_result',
] as const;

/** The values of the settings of `<iob-sonos-player>`; a setting without a value is missing */
export interface PlayerSettings {
    [name: string]: string | number | boolean | undefined;
    room?: string;
    title?: string;
    showCover?: boolean;
    showSeek?: boolean;
    showModes?: boolean;
    showVolume?: boolean;
    showSource?: boolean;
    showRooms?: boolean;
    showGroups?: boolean;
    accent?: string;
}

/** The values of the settings of `<iob-sonos-rooms>`; a setting without a value is missing */
export interface RoomsSettings {
    [name: string]: string | number | boolean | undefined;
    instance?: string;
    title?: string;
    showVolume?: boolean;
    showSource?: boolean;
    allowGrouping?: boolean;
    hideOffline?: boolean;
    accent?: string;
}

/** The values of the settings of `<iob-sonos-control>`; a setting without a value is missing */
export interface ControlSettings {
    [name: string]: string | number | boolean | undefined;
    instance?: string;
    /** The speaker selected first: its channel; empty for the first speaker of the instance */
    room?: string;
    showRooms?: boolean;
    showGroups?: boolean;
    showLibrary?: boolean;
    accent?: string;
}

/** One speaker of an instance, from the channels below `sonos.<instance>.root` */
export interface SonosRoom {
    /** Channel name, the IP address with underscores, e.g. `192_168_1_50` */
    room: string;
    /** Name from the adapter configuration, the IP address if there is none */
    name: string;
    /** `common.color` of the channel, if the user set one */
    color: string;
    /** `common.icon` of the channel, if it is a URL the browser can load as it is */
    icon: string;
}

/** A speaker named by an ID: its instance and its channel name */
export interface RoomTarget {
    /** `sonos.0` */
    namespace: string;
    /** `192_168_1_50` */
    room: string;
}

/**
 * The speaker of an ID the user picked: the channel itself or one of its states
 *
 * @param id e.g. `sonos.0.root.192_168_1_50` or `sonos.0.root.192_168_1_50.volume`
 * @returns the instance and the room, or null if the ID is no speaker of SONOS
 */
export function parseRoomId(id: string | undefined | null): RoomTarget | null {
    const match = typeof id === 'string' ? id.match(/^(sonos\.\d+)\.root\.([^.]+)(\.|$)/) : null;
    return match ? { namespace: match[1], room: match[2] } : null;
}

/**
 * `sonos.<n>` for the value of an `instance` setting. JSON-Config gives `sonos.0`, other hosts may give
 * `system.adapter.sonos.0` or only the number.
 *
 * @param instance the value of the setting
 */
export function getNamespace(instance: string | number | boolean | undefined | null): string | null {
    const value = String(instance ?? '').trim();
    const match = value.match(/^(?:system\.adapter\.)?sonos\.(\d+)$/) || value.match(/^(\d+)$/);
    return match ? `sonos.${match[1]}` : null;
}

/** `sonos.<instance>.root.<room>.<name>` */
export function stateId(namespace: string, room: string, name: string): string {
    return `${namespace}.root.${room}.${name}`;
}

/**
 * The room whose playback `room` follows: its group coordinator if it is a member of a group, else itself
 *
 * @param room channel name of the room
 * @param coordinator the value of its state `coordinator`
 */
export function coordinatorOf(room: string, coordinator: ioBroker.StateValue | undefined): string {
    const value = coordinator === null || coordinator === undefined ? '' : String(coordinator).trim();
    return value && value !== room ? value : room;
}

/** The rooms in `membersChannels`: a list separated by commas */
export function splitMembers(value: ioBroker.StateValue | undefined): string[] {
    return String(value ?? '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

/** `125` -> `2:05`, the elapsed time and the duration */
export function timeString(seconds: number): string {
    if (!seconds || seconds < 0 || !Number.isFinite(seconds)) {
        return '0:00';
    }
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Some states carry JSON - or, depending on the socket, the parsed value already */
export function parseJson<T>(value: unknown): T | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    if (typeof value === 'object') {
        return value as T;
    }
    if (typeof value !== 'string') {
        return null;
    }
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

/** `common.name` may be a plain string or a translation */
export function getName(name: ioBroker.StringOrTranslated | undefined, lang: ioBroker.Languages): string {
    if (!name) {
        return '';
    }
    if (typeof name === 'string') {
        return name;
    }
    return name[lang] || name.en || '';
}

/**
 * The speakers of an instance, sorted by name: every direct channel below `sonos.<instance>.root.`
 *
 * @param channels what `getObjectViewSystem('channel', ...)` returned for that range
 * @param namespace `sonos.0`
 * @param lang the language of the system
 */
export function toRooms(
    channels: Record<string, ioBroker.AnyObject> | null | undefined,
    namespace: string,
    lang: ioBroker.Languages,
): SonosRoom[] {
    const prefix = `${namespace}.root.`;
    const rooms: SonosRoom[] = [];
    for (const [id, obj] of Object.entries(channels || {})) {
        const room = id.substring(prefix.length);
        // only direct children - a nested channel is no speaker
        if (!id.startsWith(prefix) || !room || room.includes('.')) {
            continue;
        }
        const common = (obj?.common || {}) as Partial<ioBroker.ChannelCommon>;
        const icon = typeof common.icon === 'string' ? common.icon : '';
        rooms.push({
            room,
            name: getName(common.name, lang) || room,
            color: typeof common.color === 'string' ? common.color : '',
            icon: /^(https?:|data:image\/)/.test(icon) ? icon : '',
        });
    }
    return rooms.sort((a, b) => a.name.localeCompare(b.name));
}

/** The HDMI/TV input of a soundbar: there is no transport to control */
export function isOnTv(type: ioBroker.StateValue | undefined, title: ioBroker.StateValue | undefined): boolean {
    return Number(type) === 2 && title === 'TV';
}
