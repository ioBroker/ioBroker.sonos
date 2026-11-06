/**
 * The SONOS control centre as a web component: `<iob-sonos-control>`.
 *
 * The Control tab of the instance settings (`src-admin/src/SonosControlComponent.tsx`) for every host - Aura, vis-2,
 * devices, admin: every speaker of an instance with what it plays, and for the selected one the player (cover,
 * title, transport, progress, volume), its group (members, group volume) and its library (favorites, playlists,
 * queue, recently played, the music services). The layout follows the box, see `ControlView`.
 *
 * Like the tab, it talks to the states of `sonos.<instance>.root.<room>` only:
 *
 *     state_simple / prev / next / seek / volume / muted    transport
 *     current_*                                             what is playing
 *     coordinator / membersChannels / add_to_group / ...    groups
 *     favorites_* / playlist_* / queue / recent_tracks      the library
 *     media_browse / media_browse_result / media_play       browsing the music services
 *
 * The library of a member of a group is written to the channel of its coordinator, so it is read from there (see
 * `SourceBrowser`). The speakers are found in the object tree: every direct channel below `sonos.<instance>.root.`
 * (`getObjectViewSystem`, read once and again with the refresh button).
 *
 * React is not in the module: it comes from `lib/esm/react-19.js` beside `adapter/`, see `vite.config.ts`.
 */
import type { ReactNode } from 'react';

import { defineWebComponent } from '@iobroker/web-components/element';

import {
    COMPONENTS,
    coordinatorOf,
    getNamespace,
    LIBRARY_STATES,
    parseRoomId,
    PLAYER_STATES,
    ROOMS_STATES,
    splitMembers,
    stateId,
    type ControlSettings,
    type RoomTarget,
    type SonosRoom,
} from './constants';
import { ControlView, type GroupValues, type SpeakerRow } from './ControlView';
import { Button, Hint } from './controls';
import { getPlayerValues, PlayerView } from './PlayerView';
import { SonosElement } from './SonosElement';
import { SourceBrowser } from './SourceBrowser';
import { CONTROL_CSS, PLAYER_CSS } from './styles';

/** `sonos.<n>`: the instance of the settings, else the one of the speaker of the settings */
function namespaceOf(settings: ControlSettings): string | null {
    return getNamespace(settings.instance) || parseRoomId(settings.room)?.namespace || null;
}

class SonosControl extends SonosElement<ControlSettings> {
    /** The speaker the user picked in the list */
    #picked: RoomTarget | null = null;

    /** The setting `room` the selection was taken from: a new one replaces what the user picked */
    #settingsRoom: string | undefined = undefined;

    constructor() {
        super(CONTROL_CSS);
    }

    /**
     * The selected speaker: the one the user picked, else the one of the settings, else the first of the instance.
     * A speaker that is no longer in the object tree is not selected.
     */
    #getSelected(settings: ControlSettings): string | null {
        const namespace = namespaceOf(settings);
        if (!namespace) {
            return null;
        }
        if (settings.room !== this.#settingsRoom) {
            this.#settingsRoom = settings.room;
            this.#picked = null;
        }
        const rooms = this.rooms;
        // while the speakers are read, the one of the settings is taken as it is
        const known = (room: string | undefined): room is string =>
            !!room && (!rooms || rooms.some(item => item.room === room));

