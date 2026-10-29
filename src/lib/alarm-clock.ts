/**
 * The alarms of a SONOS household (#65, #325), over the AlarmClock service of the speakers.
 *
 * Neither client library is used for it: `sonos-discovery` does not know the service, and plain
 * SOAP behaves the same under both backends. Any speaker answers for the whole household.
 */
import * as http from 'node:http';

import type { AlarmClockAccess } from './backend/sonos-backend';
import type { SonosAlarm } from './backend/types';
import { browseMedia, decodeXml, xmlEscape } from './content-directory';

const SERVICE = 'urn:schemas-upnp-org:service:AlarmClock:1';

/** The SONOS chime: the program of an alarm that plays nothing else */
export const CHIME_URI = 'x-rincon-buzzer:0';

/** Title of {@link CHIME_URI} in the `source` state */
export const CHIME_TITLE = 'SONOS Chime';

/** Play modes an alarm accepts; `SHUFFLE` repeats, `SHUFFLE_NOREPEAT` does not */
export const ALARM_PLAY_MODES = ['NORMAL', 'REPEAT_ALL', 'SHUFFLE_NOREPEAT', 'SHUFFLE'];

/** What {@link applyAlarmSetting} needs to know about the household */
export interface AlarmLookup {
    /** uuid of the speaker with this room name, IP address or channel name */
    roomUuid(room: string): string | undefined;
    findFavorite(title: string): Promise<{ uri: string; metadata: string } | undefined>;
}

/**
 * Send one action to the AlarmClock service
 *
 * @param baseUrl `http://<ip>:1400` of any speaker
 * @param action name of the action
 * @param args the arguments as XML, in the order the service defines them
 * @returns the SOAP response
 */
function soapAlarmClock(baseUrl: string, action: string, args = ''): Promise<string> {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="${SERVICE}">${args}</u:${action}>
  </s:Body>
</s:Envelope>`;

    const url = new URL(`${baseUrl.replace(/\/$/, '')}/AlarmClock/Control`);
    const payload = Buffer.from(body, 'utf8');

    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: url.hostname,
                port: url.port || 1400,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'CONTENT-TYPE': 'text/xml; charset="utf-8"',
                    SOAPACTION: `"${SERVICE}#${action}"`,
                    'CONTENT-LENGTH': payload.length,
                },
            },
            res => {
                const chunks: Buffer[] = [];
                res.on('data', chunk => chunks.push(chunk as Buffer));
                res.on('end', () => {
                    const xml = Buffer.concat(chunks).toString('utf8');
                    if ((res.statusCode || 500) >= 400) {
                        // SONOS explains a refused action with a UPnP error code only
                        const code = xml.match(/<errorCode>(\d+)<\/errorCode>/i)?.[1];
                        reject(
                            new Error(`${action} failed: HTTP ${res.statusCode}${code ? `, UPnP error ${code}` : ''}`),
                        );
                        return;
                    }
                    resolve(xml);
                });
            },
        );
        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error(`${action} timed out`));
        });
        req.write(payload);
        req.end();
    });
}

/**
 * The alarms out of the answer to `ListAlarms`
 *
 * The list is an XML document inside the SOAP answer, and the metadata of every alarm is one
 * more XML document inside an attribute - so each level is decoded once.
 *
 * @param soapXml the SOAP answer
 */
function parseAlarmList(soapXml: string): SonosAlarm[] {
    const list = soapXml.match(/<CurrentAlarmList>([\s\S]*?)<\/CurrentAlarmList>/i);
    if (!list) {
        return [];
    }

    const alarms: SonosAlarm[] = [];

    for (const element of decodeXml(list[1]).matchAll(/<Alarm\s([^>]*?)\/?>/g)) {
        const attrs: Record<string, string> = {};
        for (const [, name, value] of element[1].matchAll(/(\w+)="([^"]*)"/g)) {
            attrs[name] = decodeXml(value);
        }

        const id = parseInt(attrs.ID, 10);
        if (isNaN(id)) {
            continue;
        }

        alarms.push({
            id,
            startTime: attrs.StartTime || '00:00:00',
            duration: attrs.Duration || '',
            recurrence: attrs.Recurrence || 'ONCE',
            enabled: attrs.Enabled === '1',
            roomUuid: attrs.RoomUUID || '',
            programUri: attrs.ProgramURI || '',
            programMetadata: attrs.ProgramMetaData || '',
            playMode: attrs.PlayMode || 'NORMAL',
            volume: parseInt(attrs.Volume, 10) || 0,
            includeLinkedZones: attrs.IncludeLinkedZones === '1',
        });
    }

    return alarms;
}

/**
 * The arguments of `CreateAlarm`, and of `UpdateAlarm` after the ID, in the order of the service
 *
 * @param alarm the alarm to send
 */
function alarmArguments(alarm: SonosAlarm): string {
    return [
        ['StartLocalTime', alarm.startTime],
        ['Duration', alarm.duration],
        ['Recurrence', alarm.recurrence],
        ['Enabled', alarm.enabled ? '1' : '0'],
        ['RoomUUID', alarm.roomUuid],
        ['ProgramURI', alarm.programUri],
        ['ProgramMetaData', alarm.programMetadata],
        ['PlayMode', alarm.playMode],
        ['Volume', String(alarm.volume)],
        ['IncludeLinkedZones', alarm.includeLinkedZones ? '1' : '0'],
    ]
        .map(([name, value]) => `<${name}>${xmlEscape(value)}</${name}>`)
        .join('');
}

/**
 * The alarms of the household, asked of whichever speaker `baseUrl` returns at the time of the call
 *
 * @param baseUrl `http://<ip>:1400` of any speaker, empty while none is known
 */
export function createAlarmClock(baseUrl: () => string): AlarmClockAccess {
    const speaker = (): string => {
        const url = baseUrl();
        if (!url) {
            throw new Error('no speaker is known yet');
        }
        return url;
    };

    return {
        list: async () => parseAlarmList(await soapAlarmClock(speaker(), 'ListAlarms')),
        create: async alarm => {
            const xml = await soapAlarmClock(speaker(), 'CreateAlarm', alarmArguments(alarm));
            return parseInt(xml.match(/<AssignedID>(\d+)<\/AssignedID>/i)?.[1] || '', 10) || 0;
        },
        update: async alarm => {
            await soapAlarmClock(speaker(), 'UpdateAlarm', `<ID>${alarm.id}</ID>${alarmArguments(alarm)}`);
        },
        destroy: async id => {
            await soapAlarmClock(speaker(), 'DestroyAlarm', `<ID>${id}</ID>`);
        },
        findFavorite: async title => {
            const wanted = title.trim().toLowerCase();
            // browsed here and not taken from the backend: only this carries the metadata of a favorite
            const favorite = (await browseMedia(speaker(), 'FV:2')).find(item => item.title.toLowerCase() === wanted);
            return favorite?.uri ? { uri: favorite.uri, metadata: favorite.metadata } : undefined;
        },
    };
}

/**
 * Normalize a time of day or a duration as the user writes it: `7:30`, `07:30` or `07:30:15`
 *
 * @param text the written time
 * @returns `hh:mm:ss`, or null if the text is no time
 */
export function parseAlarmTime(text: string): string | null {
    const match = String(text)
        .trim()
        .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) {
        return null;
    }

    const parts = [match[1], match[2], match[3] || '0'].map(Number);
    if (parts[0] > 23 || parts[1] > 59 || parts[2] > 59) {
        return null;
    }

    return parts.map(part => String(part).padStart(2, '0')).join(':');
}

