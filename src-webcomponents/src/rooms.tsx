/**
 * Every SONOS speaker of an instance as a web component: `<iob-sonos-rooms>`.
 *
 * The "SONOS rooms" of ioBroker.devices for every host: what each speaker plays, play/pause, its volume, its source
 * selection and the grouping. A low box shows how many speakers play and opens the list in a dialog of the host.
 *
 * The speakers are found in the object tree, not in the configuration of the adapter: every direct channel below
 * `sonos.<instance>.root.` is one (`getObjectViewSystem`, read once). Grouping as in the native widget: the link
 * button of a speaker picks it as the master, the link button of every other one then writes it to
 * `add_to_group` / `remove_from_group` of the master; the master once more leaves the mode.
 *
 * React is not in the module: it comes from `lib/esm/react-19.js` beside `adapter/`, see `vite.config.ts`.
 */
import type { ReactNode } from 'react';

import { defineWebComponent } from '@iobroker/web-components/element';

import {
    COMPONENTS,
    coordinatorOf,
    getNamespace,
    ROOMS_STATES,
    splitMembers,
    stateId,
    type RoomsSettings,
} from './constants';
import { Hint } from './controls';
import { RoomsView, type RoomRow } from './RoomsView';
import { SonosElement } from './SonosElement';
import { ROOMS_CSS } from './styles';

class SonosRooms extends SonosElement<RoomsSettings> {
    /** The speaker picked as the master of a group while the user links others to it */
    #linkMaster: string | null = null;

    /** The instance `#linkMaster` belongs to */
    #linkNamespace = '';

    constructor() {
        super(ROOMS_CSS);
    }

    protected getRoomsNamespace(settings: RoomsSettings): string | null {
        return getNamespace(settings.instance);
    }

    protected getWantedStateIds(settings: RoomsSettings): string[] {
        const namespace = getNamespace(settings.instance);
        const rooms = this.rooms;
        if (!namespace || !rooms) {
            return [];
        }
        return rooms.flatMap(item => ROOMS_STATES.map(name => stateId(namespace, item.room, name)));
    }

    /** The speakers that follow `master`, `master` included */
    #getMembers(namespace: string, master: string): string[] {
        const members = splitMembers(this.stateValue(namespace, master, 'membersChannels'));
        return members.includes(master) ? members : [master, ...members];
    }

    #getRows(namespace: string): RoomRow[] | null {
        const rooms = this.rooms;
        if (!rooms) {
            return null;
        }
        const master = this.#linkMaster;
        const linked = master ? this.#getMembers(namespace, master) : [];
        const rows = rooms.map(item => {
            const val = (name: string): ioBroker.StateValue | undefined => this.stateValue(namespace, item.room, name);
            const text = (name: string): string => {
                const value = val(name);
                return value === null || value === undefined ? '' : String(value);
            };
            return {
                room: item.room,
                name: item.name,
                color: item.color,
                icon: item.icon,
                alive: val('alive') !== false,
                playing: val('state_simple') === true,
                muted: val('muted') === true,
                volume: Number(val('volume')) || 0,
                grouped: coordinatorOf(item.room, val('coordinator')) !== item.room,
                playingText: [text('current_title'), text('current_artist')].filter(Boolean).join(' · '),
                linked: !!master && master !== item.room && linked.includes(item.room),
            };
        });
        return this.settings.hideOffline ? rows.filter(row => row.alive) : rows;
    }

    /**
     * The link button. The first click picks the speaker as the group master; every further click on another one
     * adds it to that group or removes it again. The master once more leaves the mode.
     */
    #onLink(namespace: string, room: string): void {
        if (this.editMode) {
            return;
        }
        const master = this.#linkMaster;
        if (!master || master === room) {
            this.#linkMaster = master === room ? null : room;
            this.render();
            return;
        }
        const joined = this.#getMembers(namespace, master).includes(room);
        void this.setState(stateId(namespace, master, joined ? 'remove_from_group' : 'add_to_group'), room);
    }

    #view(namespace: string, dialog: boolean): ReactNode {
        const settings = this.settings;
        const title = settings.title || this.word('sonosdm_rooms_title');
        return (
            <RoomsView
                title={title}
                rows={this.#getRows(namespace)}
                showVolume={settings.showVolume !== false}
                showSource={settings.showSource !== false}
                allowGrouping={settings.allowGrouping !== false}
                linkMaster={this.#linkMaster}
                accent={this.accent}
                editMode={this.editMode}
                dialog={dialog}
                word={this.word}
                onPlay={(room, play) => void this.setState(stateId(namespace, room, 'state_simple'), play)}
                onVolume={(room, volume) => void this.setState(stateId(namespace, room, 'volume'), volume)}
                onLink={room => this.#onLink(namespace, room)}
                onSource={(room, name) => void this.openSources({ namespace, room }, name)}
                onOpenList={() => {
                    void this.openInDialog(title, ROOMS_CSS, 560, () => this.#view(namespace, true)).finally(() => {
                        // a group being formed in the dialog ends with it
                        this.#linkMaster = null;
                        if (this.isConnected) {
                            this.render();
                        }
                    });
                }}
            />
        );
    }

    protected draw(): ReactNode {
        const namespace = getNamespace(this.settings.instance);
        if (!namespace) {
            return (
                <Hint
                    text={this.word('wc_choose_instance')}
                    icon="speakers"
                    editMode={this.editMode}
                />
            );
        }
        if (namespace !== this.#linkNamespace) {
            this.#linkNamespace = namespace;
            this.#linkMaster = null;
        }
        return this.#view(namespace, false);
    }
}

defineWebComponent(COMPONENTS.rooms.tag, SonosRooms);
