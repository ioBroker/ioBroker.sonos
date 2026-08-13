/**
 * Definitions of the ioBroker states, that are created for every sonos device
 */

/** Definition of one state. Some entries use additional attributes, like `values`, so an index signature is required */
export type StateDefinition = Partial<ioBroker.StateCommon> & Record<string, unknown>;

/** States, that were added after the first version of the adapter */
export const newGroupStates: Record<string, StateDefinition> = {
    add_to_group: {
        def: '',
        type: 'string',
        read: false,
        write: true,
        role: 'media',
        desc: 'Add a Player to a Group (Player to remove, Coordinator)',
    },
    remove_from_group: {
        def: '',
        type: 'string',
        read: false,
        write: true,
        role: 'media',
        desc: 'Remove a Player to a Group (Player to remove, Coordinator)',
    },
    coordinator: {
        // master of group
        def: '',
        type: 'string',
        read: true,
        write: true,
        role: 'media.coordinator',
        desc: 'Indicates coordinator of group',
    },
    group_volume: {
        type: 'number',
        read: true,
        write: true,
        role: 'level.volume.group',
        min: 0,
        max: 100,
        desc: 'State and control of group volume',
    },
    group_muted: {
        def: false,
        type: 'boolean',
        read: true,
        write: true,
        role: 'media.mute.group',
        desc: 'Group is muted',
    },
    members: {
        // indicator.reachable -    if player alive (read only)
        type: 'string',
        read: true,
        write: false,
        role: 'indicator.members',
        desc: 'Group members',
    },
    membersChannels: {
        // indicator.reachable -    if player alive (read only)
        type: 'string',
        read: true,
        write: false,
        role: 'indicator.members',
        desc: 'Group members Channels',
    },
    playlist_set: {
        // media.playlist.set -    select Sonos playlist (write only)
        def: '',
        type: 'string',
        read: false,
        write: true,
        role: 'media.playlist.set',
        desc: 'Set Sonos playlist to play',
        name: 'Playlist set',
    },
};