/**
 * `hh:mm:ss` as the states show it: without the seconds, unless they are set
 *
 * @param time `hh:mm:ss`
 */
function formatAlarmTime(time: string): string {
    return /^\d\d:\d\d:00$/.test(time) ? time.slice(0, 5) : time;
}

/**
 * Normalize a recurrence as the user writes it
 *
 * @param text `once`, `daily`, `weekdays`, `weekends` or `ON_` followed by the days, 0 is Sunday
 * @returns the recurrence as SONOS writes it, or null if the text is none
 */
export function normalizeRecurrence(text: string): string | null {
    const value = String(text).trim().toUpperCase();
    if (['ONCE', 'DAILY', 'WEEKDAYS', 'WEEKENDS'].includes(value)) {
        return value;
    }

    const days = value.match(/^ON_([0-6]{1,7})$/)?.[1];
    // SONOS lists every day once and in order
    return days ? `ON_${[...new Set(days)].sort().join('')}` : null;
}

/**
 * Days of the week an alarm rings on, 0 is Sunday
 *
 * @param recurrence as SONOS writes it
 */
function recurrenceDays(recurrence: string): number[] {
    switch (recurrence) {
        case 'ONCE':
        case 'DAILY':
            return [0, 1, 2, 3, 4, 5, 6];
        case 'WEEKDAYS':
            return [1, 2, 3, 4, 5];
        case 'WEEKENDS':
            return [0, 6];
        default:
            return (recurrence.match(/^ON_([0-6]+)$/)?.[1] || '').split('').map(Number);
    }
}

/**
 * When the alarm rings next
 *
 * SONOS keeps the start in the local time of the household, which is taken to be the time zone
 * of the ioBroker host.
 *
 * @param alarm the alarm
 * @param now the time to look from
 * @returns timestamp in ms, or null for a disabled alarm
 */
export function nextAlarmStart(alarm: SonosAlarm, now: Date): number | null {
    const time = parseAlarmTime(alarm.startTime);
    if (!alarm.enabled || !time) {
        return null;
    }

    const [hours, minutes, seconds] = time.split(':').map(Number);
    const days = recurrenceDays(alarm.recurrence);

    for (let offset = 0; offset <= 7; offset++) {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hours, minutes, seconds);
        if (start.getTime() > now.getTime() && days.includes(start.getDay())) {
            return start.getTime();
        }
    }

    return null;
}

/**
 * What the alarm plays, as shown in the `source` state
 *
 * @param alarm the alarm
 */
