/**
 * Speakers that left their group with the last topology change (#121).
 *
 * A speaker that leaves a group plays nothing anymore, but its states kept the playback of the group:
 * `state_simple` stayed `true` and the title of the group was shown. Its own transport event and the
 * topology event come in any order, and sonos-discovery builds the state of a speaker from the one of
 * its coordinator - while the topology still names the old coordinator, the speaker reports the
 * playback of the group. Once the topology says that a speaker follows itself again, its own state is
 * the right one and has to be read again.
 *
 * @param previous coordinator of every speaker before the change, keyed by the channel name
 * @param current coordinator of every speaker after the change, keyed by the channel name
 * @returns the channel names of the speakers that followed another speaker and follow themselves now
 */
export function speakersLeftGroup(previous: Record<string, string>, current: Record<string, string>): string[] {
    return Object.keys(current).filter(ip => current[ip] === ip && previous[ip] !== undefined && previous[ip] !== ip);
}
