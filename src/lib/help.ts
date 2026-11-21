/**
 * The answer of the message `help`: what the instance offers, written for an AI agent (e.g. ioBroker.pi-agent, or the
 * MCP server with `send_to`). Keep it in sync with `onMessage` and `onStateChange` in main.ts, the states in states.ts
 * and the README; unit tests check the commands and that every state it names exists and every writable one is named.
 */

/**
 * The commands `onMessage` answers, as `commands` of the answer of `help` (common.supportedMessages.help of
 * js-controller): `write` is true for a command that changes something, so that an agent may allow the others with a
 * weaker permission.
 */
export const COMMANDS: { command: string; write: boolean; standard?: string }[] = [
    { command: 'help', write: false },
    { command: 'send', write: true },
    { command: 'browse', write: false },
    { command: 'sonos:getRooms', write: false },
    { command: 'getPlayers', write: false, standard: 'media.getPlayers' },
    { command: 'getMedia', write: false, standard: 'media.getMedia' },
    { command: 'play', write: true, standard: 'media.play' },
    { command: 'playSound', write: true, standard: 'speech.playSound' },
];

/**
 * The text of `help`
 *
 * @param ns the namespace of the instance, e.g. `sonos.0`
 */
export function helpText(ns: string): string {
    return `ioBroker.sonos (${ns}): controls the SONOS speakers of the household: playback, volume, groups, favorites,
playlists, music services, announcements and the alarms of the SONOS app.

Speakers: every speaker is a channel ${ns}.root.<channel>; <channel> is its IP address with underscores (e.g.
192_168_1_50), its name is the one in the settings, usually the room. sendTo ${ns} "sonos:getRooms" answers
[{value: <channel>, label: <name>}]. The states below are ${ns}.root.<channel>.<state>. alive false = the speaker is
offline.

Groups: the speakers of a group play the same, one of them is the coordinator. Playback (play, pause, next,
favorites_set, play_uri, media_play, sleep_timer, ...) written to any member acts on the whole group; volume, muted,
bass and treble act on this one speaker, group_volume and group_muted on the whole group. coordinator = the channel
of the coordinator of the group (its own one when it is not grouped); members and membersChannels (on the
coordinator) = the rooms and channels of the group, comma separated.

What plays (read only): state ("play", "pause" or "stop"), state_simple (true = playing), current_title,
current_artist, current_album, current_station (radio), current_type (0 track, 1 radio, 2 line-in or TV),
current_duration and current_elapsed (seconds), current_cover (URL), current_track_number, queue_array (JSON),
recent_tracks (JSON), volume, muted, sleep_timer (minutes left), alarm_next (next alarm of the room, ms since 1970),
battery_level and battery_charging (Move, Roam), pair_role and pair_partner (stereo pair).

Control (write with ack false):
- state_simple true / false = play / pause. Or the buttons play, pause, stop, next, prev (write true). Or state
  "play", "pause", "stop", "next", "previous", "mute", "unmute". stop pauses (SONOS keeps the queue).
- volume 0..100 of this speaker, group_volume 0..100, muted and group_muted true / false, bass and treble -10..10,
  night_mode and speech_enhancement (home theater only), led and button_lock (switches of the device).
- shuffle true / false, repeat 0 (off), 1 (all), 2 (one), crossfade true / false.
- seek 0..100 (percent of the track), current_elapsed (seconds) or current_elapsed_s ("m:ss" or "h:mm:ss"),
  current_track_number (track in the queue).
- favorites_set: a title exactly as in favorites_list_array (JSON; favorites_list is the same, comma separated).
  playlist_set: a title of playlist_list_array. autoplay false = only load them, do not start playing.
- play_uri: a URI the speaker plays by itself, e.g. the URL of an internet radio stream or of an mp3 file.
- tts: an announcement "[volume;]<URL of an audio file>" (http or https, e.g. the mp3 of the sayit adapter) or a
  file on the ioBroker host (needs the web server in the settings). Afterwards the speaker goes back to what it
  played, with its volume. An empty value stops the announcement. It plays a file, not a text: a text is spoken
  with the sayit adapter, which writes its file here.
- sleep_timer: minutes 1..1439 until the group stops playing; 0 cancels it.
- add_to_group: the channel or room of another speaker, which joins the group of this one. remove_from_group: the
  channel or room of a member, which leaves the group. coordinator: the channel or room of another speaker, whose
  group this one joins; its own channel = this speaker leaves its group.

Music library and music services (browsing like the SONOS app):
1. Write an id to media_browse. "root" = the sources: TuneIn radio (R:0), the music services (service:<name>), the
   music library (A:), the network shares (S:), line-in (AI:) and on a soundbar the TV.
2. Read media_browse_result of the coordinator of the group (written within seconds): JSON {id, title, items: [{id,
   title, artist, album, uri, metadata, folder, favorite?, playlist?}], serviceName?, searchable?, loginUrl?}.
3. An item with folder true: write its id to media_browse again. Else write the item as JSON to media_play; it
   also takes {"uri": <uri>, "metadata": <metadata>}, {"favorite": <title>}, {"playlist": <title>} or {"tv": true}
   (the HDMI input of a soundbar).
Search in a music service (searchable true): media_browse "smapi-search:<service>:<term>", both URI-encoded.
loginUrl: the user has to open it once to link the account, then browse the service again.

Alarms of the SONOS app: ${ns}.alarms.<ID> with enabled, time ("hh:mm"), recurrence (ONCE, DAILY, WEEKDAYS,
WEEKENDS, or ON_ and the days with 0 = Sunday: ON_135 = Monday, Wednesday, Friday), duration ("hh:mm"), volume,
room (write another room to move the alarm), source (title of a favorite, a URI or "SONOS Chime"), play_mode
(NORMAL, REPEAT_ALL, SHUFFLE_NOREPEAT, SHUFFLE), include_grouped, next_start (read only, ms since 1970) and delete
(true deletes the alarm). A new alarm: write JSON to ${ns}.alarms.create; only room and time are required, e.g.
{"room": "Bedroom", "time": "06:45", "recurrence": "WEEKDAYS", "volume": 15, "source": "Radio Bob"}.

Commands (sendTo ${ns}):
- help: this text, {help, commands: [{command, write}]}; write true = the command changes something.
- sonos:getRooms: the speakers, [{value: <channel>, label: <name>}].
- send "[volume;]<URL or file>": the announcement on every speaker at once, like tts (write).
- browse: searches the network for speakers, for the settings, not for agents.
These follow the shared catalog of commands (the same names and answers in all players; marked "standard" in
commands). device = the channel, the name of the settings or the room of the SONOS app, without case; errors are
{error, reason}:
- getPlayers {}: the speakers, {players: [{id: <channel>, name, room?, roomId?, online, active (plays), kinds}]}.
- getMedia {list: "favorites" | "playlists", search?, limit? (100), offset?}: {items: [{type, uri, name, image?}]};
  uri is "favorite:<title>" or "playlist:<title>". Other lists: reason NOT_SUPPORTED.
- play {uri?, device?, positionSec?, shuffle?} (write): plays on the group of the speaker: uri from getMedia, a
  stream or file URL or a URI of a music service; no uri = go on playing. device may be left out with one speaker.
  Answers {ok: true, device: {id, name}} when it plays, {ok: true, pending: true, device} after 12 s, or {error,
  reason}: NO_ACTIVE_DEVICE or DEVICE_NOT_FOUND (with devices), AMBIGUOUS (candidates), DEVICE_NOT_CONTROLLABLE,
  NOT_CONNECTED.
- playSound {url | file, contentType?, device?, room?, volume? (0..100)} (write): a short sound (door bell, gong,
  speech file) over what plays, on one speaker, the speakers of an ioBroker room or all, then that goes on, like
  tts. file: a data URL, base64 with contentType, iobfile://<adapter>.<n>/<path> or a file on the ioBroker host
  (these need the web server of the settings). Answers {ok: true, devices: [names]} when played, {ok: true,
  pending: true} after 12 s, or {error, reason} (NOT_FOUND with candidates, AMBIGUOUS, NOT_CONNECTED, BAD_REQUEST).
Pause, next, previous, volume and mute have no command: write the states above. A text is spoken by sayit.

How to act:
- Name speakers by their room, not by the channel.
- Everything here is heard in the house: start or change playback, volume, groups, announcements and alarms only on
  the user's request. Mind the time of day, and change the volume in moderate steps unless the user names a value.
- A written state is a command, not a result: read state, current_title or volume a few seconds later to see what
  the speaker does. The log of the instance tells why a command failed.
- "UPnPError 501" on play often means there is nothing to resume (e.g. an expired queue of a music service that
  was started from the SONOS app): start a favorite, a playlist or media_play instead.
- The TV input (current_type 2 on a soundbar) has no play, pause, next, seek, shuffle or repeat.
- A speaker of a stereo pair that cannot be controlled: use the channel in its pair_partner.`;
}
