/**
 * Which channel belongs to which speaker (#140).
 *
 * The channels are named after the IP address the speaker had when it was configured
 * (`root.192_168_1_50`), and a speaker was found again only by its current address. When the router
 * handed out a new address, the speaker lost its channel - every script and every view that used it
 * stopped working - and another speaker that got the old address took the channel over.
 *
 * The registry remembers the speaker of every channel by its UUID (`RINCON_...`), which never changes:
 * the first time a speaker is found at the address of a channel, the channel is bound to it. From then
 * on the speaker keeps its channel under any address, and the address of the channel cannot be taken
 * over by another speaker. The channel ids stay as they are, so nothing changes for existing scripts.
 *
 * A speaker that replaces another one, e.g. a new model with the fixed address of the old one, takes
 * the channel over once the old speaker is no longer part of the SONOS system, see {@link ChannelRegistry.takeOver}.
 */

/** A speaker found at the address of a channel that is bound to another speaker */
export interface ChannelConflict {
    channel: string;
    /** UUID of the speaker the channel is bound to */
    owner: string;
    /** UUID of the speaker at the address of the channel */
    uuid: string;
}

export class ChannelRegistry {
    /** Configured channels, with the UUID of their speaker once it is known */
    private readonly channels = new Map<string, string>();
    /** Channel of every known speaker */
    private readonly byUuid = new Map<string, string>();
    /** Speakers whose new address was already reported, so that it is logged once */
    private readonly reportedMoves = new Set<string>();

    /**
     * @param onBind called when a channel is bound to its speaker for the first time, to store it
     * @param onMoved called once when a speaker is found under another address than its channel name
     */
    constructor(
        private readonly onBind: (channel: string, uuid: string) => void,
        private readonly onMoved?: (channel: string, uuid: string, ipChannel: string) => void,
    ) {}

    /** Forget all channels, e.g. before the configuration is read again */
    clear(): void {
        this.channels.clear();
        this.byUuid.clear();
    }

    /**
     * A configured channel
     *
     * @param channel the channel name, e.g. `192_168_1_50`
     * @param uuid the UUID of its speaker, if it was stored before
     */
    addChannel(channel: string, uuid?: string): void {
        this.channels.set(channel, uuid || '');
        if (uuid) {
            this.byUuid.set(uuid, channel);
        }
    }

    /** UUID of the speaker of a channel, or an empty string if it is not known yet */
    uuidOf(channel: string): string {
        return this.channels.get(channel) || '';
    }

    /**
     * The channel of a speaker
     *
     * @param uuid UUID of the speaker
     * @param ipChannel its current IP address with underscores
     * @returns the channel name, or null if the address belongs to the channel of another speaker
     */
    resolve(uuid: string, ipChannel: string | null): string | null {
        const known = uuid ? this.byUuid.get(uuid) : undefined;
        if (known) {
            if (ipChannel && ipChannel !== known && !this.reportedMoves.has(`${uuid}/${ipChannel}`)) {
                this.reportedMoves.add(`${uuid}/${ipChannel}`);
                this.onMoved?.(known, uuid, ipChannel);
            }
            return known;
        }

        if (!ipChannel) {
            return null;
        }

        const owner = this.channels.get(ipChannel);
        if (owner === undefined) {
            // not configured - the name is still the address, as before
            return ipChannel;
        }
        if (owner && owner !== uuid) {
            // the speaker of this channel moved to another address, and this one got the old one
            return null;
        }
        if (!owner && uuid) {
            this.bind(ipChannel, uuid);
        }
        return ipChannel;
    }

    /**
     * Give the channels of replaced speakers to the speakers that have their address now.
     *
     * A channel stays with its speaker as long as that speaker belongs to the SONOS system, also under
     * another address. Once it does not - it was removed, e.g. because a new speaker replaced it - a
     * speaker found at the address of the channel takes the channel over, if it has none of its own.
     *
     * @param speakers the speakers of the system, with their current address with underscores
     * @param isPresent tells if a speaker still belongs to the system, also while it is away for a while
     * @returns the channels taken over, and those kept by their speaker because it is still there
     */
    takeOver(
        speakers: { uuid: string; ipChannel: string | null }[],
        isPresent: (uuid: string) => boolean,
    ): { taken: ChannelConflict[]; kept: ChannelConflict[] } {
        const taken: ChannelConflict[] = [];
        const kept: ChannelConflict[] = [];

        for (const { uuid, ipChannel } of speakers) {
            if (!uuid || !ipChannel || this.byUuid.has(uuid)) {
                continue;
            }
            const owner = this.channels.get(ipChannel);
            if (!owner || owner === uuid) {
                continue;
            }

            if (isPresent(owner)) {
                kept.push({ channel: ipChannel, owner, uuid });
            } else {
                this.byUuid.delete(owner);
                this.bind(ipChannel, uuid);
                taken.push({ channel: ipChannel, owner, uuid });
            }
        }

        return { taken, kept };
    }

    private bind(channel: string, uuid: string): void {
        this.channels.set(channel, uuid);
        this.byUuid.set(uuid, channel);
        this.onBind(channel, uuid);
    }
}
