/**
 * The zone group topology: which speakers belong to the household, at which address, and which of
 * them form a stereo pair.
 *
 * It is read with plain SOAP, because neither library hands it on complete - `sonos-discovery` drops
 * the hidden speakers, e.g. the second speaker of a stereo pair - and it behaves the same under both.
 */
import { decodeXml } from './content-directory';
import { soapCall, soapValue, ZONE_GROUP_TOPOLOGY } from './soap';
import { stereoPairOf, type PairRole, type StereoPair } from './stereo-pairs';

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

/** The speakers of the household */
export interface ZoneTopology {
    /** Members of the zone groups, the hidden speaker of a stereo pair included */
    members: ZoneMember[];
    /** Satellites of a home theater: Sub and surrounds. They are nested in their soundbar. */
    satellites: ZoneMember[];
    /** UUIDs of the speakers that still belong to the household, but are away for a while, e.g. asleep */
    vanished: string[];
}

/**
 * The attributes of all elements with this name
 *
 * @param xml the decoded topology
 * @param tag name of the elements, a regular expression
 */
function elementAttributes(xml: string, tag: string): Record<string, string>[] {
    const list: Record<string, string>[] = [];
    for (const element of xml.matchAll(new RegExp(`<${tag}\\s([^>]*?)\\/?>`, 'g'))) {
        const attrs: Record<string, string> = {};
        for (const [, name, value] of element[1].matchAll(/(\w+)="([^"]*)"/g)) {
            attrs[name] = decodeXml(value);
        }
        list.push(attrs);
    }
    return list;
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
 * The topology is an XML document inside the SOAP answer, so it is decoded once more.
 *
 * @param soapXml the SOAP answer
 */
export function parseZoneGroupState(soapXml: string): ZoneTopology {
    const topology: ZoneTopology = { members: [], satellites: [], vanished: [] };
    const state = soapValue(soapXml, 'ZoneGroupState');
    if (!state) {
        return topology;
    }

    const xml = decodeXml(state);
    const known = new Set<string>();
    const speakers = (tag: string): (ZoneMember & { channelMapSet: string })[] =>
        elementAttributes(xml, tag)
            .filter(attrs => attrs.UUID && !known.has(attrs.UUID) && known.add(attrs.UUID))
            .map(attrs => ({
                uuid: attrs.UUID,
                ip: ipOfLocation(attrs.Location),
                roomName: attrs.ZoneName || '',
                invisible: attrs.Invisible === '1',
                channelMapSet: attrs.ChannelMapSet || '',
            }));

    const members = speakers('ZoneGroupMember');

    // both speakers of a pair carry the map, but one of them is enough
    const pairs = new Map<string, { role: PairRole; partnerUuid: string }>();
    for (const member of members) {
        const pair = stereoPairOf(member.channelMapSet);
        if (pair) {
            pairs.set(pair.left, { role: 'left', partnerUuid: pair.right });
            pairs.set(pair.right, { role: 'right', partnerUuid: pair.left });
        }
    }

    topology.members = members.map(({ channelMapSet: _channelMapSet, ...member }) => {
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

    topology.satellites = speakers('Satellite').map(({ channelMapSet: _channelMapSet, ...satellite }) => satellite);

    // whatever the elements in there are named, each one is a speaker with its UUID
    const vanished = xml.match(/<VanishedDevices>([\s\S]*?)<\/VanishedDevices>/)?.[1] || '';
    topology.vanished = elementAttributes(vanished, '\\w+')
        .map(attrs => attrs.UUID)
        .filter(uuid => uuid && !known.has(uuid));

    return topology;
}

/**
 * Read the topology of the household. Any speaker answers for all of them.
 *
 * @param baseUrl `http://<ip>:1400` of a speaker
 */
export async function readZoneGroupState(baseUrl: string): Promise<ZoneTopology> {
    return parseZoneGroupState(await soapCall(baseUrl, ZONE_GROUP_TOPOLOGY, 'GetZoneGroupState'));
}
