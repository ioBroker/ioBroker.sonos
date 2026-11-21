/**
 * Helpers for the commands of the shared catalog of ioBroker.assistant (HELP.md there): `media.getPlayers`,
 * `media.getMedia`, `media.play` and `speech.playSound`. Pure functions, so that the unit tests can check them; the
 * commands themselves are in main.ts.
 */

import type { SonosMediaEntry } from './backend/types';
import { isStreamUri } from './content-directory';

/**
 * A parameter of a message as text: strings, numbers and booleans, else ''
 *
 * @param value the parameter
 */
export function asText(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

/** A speaker, as the commands look for it */
export interface NamedPlayer {
    /** the channel below root: the IP address with underscores */
    id: string;
    /** the name of the settings */
    name: string;
    /** other names the user may say: the room of the SONOS app, the IP address */
    names: string[];
}

/** The answer of a failed search for a speaker (rule 4 and 5 of the catalog) */
export interface NotFound {
    error: string;
    reason: 'NOT_FOUND' | 'AMBIGUOUS';
    candidates: string[];
}

/**
 * Find a speaker by its channel or one of its names, compared without case. An exact name wins over a part of a
 * name; several speakers that fit equally are AMBIGUOUS.
 *
 * @param players the speakers
 * @param wanted what the caller gave as `device`
 */
export function findPlayer<T extends NamedPlayer>(players: T[], wanted: string): { player: T } | NotFound {
    const term = asText(wanted).trim().toLowerCase();
    const namesOf = (player: T): string[] =>
        [player.id, player.name, ...player.names].filter(Boolean).map(name => name.toLowerCase());

    if (term) {
        for (const fits of [
            (player: T): boolean => namesOf(player).includes(term),
            (player: T): boolean => namesOf(player).some(name => name.includes(term)),
        ]) {
            const found = players.filter(fits);
            if (found.length === 1) {
                return { player: found[0] };
            }
            if (found.length > 1) {
                return {
                    error: `"${wanted}" fits several speakers: ${found.map(player => player.name).join(', ')}`,
                    reason: 'AMBIGUOUS',
                    candidates: found.map(player => player.name),
                };
            }
        }
    }

    return {
        error: `Unknown speaker "${wanted}"`,
        reason: 'NOT_FOUND',
        candidates: players.map(player => player.name),
    };
}

/**
 * True if `wanted` is the room: its ID (with or without "enum.rooms.") or one of its names, without case
 *
 * @param roomId the ID of the room, e.g. `enum.rooms.kitchen`
 * @param roomNames the names of the room in all languages
 * @param wanted what the caller gave as `room`
 */
export function isRoom(roomId: string | undefined, roomNames: string[], wanted: string): boolean {
    const term = asText(wanted).trim().toLowerCase();
    if (!term || !roomId) {
        return false;
    }
    const id = roomId.toLowerCase();
    return id === term || id === `enum.rooms.${term}` || roomNames.some(name => name.toLowerCase() === term);
}

/** The extension of the file for the content types of audio files */
const AUDIO_TYPES: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac',
    'audio/aiff': 'aiff',
    'audio/x-aiff': 'aiff',
    'audio/ogg': 'ogg',
    'audio/aac': 'aac',
    'audio/mp4': 'm4a',
};

/** Where the sound of `speech.playSound` comes from */
export type SoundSource =
    | { url: string }
    | { data: Buffer; ext: string }
    | { storage: { adapter: string; path: string } }
    | { hostFile: string }
    | { error: string; reason: 'BAD_REQUEST' };

/**
 * Read the `url` or `file` of `speech.playSound` (rule 7 of the catalog): an http(s) URL, a data URL, base64 with
 * `contentType`, an `iobfile://<adapter>.<n>/<path>` of the ioBroker files or a file on the ioBroker host.
 *
 * @param url the parameter `url`
 * @param file the parameter `file`
 * @param contentType the parameter `contentType`, for base64 in `file`
 */
