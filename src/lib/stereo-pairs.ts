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
 * room. A single speaker with a Sub has `LF,RF` instead and is no pair. The topology itself is read
 * in `zone-topology.ts`.
 */
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
