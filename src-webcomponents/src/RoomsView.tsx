import type { CSSProperties, JSX } from 'react';

import { Button, Slider } from './controls';
import { Icon } from './icons';
import type { Word } from './words';

/** One speaker of the overview */
export interface RoomRow {
    room: string;
    name: string;
    /** `common.color` of its channel */
    color: string;
    /** `common.icon` of its channel, if the browser can load it as it is */
    icon: string;
    alive: boolean;
    playing: boolean;
    muted: boolean;
    volume: number;
    /** It follows another speaker */
    grouped: boolean;
    /** Title and artist */
    playingText: string;
    /** In the group of the speaker picked as master - the link button is on */
    linked: boolean;
}

export interface RoomsViewProps {
    title: string;
    /** null while the speakers are read */
    rows: RoomRow[] | null;
    showVolume: boolean;
    showSource: boolean;
    allowGrouping: boolean;
    /** The speaker picked as the master of a group, see `onLink` */
    linkMaster: string | null;
    accent: string;
    editMode: boolean;
    /** Inside the dialog of the whole list */
    dialog?: boolean;
    word: Word;
    onPlay: (room: string, play: boolean) => void;
    onVolume: (room: string, volume: number) => void;
    onLink: (room: string) => void;
    onSource: (room: string, name: string) => void;
    /** Opens the whole list in a dialog; offered when the box is too low for it */
    onOpenList?: () => void;
}

export function RoomsView(props: RoomsViewProps): JSX.Element {
    const { rows, word, linkMaster } = props;
    const playing = rows?.filter(row => row.playing) || [];
    const total = rows?.length || 0;

    const classes = ['view', 'rooms'];
    if (props.editMode) {
        classes.push('edit');
    }

    const linkTitle = (row: RoomRow): string => {
        if (row.room === linkMaster) {
            return word('sonosdm_link_cancel');
        }
        if (linkMaster) {
            return word(row.linked ? 'sonosdm_link_remove' : 'sonosdm_link_add');
        }
        return word('sonosdm_link_start');
    };

    return (
        <div
            className={classes.join(' ')}
            style={{ '--accent': props.accent } as CSSProperties}
        >
            <div className="rooms-head">
                <Icon name="speakers" />
                <span className="label ellipsis">{props.title}</span>
                {rows ? <span className="count secondary">{`${playing.length} / ${total}`}</span> : null}
            </div>
            {linkMaster ? <div className="link-hint">{word('sonosdm_link_hint')}</div> : null}
            <div className="list">
                {rows && !rows.length ? <div className="secondary">{word('sonosdm_no_rooms')}</div> : null}
                {rows?.map(row => (
                    <div
                        key={row.room}
                        className={row.alive ? 'row' : 'row offline'}
                    >
                        {row.icon ? (
                            <img
                                src={row.icon}
                                alt=""
                            />
                        ) : (
                            <Icon name="music" />
                        )}
                        <div className="text">
                            <span
                                className="room-name ellipsis"
                                style={row.color ? { color: row.color } : undefined}
                            >
                                {row.name}
                                {row.grouped ? (
                                    <span className="secondary">{` · ${word('sonosdm_grouped')}`}</span>
                                ) : null}
                            </span>
                            <span className="playing secondary ellipsis">
                                {row.alive
                                    ? row.playingText || word('sonosdm_nothing_playing')
                                    : word('sonosdm_offline')}
                            </span>
                        </div>
                        {props.showVolume && row.alive ? (
                            <div className="volume">
                                <Icon name={row.muted ? 'volumeOff' : 'volume'} />
                                <Slider
                                    value={row.volume}
                                    max={100}
                                    label={`${word('wc_volume')}: ${row.name}`}
                                    onCommit={val => props.onVolume(row.room, val)}
                                />
                            </div>
                        ) : null}
                        {props.showSource && row.alive ? (
                            <Button
                                icon="library"
                                className="small"
                                title={word('sonosdm_select_source')}
                                onClick={() => props.onSource(row.room, row.name)}
                            />
                        ) : null}
                        {props.allowGrouping && total > 1 ? (
                            <Button
                                icon="link"
                                className="small"
                                title={linkTitle(row)}
                                active={row.room === linkMaster || row.linked}
                                onClick={() => props.onLink(row.room)}
                            />
                        ) : null}
                        <Button
                            icon={row.playing ? 'pause' : 'play'}
                            className="small"
                            title={word(row.playing ? 'sonosdm_pause' : 'sonosdm_play')}
                            active={row.playing}
                            disabled={!row.alive}
                            onClick={() => props.onPlay(row.room, !row.playing)}
                        />
                    </div>
                ))}
            </div>
            {props.dialog ? null : (
                <button
                    type="button"
                    className="summary"
                    title={word('wc_show_all')}
                    aria-label={word('wc_show_all')}
                    onClick={props.onOpenList}
                >
                    <Icon name="speakers" />
                    <span className="label ellipsis">{props.title}</span>
                    <span>
                        <span className={playing.length ? 'big playing' : 'big'}>{playing.length}</span>
                        <span className="total secondary">{` / ${total}`}</span>
                    </span>
                    <span className="names secondary ellipsis">
                        {playing.length
                            ? playing.map(row => row.name).join(', ')
                            : word(total ? 'sonosdm_all_idle' : 'sonosdm_no_rooms')}
                    </span>
                </button>
            )}
        </div>
    );
}