export function soundSource(url: unknown, file: unknown, contentType?: unknown): SoundSource {
    const value = (asText(url) || asText(file)).trim();
    if (!value) {
        return { error: 'Give the sound as url or file', reason: 'BAD_REQUEST' };
    }
    if (/^https?:\/\//i.test(value)) {
        return { url: value };
    }

    const dataUrl = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s.exec(value);
    const type = (dataUrl ? dataUrl[1] : asText(contentType)).trim().toLowerCase();
    if (dataUrl || contentType) {
        const ext = AUDIO_TYPES[type];
        if (!ext) {
            return { error: `Not an audio type the speakers play: "${type}"`, reason: 'BAD_REQUEST' };
        }
        if (dataUrl && !/;base64/i.test(dataUrl[2])) {
            return { data: Buffer.from(decodeURIComponent(dataUrl[3]), 'binary'), ext };
        }
        const data = Buffer.from(dataUrl ? dataUrl[3] : value, 'base64');
        return data.length ? { data, ext } : { error: 'The sound is empty', reason: 'BAD_REQUEST' };
    }

    const storage = /^iobfile:\/\/\/?([^/]+)\/(.+)$/i.exec(value);
    if (storage) {
        return { storage: { adapter: storage[1], path: storage[2] } };
    }
    return { hostFile: value };
}

/** One entry of the answer of `media.getMedia` */
export interface MediaListItem {
    type: string;
    uri: string;
    name: string;
    image?: string;
}

/**
 * The kind of a favorite, from the class in its DIDL metadata; a stream without one is a radio
 *
 * @param entry the favorite
 */
export function favoriteType(entry: SonosMediaEntry): string {
    const match = /upnp:class(?:>|&gt;)\s*([^<&\s]+)/.exec(entry.metadata || '');
    const upnpClass = match ? match[1].toLowerCase() : '';
    if (upnpClass.includes('audiobroadcast')) {
        return 'radio';
    }
    if (upnpClass.includes('podcast')) {
        return 'podcast';
    }
    if (upnpClass.includes('playlistcontainer')) {
        return 'playlist';
    }
    if (upnpClass.includes('musicalbum')) {
        return 'album';
    }
    if (upnpClass.includes('musicartist')) {
        return 'artist';
    }
    if (upnpClass.includes('musictrack')) {
        return 'track';
    }
    return entry.uri && isStreamUri(entry.uri) ? 'radio' : 'favorite';
}

/**
 * The favorites or the SONOS playlists as items of `media.getMedia`: the `uri` is "favorite:<title>" or
 * "playlist:<title>", which `media.play` takes
 *
 * @param entries the favorites or playlists of the household
 * @param list `favorites` or `playlists`
 * @param search only titles that contain this text (without case)
 */
export function mediaListItems(
    entries: SonosMediaEntry[],
    list: 'favorites' | 'playlists',
    search?: string,
): MediaListItem[] {
    const term = asText(search).trim().toLowerCase();
    return entries
        .filter(entry => entry.title && (!term || entry.title.toLowerCase().includes(term)))
        .map(entry => {
            const item: MediaListItem = {
                type: list === 'playlists' ? 'playlist' : favoriteType(entry),
                uri: `${list === 'playlists' ? 'playlist' : 'favorite'}:${entry.title}`,
                name: entry.title!,
            };
            if (entry.albumArtUri && /^https?:\/\//i.test(entry.albumArtUri)) {
                item.image = entry.albumArtUri;
            }
            return item;
        });
}

/** What `media.play` starts */
export type PlayTarget = { resume: true } | { favorite: string } | { playlist: string } | { uri: string };

/**
 * Read the `uri` of `media.play`: nothing = resume, "favorite:<title>" and "playlist:<title>" from `media.getMedia`,
 * everything else a URI the speaker plays (a stream, a file, a URI of a music service)
 *
 * @param uri the parameter `uri`
 */
export function playTarget(uri: unknown): PlayTarget {
    const value = asText(uri).trim();
    if (!value) {
        return { resume: true };
    }
    const named = /^(favorite|playlist):(.+)$/i.exec(value);
    if (named) {
        return named[1].toLowerCase() === 'favorite' ? { favorite: named[2].trim() } : { playlist: named[2].trim() };
    }
    return { uri: value };
}
