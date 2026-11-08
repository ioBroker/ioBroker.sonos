/**
 * One SONOS speaker as a web component: `<iob-sonos-player>`.
 *
 * One module for every host - vis-2, devices, Aura, admin (`@iobroker/web-components`). Its manifest is a file of
 * its own (`sonos-player.json`, written by the build from `manifests.ts`), so a host loads this module only when it
 * shows the element. It is the "SONOS player" of ioBroker.devices and the "Sonos player" of vis-2 in one: cover,
 * title, progress, transport, volume and the source selection of one speaker, optionally the chips to switch to
 * another speaker of the instance and the toggles of its group. The parts follow the size of the box; in a strip a
 * button opens the whole player in a dialog of the host.
 *
 * The element reads and writes the states of the channel `sonos.<instance>.root.<room>` the setting `room` names -
 * the instance comes from that ID. Group changes are written to `add_to_group` / `remove_from_group` of the group
 * coordinator, like the native widgets do.
 *
 * React is not in the module: it comes from `lib/esm/react-19.js` beside `adapter/`, see `vite.config.ts`.
 */
import type { ReactNode } from 'react';

import { defineWebComponent } from '@iobroker/web-components/element';

import {
    COMPONENTS,
    coordinatorOf,
    getName,
    parseRoomId,
    PLAYER_STATES,
    splitMembers,
    stateId,
    type PlayerSettings,
    type RoomTarget,
} from './constants';
import { Hint } from './controls';
import {
    getPlayerValues,
    PlayerView,
    type PlayerGroupMember,
    type PlayerRoomChip,
    type PlayerValues,
} from './PlayerView';
import { SonosElement } from './SonosElement';
import { PLAYER_CSS } from './styles';

class SonosPlayer extends SonosElement<PlayerSettings> {
    /** The setting `room` the speaker below was taken from */
    #settingsRoom: string | undefined = undefined;

    /** The speaker shown: the one of the settings, or the one the user switched to with a chip */
    #target: RoomTarget | null = null;

    constructor() {
        super(PLAYER_CSS);
    }

    /**
     * The speaker shown. A new setting `room` replaces the one the user switched to, and so do settings without
     * the chips - there would be no way back.
     */
    #getTarget(settings: PlayerSettings): RoomTarget | null {
        if (settings.room !== this.#settingsRoom || !settings.showRooms) {
            this.#settingsRoom = settings.room;
            this.#target = parseRoomId(settings.room);
        }
        return this.#target;
    }

    protected getRoomsNamespace(settings: PlayerSettings): string | null {
        const target = this.#getTarget(settings);
        return target && (settings.showRooms || settings.showGroups) ? target.namespace : null;
    }

    protected getWantedStateIds(settings: PlayerSettings): string[] {
        const target = this.#getTarget(settings);
        if (!target) {
            return [];
        }
        const { namespace, room } = target;
        const ids: string[] = PLAYER_STATES.map(name => stateId(namespace, room, name));
        const rooms = this.rooms;
        if (settings.showRooms && rooms) {
            rooms.forEach(item => ids.push(stateId(namespace, item.room, 'alive')));
        }
        if (settings.showGroups) {
            // the members of the group are listed by its coordinator
            const coordinator = coordinatorOf(room, this.stateValue(namespace, room, 'coordinator'));
            ids.push(stateId(namespace, coordinator, 'membersChannels'));
        }
        return ids;
    }

    /** The channel of the speaker, for its name */
    protected override getObjectIds(settings: PlayerSettings): string[] {
        const target = this.#getTarget(settings);
        return target ? [`${target.namespace}.root.${target.room}`] : [];
    }

    /** The values of the speaker shown */
    #getValues(target: RoomTarget, settings: PlayerSettings): PlayerValues {
        const { namespace, room } = target;
        const channel = this.objects[`${namespace}.root.${room}`];
        const name =
            (target.room === parseRoomId(settings.room)?.room && settings.title) ||
            getName(channel?.common?.name, this.systemLang) ||
            this.rooms?.find(item => item.room === room)?.name ||
            room;
        return getPlayerValues(
            room,
            name,
            state => this.stateValue(namespace, room, state),
            this.states[stateId(namespace, room, 'current_cover')]?.ts,
            settings.showCover !== false,
        );
    }

    #getRoomChips(target: RoomTarget, settings: PlayerSettings): PlayerRoomChip[] | null {
        const rooms = this.rooms;
        if (!settings.showRooms || !rooms) {
            return null;
        }
        return rooms.map(item => ({
            room: item.room,
            name: item.name,
            alive: this.stateValue(target.namespace, item.room, 'alive') !== false,
            selected: item.room === target.room,
        }));
    }

    #getGroup(target: RoomTarget, settings: PlayerSettings): PlayerGroupMember[] | null {
        const rooms = this.rooms;
        if (!settings.showGroups || !rooms) {
            return null;
        }
        const { namespace, room } = target;
        const coordinator = coordinatorOf(room, this.stateValue(namespace, room, 'coordinator'));
        const members = splitMembers(this.stateValue(namespace, coordinator, 'membersChannels'));
        return rooms.map(item => ({
            room: item.room,
            name: item.name,
            member: item.room === coordinator || members.includes(item.room),
            coordinator: item.room === coordinator,
        }));
    }

    #view(target: RoomTarget, dialog: boolean): ReactNode {
        const settings = this.settings;
        const values = this.#getValues(target, settings);
        const { namespace, room } = target;
        return (
            <PlayerView
                values={values}
                showCover={settings.showCover !== false}
                showSeek={settings.showSeek !== false}
                showModes={settings.showModes !== false}
                showVolume={settings.showVolume !== false}
                showSource={settings.showSource !== false}
                rooms={this.#getRoomChips(target, settings)}
                group={this.#getGroup(target, settings)}
                accent={this.accent}
                editMode={this.editMode}
                dialog={dialog}
                word={this.word}
                onCommand={(name, value) => void this.setState(stateId(namespace, room, name), value)}
                onGroup={(member, join) => {
                    const coordinator = coordinatorOf(room, this.stateValue(namespace, room, 'coordinator'));
                    void this.setState(
                        stateId(namespace, coordinator, join ? 'add_to_group' : 'remove_from_group'),
                        member,
                    );
                }}
                onSelectRoom={next => {
                    if (!this.editMode && next !== room) {
                        this.#target = { namespace, room: next };
                        this.resubscribe();
                    }
                }}
                onOpenSources={() => void this.openSources(target, values.name)}
                onOpenPlayer={
                    dialog
                        ? undefined
                        : () =>
                              void this.openInDialog(values.name, PLAYER_CSS, 440, () =>
                                  // the speaker shown now - the user may switch to another one in the dialog
                                  this.#target ? this.#view(this.#target, true) : null,
                              )
                }
            />
        );
    }

    protected draw(): ReactNode {
        const settings = this.settings;
        const target = this.#getTarget(settings);
        if (!target) {
            return (
                <Hint
                    text={this.word(settings.room ? 'wc_not_speaker' : 'wc_choose_speaker')}
                    icon="music"
                    editMode={this.editMode}
                />
            );
        }
        return this.#view(target, false);
    }
}

defineWebComponent(COMPONENTS.player.tag, SonosPlayer);