// Definition of all states, that every sonos channel must have
export function getChannelStates(): Record<string, StateDefinition> {
    const states: Record<string, StateDefinition> = {
        state_simple: {
            // media.state -            Text state of player: stop, play, pause (read, write)
            def: false,
            type: 'boolean',
            read: true,
            write: true,
            role: 'media.state',
            desc: 'Play or pause',
            name: 'Binary play/pause state',
        },
        play: {
            // play command
            type: 'boolean',
            read: false,
            write: true,
            role: 'button.play',
            desc: 'play',
            name: 'Play button',
        },
        stop: {
            // stop command
            type: 'boolean',
            read: false,
            write: true,
            role: 'button.stop',
            desc: 'stop',
            name: 'Stop button',
        },
        pause: {
            // pause command
            type: 'boolean',
            read: false,
            write: true,
            role: 'button.pause',
            desc: 'pause',
            name: 'Pause button',
        },
        prev: {
            // prev command
            type: 'boolean',
            read: false,
            write: true,
            role: 'button.prev',
            desc: 'prev',
            name: 'Previous button',
        },
        next: {
            // next command
            type: 'boolean',
            read: false,
            write: true,
            role: 'button.next',
            desc: 'next',
            name: 'Next button',
        },
        seek: {
            // seek command and indication
            type: 'number',
            read: true,
            write: true,
            unit: '%',
            min: 0,
            max: 100,
            role: 'media.seek',
            desc: 'Seek position in percent',
            name: 'Seek position',
        },
        state: {
            // media.state -            Text state of player: stop, play, pause (read, write)
            def: 'stop',
            type: 'string',
            read: true,
            write: true,
            values: 'stop,play,pause,next,previous,mute,unmute',
            role: 'media.state',
            desc: 'Play, stop, or pause, next, previous, mute, unmute',
            name: 'String state',
        },
        volume: {
            // level.volume -           volume level (read, write)
            type: 'number',
            read: true,
            write: true,
            role: 'level.volume',
            min: 0,
            max: 100,
            desc: 'State and control of volume',
            name: 'Player volume',
        },
        treble: {
            // level.treble -           treble level (only write)
            type: 'number',
            read: false,
            write: true,
            role: 'level.treble',
            min: -10,
            max: 10,
            desc: 'State and control of treble',
            name: 'Player treble',
        },
        bass: {
            // level.bass -           bass level (only write)
            type: 'number',
            read: false,
            write: true,
            role: 'level.bass',
            min: -10,
            max: 10,
            desc: 'State and control of bass',
            name: 'Player bass',
        },
        muted: {
            // media.muted -            is muted (read only)
            def: false,
            type: 'boolean',
            read: true,
            write: true,
            role: 'media.mute',
            desc: 'Is muted',
            name: 'Player mute',
        },
        current_title: {
            // media.current.title -    current title (read only)
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'media.title',
            desc: 'Title of current played song',
            name: 'Current title',
        },
        current_artist: {
            // media.current.artist -   current artist (read only)
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'media.artist',
            desc: 'Artist of current played song',
            name: 'Current artist',
        },
        current_album: {
            // media.current.album -    current album (read only)
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'media.album',
            desc: 'Album of current played song',
            name: 'Current album',
        },
        current_cover: {
            // media.current.cover -    current url to album cover (read only)
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'media.cover',
            desc: 'Cover image of current played song',
            name: 'Current cover URL',
        },
        current_duration: {
            // media.current.duration - duration as HH:MM:SS (read only)
            def: 0,
            type: 'number',
            read: true,
            write: false,
            unit: 'seconds',
            role: 'media.duration',
            desc: 'Duration of current played song in seconds',
            name: 'Current song duration',
        },
        current_duration_s: {
            // media.current.duration - duration in seconds (read only)
            def: '00:00',
            type: 'string',
            read: true,
            write: false,
            unit: 'interval',
            role: 'media.duration.text',
            desc: 'Duration of current played song as HH:MM:SS',
            name: 'Current duration',
        },
        current_type: {
            // media.type -            type of stream (read only)
            def: 0,
            type: 'number',
            read: true,
            write: false,
            role: 'media.type',
            states: { 0: 'track', 1: 'radio', 2: 'line_in' },
            desc: 'Type of Stream (0 = track, 1 = radio, 2 = line_in)',
            name: 'Current stream type',
        },
        current_station: {
            // media.current.station -   current station (read only)
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'media.station',
            desc: 'Radio station currently played',
            name: 'Current radio station',
        },
        current_track_number: {
            // media.trackNo -   current track number
            def: 1,
            type: 'number',
            read: true,
            write: true,
            role: 'media.trackNo',
            desc: 'Current track number',
            name: 'Current track number',
        },
        alive: {
            // indicator.reachable -    if player alive (read only)
            type: 'boolean',
            read: true,
            write: false,
            role: 'indicator.reachable',
            desc: 'If sonos alive or not',
            name: 'Connection status',
        },
        current_elapsed: {
            // media.current.elapsed -  elapsed time in seconds
            def: 0,
            type: 'number',
            read: true,
            write: true,
            unit: 'seconds',
            role: 'media.elapsed',
            desc: 'Elapsed time of current played song in seconds',
            name: 'Elapsed time in seconds',
        },
        current_elapsed_s: {
            // media.current.elapsed -  elapsed time in HH:MM:SS
            def: '00:00',
            type: 'string',
            read: true,
            write: true,
            unit: 'interval',
            role: 'media.elapsed.text',
            desc: 'Elapsed time of current played song as HH:MM:SS',
            name: 'Elapsed time as text',
        },
        favorites_list: {
            // media.favorites.list -   list of favorites channel (read only)
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'media.favorites.list',
            desc: 'List of favorites song or stations, divided by comma',
            name: 'Favorites list',
        },
        favorites_list_array: {
            // media.favorites.array -   list of favorite channels in JSON format (read only)
            def: '',
            type: 'array',
            read: true,
            write: false,
            role: 'media.favorites.array',
            desc: 'Array of favorites song or stations',
            name: 'Favorites Array',
        },
        favorites_list_html: {
            // favorites html list
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'state',
            desc: 'List of favorites song or stations as html table',
            name: 'Favorites list html',
        },
        favorites_set: {
            // media.favorites.set -    select favorites from list (write only)
            def: '',
            type: 'string',
            read: false,
            write: true,
            role: 'media.favorites.set',
            desc: 'Set favorite from the list to play',
            name: 'Favorites set',
        },
        tts: {
            // play text to speech mp3 file
            def: '',
            type: 'string',
            read: false,
            write: true,
            role: 'media.tts',
            desc: 'Set text2speech mp3 file to play',
            name: 'Text to speech',
        },
        shuffle: {
            // Shuffle mode: true or false
            def: false,
            type: 'boolean',
            read: true,
            write: true,
            role: 'media.mode.shuffle',
            desc: 'Shuffle mode',
            name: 'Shuffle',
        },
        repeat: {
            // repeat mode: true or false
            def: 0,
            type: 'number',
            read: true,
            write: true,
            role: 'media.mode.repeat',
            states: { 0: 'none', 1: 'all', 2: 'one' },
            desc: 'Repeat mode',
            name: 'Repeat',
        },
        crossfade: {
            // crossfade mode: true or false
            def: false,
            type: 'boolean',
            read: true,
            write: true,
            role: 'media.mode.crossfade',
            desc: 'Crossfade mode',
            name: 'Crossfade',
        },
        queue: {
            // queue
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'state',
            name: 'Play queue',
        },
        queue_html: {
            // queue html table
            def: '',
            type: 'string',
            read: true,
            write: false,
            role: 'state',
            name: 'Play queue html',
        },
    };

    for (const g in newGroupStates) {
        states[g] = newGroupStates[g];
    }

    return states;
}
