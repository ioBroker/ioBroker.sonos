/**
 * Stereo pairs of the household.
 *
 * Two speakers of the same model can be paired to one room: one plays the left channel, the other
 * the right one. SONOS controls the pair through one of them only; the other one is listed as
 * `Invisible="1"` in the zone group topology. `sonos-discovery` drops invisible members, so that
 * speaker never became a player: its channel - if its address was configured - got no values and
 * did not react to commands, and nothing in the object tree told why.
 *
 * Both speakers of a pair carry the same `ChannelMapSet`, e.g.
 * `RINCON_A01400:LF,LF;RINCON_B01400:RF,RF`, with one more `:SW,SW` entry if a Sub belongs to the
 * room. A single speaker with a Sub has `LF,RF` instead and is no pair. The topology is read with
 * plain SOAP, because neither library hands it on complete, and it behaves the same under both.
 */
import { decodeXml } from './content-directory';
import { soapCall, soapValue, ZONE_GROUP_TOPOLOGY } from './soap';

export type PairRole = 'left' | 'right';

/** The stereo pair a speaker belongs to */
export interface StereoPair {
    role: PairRole;
    /** True for the speaker SONOS hides: the pair is controlled through its partner only */
    invisible: boolean;
    partnerUuid: string;
    /** IP address of the partner with dots; empty if the topology does not tell it */
    partnerIp: string;
}

/** One speaker of the zone group topology */
export interface ZoneMember {
    uuid: string;
    /** IP address with dots; empty if the topology does not tell it */
    ip: string;
    roomName: string;
    invisible: boolean;
    /** Set for the speakers of a stereo pair */
    pair?: StereoPair;
}

/**
 * The two speakers of a stereo pair out of a channel map
 *
 * @param channelMapSet e.g. `RINCON_A01400:LF,LF;RINCON_B01400:RF,RF`
 * @returns the uuids of both speakers, or null if the map describes no stereo pair
 */
export function stereoPairOf(channelMapSet: string | undefined): { left: string; right: string } | null {
    let left = '';
    let right = '';

    for (const entry of String(channelMapSet || '').split(';')) {
        const [uuid, channels] = entry.split(':');
        const list = String(channels || '')
            .split(',')
            .map(channel => channel.trim());

        if (list.every(channel => channel === 'LF')) {
            left = uuid.trim();
        } else if (list.every(channel => channel === 'RF')) {
            right = uuid.trim();
        }
    }

    return left && right && left !== right ? { left, right } : null;
}

/**
 * IP address out of the `Location` of a zone member
 *
 * @param location `http://<ip>:1400/xml/device_description.xml`
 */
function ipOfLocation(location: string | undefined): string {
    return String(location || '').match(/^https?:\/\/([^:/]+)/i)?.[1] || '';
}

/**
 * All speakers of the household out of the answer to `GetZoneGroupState`
 *
 * The topology is an XML document inside the SOAP answer, so it is decoded once more. Satellites
 * of a home theater are nested elements of their soundbar and are not listed.
 *
 * @param soapXml the SOAP answer
 */
export function parseZoneGroupState(soapXml: string): ZoneMember[] {
    const state = soapValue(soapXml, 'ZoneGroupState');
    if (!state) {
        return [];
    }

    const members: (ZoneMember & { channelMapSet: string })[] = [];

    for (const element of decodeXml(state).matchAll(/<ZoneGroupMember\s([^>]*?)\/?>/g)) {
        const attrs: Record<string, string> = {};
        for (const [, name, value] of element[1].matchAll(/(\w+)="([^"]*)"/g)) {
            attrs[name] = decodeXml(value);
        }

        if (!attrs.UUID || members.some(member => member.uuid === attrs.UUID)) {
            continue;
        }

        members.push({
            uuid: attrs.UUID,
            ip: ipOfLocation(attrs.Location),
            roomName: attrs.ZoneName || '',
            invisible: attrs.Invisible === '1',
            channelMapSet: attrs.ChannelMapSet || '',
        });
    }

    // both speakers of a pair carry the map, but one of them is enough
    const pairs = new Map<string, { role: PairRole; partnerUuid: string }>();
    for (const member of members) {
        const pair = stereoPairOf(member.channelMapSet);
        if (pair) {
            pairs.set(pair.left, { role: 'left', partnerUuid: pair.right });
            pairs.set(pair.right, { role: 'right', partnerUuid: pair.left });
        }
    }

    return members.map(({ channelMapSet: _channelMapSet, ...member }) => {
        const pair = pairs.get(member.uuid);
        if (pair) {
            member.pair = {
                role: pair.role,
                invisible: member.invisible,
                partnerUuid: pair.partnerUuid,
                partnerIp: members.find(item => item.uuid === pair.partnerUuid)?.ip || '',
            };
        }
        return member;
    });
}

/**
 * Read the topology of the household. Any speaker answers for all of them.
 *
 * @param baseUrl `http://<ip>:1400` of a speaker
 */
export async function readZoneGroupState(baseUrl: string): Promise<ZoneMember[]> {
    return parseZoneGroupState(await soapCall(baseUrl, ZONE_GROUP_TOPOLOGY, 'GetZoneGroupState'));
}

/**
 * Description of the channel of a paired speaker, shown in the object tree
 *
 * @param pair the pair of the speaker
 * @param partner how the partner is named, e.g. its IP address
 */
export function pairDescription(pair: StereoPair, partner: string): ioBroker.Translated {
    if (pair.invisible) {
        return pair.role === 'left'
            ? {
                  en: `Left speaker of the stereo pair with ${partner} - SONOS controls the pair through ${partner} only`,
                  de: `Linker Lautsprecher des Stereopaars mit ${partner} - SONOS steuert das Paar nur über ${partner}`,
              }
            : {
                  en: `Right speaker of the stereo pair with ${partner} - SONOS controls the pair through ${partner} only`,
                  de: `Rechter Lautsprecher des Stereopaars mit ${partner} - SONOS steuert das Paar nur über ${partner}`,
              };
    }

    return pair.role === 'left'
        ? {
              en: `Left speaker of the stereo pair with ${partner} - controls the pair`,
              de: `Linker Lautsprecher des Stereopaars mit ${partner} - steuert das Paar`,
          }
        : {
              en: `Right speaker of the stereo pair with ${partner} - controls the pair`,
              de: `Rechter Lautsprecher des Stereopaars mit ${partner} - steuert das Paar`,
          };
}