        const picked = this.#picked?.namespace === namespace ? this.#picked.room : undefined;
        if (known(picked)) {
            return picked;
        }
        const start = parseRoomId(settings.room);
        if (start?.namespace === namespace && known(start.room)) {
            return start.room;
        }
        return rooms?.[0]?.room ?? null;
    }

    protected getRoomsNamespace(settings: ControlSettings): string | null {
        return namespaceOf(settings);
    }

    protected getWantedStateIds(settings: ControlSettings): string[] {
        const namespace = namespaceOf(settings);
        if (!namespace) {
            return [];
        }
        // a stopped instance leaves the states as they were: the element says so instead
        const ids = [`system.adapter.${namespace}.alive`];
        const rooms = this.rooms;
        if (rooms && settings.showRooms !== false) {
            for (const item of rooms) {
                ROOMS_STATES.forEach(name => ids.push(stateId(namespace, item.room, name)));
            }
        }
        const room = this.#getSelected(settings);
        if (!room) {
            return ids;
        }
        PLAYER_STATES.forEach(name => ids.push(stateId(namespace, room, name)));
        const coordinator = coordinatorOf(room, this.stateValue(namespace, room, 'coordinator'));
        if (settings.showGroups !== false) {
            // the members are listed by the coordinator; the adapter writes the group volume to every member
            ids.push(stateId(namespace, coordinator, 'membersChannels'), stateId(namespace, room, 'group_volume'));
        }
        if (settings.showLibrary !== false) {
            for (const name of LIBRARY_STATES) {
                ids.push(stateId(namespace, room, name));
                if (coordinator !== room) {
                    ids.push(stateId(namespace, coordinator, name));
                }
            }
        }
        return ids;
    }

    #getSpeakers(namespace: string, rooms: SonosRoom[]): SpeakerRow[] {
        return rooms.map(item => {
            const val = (name: string): ioBroker.StateValue | undefined => this.stateValue(namespace, item.room, name);
            const text = (name: string): string => {
                const value = val(name);
                return value === null || value === undefined ? '' : String(value);
            };
            return {
                room: item.room,
                name: item.name,
                color: item.color,
                alive: val('alive') !== false,
                playing: val('state_simple') === true,
                volume: Number(val('volume')) || 0,
                playingText: [text('current_title'), text('current_artist')].filter(Boolean).join(' · '),
                grouped:
                    coordinatorOf(item.room, val('coordinator')) !== item.room ||
                    splitMembers(val('membersChannels')).some(member => member !== item.room),
            };
        });
    }

    #getGroup(namespace: string, room: string, rooms: SonosRoom[]): GroupValues {
        const coordinator = coordinatorOf(room, this.stateValue(namespace, room, 'coordinator'));
        const members = splitMembers(this.stateValue(namespace, coordinator, 'membersChannels'));
        const grouped = coordinator !== room || members.some(member => member !== coordinator);
        const volume = this.stateValue(namespace, room, 'group_volume');
        return {
            members: rooms.map(item => ({
                room: item.room,
                name: item.name,
                member: item.room === coordinator || members.includes(item.room),
                coordinator: item.room === coordinator,
            })),
            follows: coordinator === room ? '' : rooms.find(item => item.room === coordinator)?.name || coordinator,
            volume: grouped && volume !== null && volume !== undefined ? Number(volume) || 0 : null,
            disabled: this.stateValue(namespace, room, 'alive') === false,
        };
    }

    /**
     * The player of a speaker
     *
     * @param target the speaker
     * @param dialog inside the dialog the player opens in a low part
     */
    #player(target: RoomTarget, dialog: boolean): ReactNode {
        const { namespace, room } = target;
        const name = this.rooms?.find(item => item.room === room)?.name || room;
        const values = getPlayerValues(
            room,
            name,
            state => this.stateValue(namespace, room, state),
            this.states[stateId(namespace, room, 'current_cover')]?.ts,
        );
        const showLibrary = this.settings.showLibrary !== false;
        return (
            <PlayerView
                values={values}
                showCover
                showSeek
                showModes
                showVolume
                // without the library inline, the source selection opens in a dialog
                showSource={!showLibrary}
                rooms={null}
                group={null}
                accent={this.accent}
                editMode={this.editMode}
                dialog={dialog}
                word={this.word}
                onCommand={(state, value) => void this.setState(stateId(namespace, room, state), value)}
                onGroup={() => undefined}
                onSelectRoom={() => undefined}
                onOpenSources={() => void this.openSources(target, values.name)}
                onOpenPlayer={
                    dialog
                        ? undefined
                        : () =>
                              void this.openInDialog(values.name, PLAYER_CSS, 440, () => {
                                  // the speaker selected now
                                  const current = this.#getSelected(this.settings);
                                  return current ? this.#player({ namespace, room: current }, true) : null;
                              })
                }
            />
        );
    }

    protected draw(): ReactNode {
        const settings = this.settings;
        const word = this.word;
        const namespace = namespaceOf(settings);
        if (!namespace) {
            return (
                <Hint
                    text={word('wc_choose_instance')}
                    icon="speakers"
                    editMode={this.editMode}
                />
            );
        }
        if (this.states[`system.adapter.${namespace}.alive`]?.val === false) {
            return (
                <Hint
                    text={word('sonos_ctrl_instance_not_running')}
                    icon="speakers"
                    editMode={this.editMode}
                />
            );
        }
        const rooms = this.rooms;
        if (!rooms) {
            // the speakers are being read
            return <div className="view control" />;
        }
        const room = this.#getSelected(settings);
        if (!room) {
            return (
                <Hint
                    text={word('sonosdm_no_rooms')}
                    icon="speakers"
                    editMode={this.editMode}
                >
                    <Button
                        icon="refresh"
                        title={word('sonos_ctrl_refresh')}
                        onClick={() => this.reloadRooms()}
                    />
                </Hint>
            );
        }

        const coordinator = coordinatorOf(room, this.stateValue(namespace, room, 'coordinator'));
        const command = (state: string, value: ioBroker.StateValue): void =>
            void this.setState(stateId(namespace, room, state), value);

        return (
            <ControlView
                speakers={settings.showRooms !== false ? this.#getSpeakers(namespace, rooms) : null}
                selected={room}
                player={this.#player({ namespace, room }, false)}
                group={
                    settings.showGroups !== false && rooms.length > 1 ? this.#getGroup(namespace, room, rooms) : null
                }
                library={
                    settings.showLibrary !== false ? (
                        <div className="view source">
                            <SourceBrowser
                                // another speaker starts on its favorites, at the top of its sources
                                key={room}
                                room={room}
                                coordinator={coordinator}
                                value={(from, state) => this.stateValue(namespace, from, state)}
                                command={command}
                                word={word}
                            />
                        </div>
                    ) : null
                }
                accent={this.accent}
                editMode={this.editMode}
                word={word}
                onSelect={next => {
                    if (!this.editMode && next !== room) {
                        this.#picked = { namespace, room: next };
                        this.resubscribe();
                    }
                }}
                onRefresh={() => this.reloadRooms()}
                // group changes go to the coordinator, like in the tab and the other widgets
                onGroup={(member, join) =>
                    void this.setState(
                        stateId(namespace, coordinator, join ? 'add_to_group' : 'remove_from_group'),
                        member,
                    )
                }
                onGroupVolume={volume => command('group_volume', volume)}
            />
        );
    }
}

defineWebComponent(COMPONENTS.control.tag, SonosControl);
