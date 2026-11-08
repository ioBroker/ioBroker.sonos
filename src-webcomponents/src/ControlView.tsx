import { useState, type CSSProperties, type JSX, type ReactNode } from 'react';

import { Button, Slider } from './controls';
import { Icon, type IconName } from './icons';
import { GroupPills, type PlayerGroupMember } from './PlayerView';
import type { WordKey } from './texts';
import type { Word } from './words';

/** One speaker of the list on the left */
export interface SpeakerRow {
    room: string;
    name: string;
    /** `common.color` of its channel */
    color: string;
    alive: boolean;
    playing: boolean;
    volume: number;
    /** Title and artist */
    playingText: string;
    /** It follows another speaker, or others follow it */
    grouped: boolean;
}

/** The group of the selected speaker */
export interface GroupValues {
    /** Every speaker of the instance: in the group or not */
    members: PlayerGroupMember[];
    /** The name of the speaker the selected one follows; empty if it leads the group or plays alone */
    follows: string;
    /** The volume of the whole group; null while the speaker plays alone or the adapter has not told it yet */
    volume: number | null;
    /** The selected speaker is not reachable */
    disabled: boolean;
}

type Part = 'player' | 'group' | 'library';

const PARTS: { id: Part; label: WordKey; icon: IconName }[] = [
    { id: 'player', label: 'wc_player', icon: 'music' },
    { id: 'group', label: 'sonos_ctrl_group', icon: 'link' },
    { id: 'library', label: 'wc_library', icon: 'library' },
];

export interface ControlViewProps {
    /** The list of the speakers; null without it */
    speakers: SpeakerRow[] | null;
    /** The speaker the player, the group and the library are of */
    selected: string;
    /** The player of the selected speaker */
    player: ReactNode;
    /** The group of the selected speaker; null without it */
    group: GroupValues | null;
    /** The library of the selected speaker; null without it */
    library: ReactNode;
    accent: string;
    editMode: boolean;
    word: Word;
    onSelect: (room: string) => void;
    /** Read the speakers of the instance again */
    onRefresh: () => void;
    /** Add a speaker to the group of the selected one, or remove it */
    onGroup: (room: string, join: boolean) => void;
    onGroupVolume: (volume: number) => void;
}

/**
 * The control centre: the speakers on the left, the player, the group and the library of the selected one on the
 * right. The layout follows the box with container queries (see `CONTROL_CSS`): in a narrow box the speakers are a
 * row of pills above, and in a narrow or low one the right side shows one part at a time, picked with tabs - which
 * part is kept here, so that the tabs work without measuring the box.
 */
export function ControlView(props: ControlViewProps): JSX.Element {
    const { word, speakers, group, library } = props;
    const [part, setPart] = useState<Part>('player');

    const hasLibrary = library !== null && library !== undefined;
    const parts = PARTS.filter(entry => entry.id === 'player' || (entry.id === 'group' ? !!group : hasLibrary));
    const current = parts.some(entry => entry.id === part) ? part : 'player';
    const partClass = (id: Part): string => `part part-${id}${id === current ? ' current' : ''}`;

    const classes = ['view', 'control'];
    if (props.editMode) {
        classes.push('edit');
    }

    let groupLabel = word('sonos_ctrl_group');
    if (group?.follows) {
        groupLabel += ` · ${word('sonos_ctrl_follows')} ${group.follows}`;
    }

    return (
        <div
            className={classes.join(' ')}
            style={{ '--accent': props.accent } as CSSProperties}
        >
            {speakers ? (
                <div className="speakers">
                    <div className="speakers-head">
                        <Icon name="speakers" />
                        <span className="label ellipsis">{word('sonos_ctrl_speakers')}</span>
                        <Button
                            icon="refresh"
                            className="small"
                            title={word('sonos_ctrl_refresh')}
                            onClick={props.onRefresh}
                        />
                    </div>
                    <div className="speaker-list">
                        {speakers.map(row => {
                            const rowClasses = ['speaker'];
                            if (row.room === props.selected) {
                                rowClasses.push('selected');
                            }
                            if (row.playing) {
                                rowClasses.push('playing');
                            }
                            if (!row.alive) {
                                rowClasses.push('offline');
                            }
                            return (
                                <button
                                    key={row.room}
                                    type="button"
                                    className={rowClasses.join(' ')}
                                    title={row.name}
                                    aria-pressed={row.room === props.selected}
                                    onClick={() => props.onSelect(row.room)}
                                >
                                    <Icon name={row.playing ? 'play' : 'speaker'} />
                                    <span className="text">
                                        <span
                                            className="speaker-name ellipsis"
                                            style={row.color ? { color: row.color } : undefined}
                                        >
                                            {row.name}
                                            {row.grouped ? (
                                                <span className="secondary">{` · ${word('sonosdm_grouped')}`}</span>
                                            ) : null}
                                        </span>
                                        <span className="speaker-sub secondary ellipsis">
                                            {row.alive
                                                ? row.playingText || word('sonosdm_nothing_playing')
                                                : word('sonosdm_offline')}
                                        </span>
                                    </span>
                                    {row.alive ? (
                                        <span className="speaker-level secondary">{Math.round(row.volume)}</span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : null}
            <div className={hasLibrary ? 'control-main has-library' : 'control-main'}>
                {parts.length > 1 ? (
                    <div className="part-tabs">
                        {parts.map(entry => (
                            <Button
                                key={entry.id}
                                icon={entry.icon}
                                title={word(entry.label)}
                                active={entry.id === current}
                                onClick={() => setPart(entry.id)}
                            >
                                {word(entry.label)}
                            </Button>
                        ))}
                    </div>
                ) : null}
                <div className={partClass('player')}>{props.player}</div>
                {group ? (
                    <div className={partClass('group')}>
                        <GroupPills
                            group={group.members}
                            label={groupLabel}
                            onGroup={props.onGroup}
                        />
                        {group.volume !== null ? (
                            <div className="group-volume">
                                <Icon name="volume" />
                                <span className="label secondary ellipsis">{word('wc_group_volume')}</span>
                                <Slider
                                    value={group.volume}
                                    max={100}
                                    label={word('wc_group_volume')}
                                    disabled={group.disabled}
                                    onCommit={props.onGroupVolume}
                                />
                                <span className="level">{Math.round(group.volume)}</span>
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {hasLibrary ? <div className={partClass('library')}>{library}</div> : null}
            </div>
        </div>
    );
}
