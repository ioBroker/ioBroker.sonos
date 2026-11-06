import { useState, type CSSProperties, type JSX } from 'react';

import { timeString } from './constants';
import { Button, Cover, Slider } from './controls';
import type { WordKey } from './texts';
import type { Word } from './words';

/** What the player shows of one speaker, read from the states of its channel */
export interface PlayerValues {
    name: string;
    /** It follows another speaker, or others follow it */
    grouped: boolean;
    /** `alive` is false */
    offline: boolean;
    playing: boolean;
    muted: boolean;
    /** 0..100 */
    volume: number;
    shuffle: boolean;
    /** 0 = off, 1 = all, 2 = one track */
    repeat: number;
    /** Seconds */
    elapsed: number;
    /** Seconds; 0 for a stream without an end */
    duration: number;
    title: string;
    /** Artist and album, or the station */
    sub: string;
    cover: string;
    /** It plays the TV input of a soundbar: no transport */
    tv: boolean;
    nightMode: boolean;
    speech: boolean;
}

/** A speaker of the instance, for the chips that switch the player to it */
export interface PlayerRoomChip {
    room: string;
    name: string;
    alive: boolean;
    selected: boolean;
}

/** A speaker of the instance, for the toggles of the group */
export interface PlayerGroupMember {
    room: string;
    name: string;
    /** In the group of the speaker shown */
    member: boolean;
    /** The coordinator of that group: always in it */
    coordinator: boolean;
}

export interface PlayerViewProps {
    values: PlayerValues;
    showCover: boolean;
    showSeek: boolean;
    showModes: boolean;
    showVolume: boolean;
    showSource: boolean;
    /** The chips to switch to another speaker; null without */
    rooms: PlayerRoomChip[] | null;
    /** The toggles of the group; null without */
    group: PlayerGroupMember[] | null;
    accent: string;
    editMode: boolean;
    /** Inside the dialog of the whole player */
    dialog?: boolean;
    word: Word;
    /** Write a state of the speaker */
    onCommand: (name: string, value: ioBroker.StateValue) => void;
    /** Add a speaker to the group of the one shown, or remove it */
    onGroup: (room: string, join: boolean) => void;
    onSelectRoom: (room: string) => void;
    onOpenSources: () => void;
    /** Opens the whole player in a dialog; offered when the box is too low for the controls */
    onOpenPlayer?: () => void;
}

const REPEAT_WORDS: WordKey[] = ['sonosdm_repeat', 'sonosdm_repeat_all', 'sonosdm_repeat_one'];

