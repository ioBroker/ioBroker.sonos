// Helpers shared by the SONOS widgets for ioBroker.devices.
//
// The sonos adapter creates one channel per speaker under `sonos.<instance>.root.<room>`, where
// `<room>` is the IP address with the dots replaced by underscores, and `common.name` of that
// channel is the name configured in the adapter (falling back to the IP). Every value the widgets
// need is a state directly below that channel - see `src/lib/states.ts` of the adapter.

import type { Connection } from '@iobroker/gui-components';

/** One SONOS speaker of an instance. */
export interface SonosRoom {
    /** Channel name, i.e. the IP with underscores - e.g. `192_168_1_50` */
    room: string;
    /** Name from the adapter configuration, falls back to the IP address */
    name: string;
    /** `common.icon` of the channel, if the user set one */
    icon: string | null;
    /** `common.color` of the channel, if the user set one */
    color: string | null;
}

/** `sonos.<instance>.root.<room>.<name>` */
export function stateId(instance: string, room: string, name: string): string {
    return `${instance}.root.${room}.${name}`;
}

/** Every SONOS device of the instance, sorted by name. */
export async function loadRooms(socket: Connection, instance: string): Promise<SonosRoom[]> {
    const prefix = `${instance}.root.`;
    const channels = await socket.getObjectViewSystem('channel', prefix, `${prefix}香`);

    const rooms: SonosRoom[] = [];
    for (const id of Object.keys(channels || {})) {
        const room = id.substring(prefix.length);
        // only direct children - a nested channel is not a speaker
        if (!room || room.includes('.')) {
            continue;
        }
        const common = channels[id]?.common;
        rooms.push({
            room,
            name: translated(common?.name) || room,
            icon: common?.icon || null,
            color: common?.color || null,
        });
    }

    return rooms.sort((a, b) => a.name.localeCompare(b.name));
}

/** `common.name` may be a plain string or a translation object. */
export function translated(text: ioBroker.StringOrTranslated | undefined, language?: ioBroker.Languages): string {
    if (!text) {
        return '';
    }
    if (typeof text === 'string') {
        return text;
    }
    return text[language || 'en'] || text.en || '';
}

/**
 * The room whose playback `room` follows: its group coordinator if it is a group member,
 * otherwise the room itself. Title, cover and the whole library live on the coordinator's channel.
 */
export function coordinatorOf(room: string, coordinator: string | null | undefined): string {
    const value = (coordinator || '').trim();
    return value && value !== room ? value : room;
}

/** `125` -> `2:05`. Used for the elapsed/duration labels. */
export function timeString(seconds: number): string {
    if (!seconds || seconds < 0 || !isFinite(seconds)) {
        return '0:00';
    }
    return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
        .toString()
        .padStart(2, '0')}`;
}

/** Some states carry JSON (or already-parsed arrays, depending on the socket). */
export function parseJson<T>(value: ioBroker.StateValue | undefined): T | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    if (typeof value === 'object') {
        return value as T;
    }
    try {
        return JSON.parse(String(value)) as T;
    } catch {
        return null;
    }
}
