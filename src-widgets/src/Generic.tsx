import type { VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import type { SonosRoomInfo } from './types';

/** States that both widgets read for the room they show. */
export const ROOM_STATES = [
    'alive',
    'current_album',
    'current_artist',
    'current_cover',
    'current_duration',
    'current_elapsed',
    'current_station',
    'current_title',
    'current_type',
    'coordinator',
    'group_volume',
    'membersChannels',
    'muted',
    'night_mode',
    'repeat',
    'seek',
    'shuffle',
    'speech_enhancement',
    'state_simple',
    'volume',
] as const;

/**
 * Base class of the SONOS vis-2 widgets.
 *
 * `window.visRxWidget` is provided by the vis-2 runtime and must not be imported as a value:
 * a second copy of the base class would not be recognised by vis-2.
 */
export default class Generic<
    RxData extends Record<string, any>,
    State extends Partial<VisRxWidgetState> = VisRxWidgetState,
> extends (window.visRxWidget as typeof VisRxWidget)<RxData, State> {
    /** Prepended to every i18n key of this widget set, see `translations.ts` */
    static getI18nPrefix(): string {
        return 'sonos_';
    }

    /**
     * `sonos.<instance>`.
     *
     * The `instance` attribute is short, so it holds `0` and not `sonos.0`. Views that were built
     * with the vis-1 widget store the instance in `oid` instead (`sonos.0`), and this widget
     * replaces that one under the same template id - so that value has to keep working.
     */
    getNamespace(): string {
        const rxData = this.state.rxData as { instance?: string | number; oid?: string };

        if (rxData.instance !== undefined && rxData.instance !== null && rxData.instance !== '') {
            return `sonos.${parseInt(String(rxData.instance), 10) || 0}`;
        }

        const legacy = String(rxData.oid || '').match(/^sonos\.(\d+)/);
        return `sonos.${legacy ? parseInt(legacy[1], 10) : 0}`;
    }

    /** `sonos.<instance>.root.<ip>.<name>` */
    getRoomStateId(ip: string, name: string): string {
        return `${this.getNamespace()}.root.${ip}.${name}`;
    }

    /**
     * All SONOS devices of the instance, sorted by name.
     *
     * The adapter creates one channel per device under `root`, named after the configured
     * device name and falling back to the IP address.
     */
    async loadRooms(): Promise<SonosRoomInfo[]> {
        const prefix = `${this.getNamespace()}.root.`;
        const channels = await this.props.context.socket.getObjectViewSystem(
            'channel',
            prefix,
            `${prefix}香`,
        );

        const rooms: SonosRoomInfo[] = [];
        Object.keys(channels || {}).forEach(id => {
            const ip = id.substring(prefix.length);
            // only direct children, no nested channels
            if (!ip || ip.includes('.')) {
                return;
            }
            rooms.push({ id, ip, name: Generic.getText(channels[id]?.common?.name) || ip });
        });

        return rooms.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * The room that actually plays for `ip`: its group coordinator if it is a slave,
     * otherwise the room itself.
     *
     * @param ip channel name of the room
     * @param values state cache to read `coordinator` from
     */
    static getCoordinator(ip: string, values: Record<string, any>, namespace: string): string {
        const coordinator = String(values[`${namespace}.root.${ip}.coordinator.val`] || '').trim();
        return coordinator && coordinator !== ip ? coordinator : ip;
    }
}