export function PlayerView(props: PlayerViewProps): JSX.Element {
    const { values, word, onCommand } = props;
    /** The position under the thumb while the user drags the progress, in percent */
    const [seeking, setSeeking] = useState<number | null>(null);

    const disabled = values.offline;
    const repeat = values.repeat >= 0 && values.repeat <= 2 ? values.repeat : 0;
    const progress = props.showSeek && !values.tv && values.duration > 0;
    const elapsed = seeking === null ? values.elapsed : (seeking / 100) * values.duration;

    const classes = ['view', 'player'];
    if (props.editMode) {
        classes.push('edit');
    }
    if (values.offline) {
        classes.push('offline');
    }

    let status = '';
    if (values.offline) {
        status = ` · ${word('sonosdm_offline')}`;
    } else if (values.grouped) {
        status = ` · ${word('sonosdm_grouped')}`;
    }

    const playButton = (className: string): JSX.Element => (
        <Button
            icon={values.playing ? 'pause' : 'play'}
            className={className}
            title={word(values.playing ? 'sonosdm_pause' : 'sonosdm_play')}
            disabled={disabled}
            onClick={() => onCommand('state_simple', !values.playing)}
        />
    );

    const muteButton = (
        <Button
            icon={values.muted || values.volume <= 0 ? 'volumeOff' : 'volume'}
            className="small"
            title={word(values.muted ? 'sonosdm_unmute' : 'sonosdm_mute')}
            active={values.muted}
            disabled={disabled}
            onClick={() => onCommand('muted', !values.muted)}
        />
    );

    let transport: JSX.Element;
    if (values.tv) {
        // the TV input has no transport: mute, night sound and speech enhancement instead
        transport = (
            <div className="transport">
                {props.showVolume ? null : muteButton}
                <Button
                    icon="night"
                    title={word('vis_night_mode')}
                    active={values.nightMode}
                    disabled={disabled}
                    onClick={() => onCommand('night_mode', !values.nightMode)}
                />
                <Button
                    icon="speech"
                    title={word('vis_speech_enhancement')}
                    active={values.speech}
                    disabled={disabled}
                    onClick={() => onCommand('speech_enhancement', !values.speech)}
                />
            </div>
        );
    } else {
        transport = (
            <div className="transport">
                {props.showModes ? (
                    <Button
                        icon="shuffle"
                        className="small mode"
                        title={word('sonosdm_shuffle')}
                        active={values.shuffle}
                        disabled={disabled}
                        onClick={() => onCommand('shuffle', !values.shuffle)}
                    />
                ) : null}
                <Button
                    icon="previous"
                    title={word('sonosdm_previous')}
                    disabled={disabled}
                    onClick={() => onCommand('prev', true)}
                />
                {playButton('main')}
                <Button
                    icon="next"
                    title={word('sonosdm_next')}
                    disabled={disabled}
                    onClick={() => onCommand('next', true)}
                />
                {props.showModes ? (
                    <Button
                        icon={repeat === 2 ? 'repeatOne' : 'repeat'}
                        className="small mode"
                        title={word(REPEAT_WORDS[repeat])}
                        active={repeat > 0}
                        disabled={disabled}
                        // off -> all -> one track -> off
                        onClick={() => onCommand('repeat', (repeat + 1) % 3)}
                    />
                ) : null}
                {props.showVolume ? null : muteButton}
            </div>
        );
    }

    return (
        <div
            className={classes.join(' ')}
            style={{ '--accent': props.accent } as CSSProperties}
        >
            {props.rooms && props.rooms.length > 1 ? (
                <div className="chips">
                    {props.rooms.map(chip => (
                        <Button
                            key={chip.room}
                            icon="music"
                            title={chip.name}
                            active={chip.selected}
                            disabled={!chip.alive}
                            onClick={() => props.onSelectRoom(chip.room)}
                        >
                            {chip.name}
                        </Button>
                    ))}
                </div>
            ) : null}
            <div className="head">
                {props.showCover ? (
                    <Cover
                        url={values.cover}
                        icon={values.tv ? 'tv' : 'music'}
                    />
                ) : null}
                <div className="info">
                    <div className="name secondary ellipsis">
                        {values.name}
                        {status}
                    </div>
                    <div className="title ellipsis">{values.title || word('sonosdm_nothing_playing')}</div>
                    {values.sub ? <div className="sub secondary ellipsis">{values.sub}</div> : null}
                </div>
                {props.dialog ? null : (
                    <div className="quick">
                        {values.tv ? null : playButton('small')}
                        {props.onOpenPlayer ? (
                            <Button
                                icon="expand"
                                className="small"
                                title={word('wc_open_player')}
                                disabled={disabled}
                                onClick={props.onOpenPlayer}
                            />
                        ) : null}
                    </div>
                )}
            </div>
            {progress ? (
                <div className="seek">
                    <span className="time">{timeString(elapsed)}</span>
                    <Slider
                        value={Math.min(100, Math.max(0, (values.elapsed / values.duration) * 100))}
                        max={100}
                        step={0.1}
                        label={word('wc_position')}
                        disabled={disabled}
                        onPreview={setSeeking}
                        // `seek` takes the position in percent
                        onCommit={val => onCommand('seek', Math.round(val * 10) / 10)}
                    />
                    <span className="time end">{timeString(values.duration)}</span>
                </div>
            ) : null}
            {transport}
            {props.showVolume || props.showSource ? (
                <div className="volume">
                    {props.showVolume ? (
                        <>
                            {muteButton}
                            <Slider
                                value={values.volume}
                                max={100}
                                label={word('wc_volume')}
                                disabled={disabled}
                                onCommit={val => onCommand('volume', val)}
                            />
                            <span className="level">{Math.round(values.volume)}</span>
                        </>
                    ) : (
                        <span style={{ flex: 1 }} />
                    )}
                    {props.showSource ? (
                        <Button
                            icon="library"
                            className="small"
                            title={word('sonosdm_select_source')}
                            disabled={disabled}
                            onClick={props.onOpenSources}
                        />
                    ) : null}
                </div>
            ) : null}
            {props.group && props.group.length > 1 ? (
                <div className="groups">
                    <span className="label secondary">{word('vis_group')}</span>
                    {props.group.map(member => (
                        <Button
                            key={member.room}
                            icon="link"
                            title={member.name}
                            active={member.member}
                            disabled={member.coordinator}
                            onClick={() => props.onGroup(member.room, !member.member)}
                        >
                            {member.name}
                        </Button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
