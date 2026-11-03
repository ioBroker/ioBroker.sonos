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
 */
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
            this.channels.set(ipChannel, uuid);
            this.byUuid.set(uuid, ipChannel);
            this.onBind(ipChannel, uuid);
        }
        return ipChannel;
    }
}
