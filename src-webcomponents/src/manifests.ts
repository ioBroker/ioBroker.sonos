/**
 * The manifests of the components. Read by the build only (`vite.config.ts`), which writes them as
 * `sonos-player.json`, `sonos-rooms.json` and `sonos-control.json` next to the modules - a host reads those files for
 * its palette and its settings without loading a module.
 */
import type { WebComponentManifest, WebComponentText } from '@iobroker/web-components';

// with the extension: `vite.config.ts` imports this file, and Vite may load its config natively
import { COMPONENTS, type ComponentName } from './constants.ts';
import { LANGUAGES, type WordKey } from './texts.ts';

/**
 * The components that are a native ioBroker.devices widget as well. The control centre is none: it is the Control
 * tab of the instance settings, so it has a name of its own and every host shows it.
 */
export type NativeComponentName = Exclude<ComponentName, 'control'>;

/** What the native ioBroker.devices widget of a component is called: `common.deviceWidgets.components[]` */
export interface NativeWidget {
    label: WebComponentText;
    description?: WebComponentText;
}

/**
 * A text in every language. The label of a native widget may be one string for all languages: the component is
 * then called exactly so in every language as well.
 *
 * @param text a string or `{ en, de, ... }`
 */
function inAllLanguages(text: WebComponentText): ioBroker.Translated {
    const result = {} as ioBroker.Translated;
    for (const lang of LANGUAGES) {
        result[lang] = typeof text === 'string' ? text : text[lang] || text.en;
    }
    return result;
}

/**
 * The manifests
 *
 * @param word a word of `texts.ts` in every language
 * @param native the ioBroker.devices widgets of the adapter: the components are called like them, so that
 *   ioBroker.devices (and vis-2, where the names are the same) offer the native widget instead
 */
export function buildManifests(
    word: (key: WordKey) => ioBroker.Translated,
    native: Record<NativeComponentName, NativeWidget>,
): Record<ComponentName, WebComponentManifest> {
    const accent = {
        type: 'color',
        label: word('wc_accent'),
        help: word('wc_accent_help'),
    } as const;

    const player: WebComponentManifest = {
        $schema: 'https://raw.githubusercontent.com/ioBroker/web-components/main/schemas/manifest.json',
        manifestVersion: 1,
        tag: COMPONENTS.player.tag,
        name: inAllLanguages(native.player.label),
        description: native.player.description,
        // relative to this file: the picture of the ioBroker.devices widget
        icon: '../dm-widgets/player.png',
        module: COMPONENTS.player.module,
        size: { width: 400, height: 240 },
        settings: {
            type: 'panel',
            items: {
                room: {
                    type: 'objectId',
                    types: 'channel',
                    // every instance of the adapter; the element takes the instance from the ID
                    root: 'sonos',
                    label: word('sonosdm_room'),
                    help: word('wc_room_help'),
                },
                title: { type: 'text', label: word('sonosdm_name'), help: word('wc_title_help') },
                showCover: { type: 'checkbox', default: true, label: word('sonosdm_showCover') },
                showSeek: { type: 'checkbox', default: true, label: word('sonosdm_showSeek') },
                showModes: { type: 'checkbox', default: true, label: word('sonosdm_showModes') },
                showVolume: { type: 'checkbox', default: true, label: word('sonosdm_showVolume') },
                showSource: { type: 'checkbox', default: true, label: word('sonosdm_showSource') },
                showRooms: { type: 'checkbox', default: false, label: word('vis_show_rooms') },
                showGroups: { type: 'checkbox', default: false, label: word('vis_show_groups') },
                accent,
            },
        },
    };

    const rooms: WebComponentManifest = {
        $schema: 'https://raw.githubusercontent.com/ioBroker/web-components/main/schemas/manifest.json',
        manifestVersion: 1,
        tag: COMPONENTS.rooms.tag,
        name: inAllLanguages(native.rooms.label),
        description: native.rooms.description,
        icon: '../dm-widgets/rooms.png',
        module: COMPONENTS.rooms.module,
        size: { width: 400, height: 300 },
        settings: {
            type: 'panel',
            items: {
                instance: { type: 'instance', adapter: 'sonos', default: 'sonos.0', label: word('sonosdm_instance') },
                title: { type: 'text', label: word('sonosdm_name'), help: word('wc_rooms_title_help') },
                showVolume: { type: 'checkbox', default: true, label: word('sonosdm_showVolume') },
                showSource: { type: 'checkbox', default: true, label: word('sonosdm_showSource') },
                allowGrouping: { type: 'checkbox', default: true, label: word('sonosdm_allowGrouping') },
                hideOffline: { type: 'checkbox', default: false, label: word('sonosdm_hideOffline') },
                accent,
            },
        },
    };

    const control: WebComponentManifest = {
        $schema: 'https://raw.githubusercontent.com/ioBroker/web-components/main/schemas/manifest.json',
        manifestVersion: 1,
        tag: COMPONENTS.control.tag,
        name: word('wc_control_name'),
        description: word('wc_control_description'),
        icon: '../sonos.png',
        module: COMPONENTS.control.module,
        size: { width: 800, height: 520 },
        settings: {
            type: 'panel',
            items: {
                instance: { type: 'instance', adapter: 'sonos', default: 'sonos.0', label: word('sonosdm_instance') },
                room: {
                    type: 'objectId',
                    types: 'channel',
                    root: 'sonos',
                    label: word('wc_start_room'),
                    help: word('wc_start_room_help'),
                },
                showRooms: { type: 'checkbox', default: true, label: word('wc_show_speakers') },
                showGroups: { type: 'checkbox', default: true, label: word('vis_show_groups') },
                showLibrary: { type: 'checkbox', default: true, label: word('vis_show_library') },
                accent,
            },
        },
    };

    return { player, rooms, control };
}
