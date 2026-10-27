/**
 * Conversion between seconds and the "[h:]mm:ss" text of `current_duration_s` and `current_elapsed_s`.
 */

/**
 * Convert seconds into "[h:]mm:ss"
 *
 * @param time time in seconds
 */
export function toFormattedTime(time: number): string {
    const hours = Math.floor(time / 3600);
    const min = Math.floor(time / 60) % 60;
    const sec = time % 60;

    return `${hours ? `${hours}:` : ''}${min < 10 ? `0${min}` : min}:${sec < 10 ? `0${sec}` : sec}`;
}

/**
 * Convert "[h:]mm:ss", "m:ss" or plain seconds into seconds
 *
 * @param text time as written to `current_elapsed_s`
 * @returns seconds or null, if the text is not a time
 */
export function parseFormattedTime(text: string): number | null {
    const parts = text
        .trim()
        .split(':')
        .map(part => parseInt(part, 10));

    if (parts.length > 3 || parts.some(part => isNaN(part) || part < 0)) {
        return null;
    }

    return parts.reduce((seconds, part) => seconds * 60 + part, 0);
}