function programTitle(alarm: SonosAlarm): string {
    if (!alarm.programUri || alarm.programUri === CHIME_URI) {
        return CHIME_TITLE;
    }

    const title = alarm.programMetadata.match(/<dc:title>([\s\S]*?)<\/dc:title>/i)?.[1];
    return title ? decodeXml(title).trim() : alarm.programUri;
}

/**
 * Values of the states under `alarms.<ID>`
 *
 * @param alarm the alarm
 * @param roomName name of the room that plays it
 * @param now the time to calculate `next_start` from
 */
export function alarmStateValues(alarm: SonosAlarm, roomName: string, now: Date): Record<string, ioBroker.StateValue> {
    return {
        enabled: alarm.enabled,
        time: formatAlarmTime(alarm.startTime),
        recurrence: alarm.recurrence,
        duration: formatAlarmTime(alarm.duration),
        volume: alarm.volume,
        room: roomName,
        source: programTitle(alarm),
        play_mode: alarm.playMode,
        include_grouped: alarm.includeLinkedZones,
        next_start: nextAlarmStart(alarm, now),
    };
}

/**
 * Boolean out of a written value; `"false"` and `"0"` are false
 *
 * @param value the written value
 */
function toBoolean(value: unknown): boolean {
    return typeof value === 'string' ? ['true', '1', 'on'].includes(value.trim().toLowerCase()) : !!value;
}

/**
 * Change one setting of an alarm, named like its state
 *
 * @param alarm the alarm, changed in place
 * @param setting name of the state, e.g. `time`
 * @param value the written value
 * @param lookup resolves rooms and favorites
 * @throws {Error} if the setting is unknown or the value invalid; the alarm is unchanged then
 */
export async function applyAlarmSetting(
    alarm: SonosAlarm,
    setting: string,
    value: unknown,
    lookup: AlarmLookup,
): Promise<void> {
    const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

    switch (setting) {
        case 'enabled':
            alarm.enabled = toBoolean(value);
            break;

        case 'include_grouped':
            alarm.includeLinkedZones = toBoolean(value);
            break;

        case 'time':
        case 'duration': {
            const time = parseAlarmTime(text);
            if (!time) {
                throw new Error(`Invalid ${setting} "${text}", expected hh:mm`);
            }
            if (setting === 'time') {
                alarm.startTime = time;
            } else {
                alarm.duration = time;
            }
            break;
        }

        case 'recurrence': {
            const recurrence = normalizeRecurrence(text);
            if (!recurrence) {
                throw new Error(
                    `Invalid recurrence "${text}", expected ONCE, DAILY, WEEKDAYS, WEEKENDS or ON_ with the days, e.g. ON_135`,
                );
            }
            alarm.recurrence = recurrence;
            break;
        }

        case 'volume': {
            const volume = text === '' ? NaN : Number(text);
            if (!(volume >= 0 && volume <= 100)) {
                throw new Error(`Invalid volume "${text}", expected 0 to 100`);
            }
            alarm.volume = Math.round(volume);
            break;
        }

        case 'play_mode': {
            const mode = text.toUpperCase();
            if (!ALARM_PLAY_MODES.includes(mode)) {
                throw new Error(`Invalid play mode "${text}", expected ${ALARM_PLAY_MODES.join(', ')}`);
            }
            alarm.playMode = mode;
            break;
        }

        case 'room': {
            const uuid = lookup.roomUuid(text);
            if (!uuid) {
                throw new Error(`Unknown room "${text}"`);
            }
            alarm.roomUuid = uuid;
            break;
        }

        case 'source': {
            if (!text || text.toLowerCase() === CHIME_TITLE.toLowerCase()) {
                alarm.programUri = CHIME_URI;
                alarm.programMetadata = '';
                break;
            }
            const favorite = await lookup.findFavorite(text);
            if (favorite) {
                alarm.programUri = favorite.uri;
                alarm.programMetadata = favorite.metadata;
            } else if (/^[a-z][\w+.-]*:/i.test(text)) {
                alarm.programUri = text;
                alarm.programMetadata = '';
            } else {
                throw new Error(`No favorite "${text}" found`);
            }
            break;
        }

        default:
            throw new Error(`Unknown alarm setting "${setting}"`);
    }
}

/**
 * The alarm described by the JSON written to `alarms.create`
 *
 * Only `room` and `time` are required: a new alarm rings daily for an hour with the SONOS chime.
 *
 * @param settings the settings, named like the states of an alarm
 * @param lookup resolves rooms and favorites
 */
export async function newAlarm(settings: Record<string, unknown>, lookup: AlarmLookup): Promise<SonosAlarm> {
    if (settings.room === undefined || settings.time === undefined) {
        throw new Error('"room" and "time" are required');
    }

    const alarm: SonosAlarm = {
        id: 0,
        startTime: '07:00:00',
        duration: '01:00:00',
        recurrence: 'DAILY',
        enabled: true,
        roomUuid: '',
        programUri: CHIME_URI,
        programMetadata: '',
        playMode: 'NORMAL',
        volume: 20,
        includeLinkedZones: false,
    };

    for (const [setting, value] of Object.entries(settings)) {
        await applyAlarmSetting(alarm, setting, value, lookup);
    }

    return alarm;
}
