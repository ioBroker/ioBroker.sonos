/**
 * Housekeeping of the cover cache (`iobroker-data/sonosCache`, #222).
 *
 * Every cover a speaker reports is downloaded once and kept under the SHA-256 of its URI, so a cover
 * that comes back - a radio station, a favourite album - is not fetched again. Nothing ever removed a
 * file, and on systems that play many different tracks the folder grew to gigabytes. Covers that were
 * not used for {@link COVER_CACHE_MAX_AGE} are removed now; a cache hit refreshes the modification
 * time of the file, so covers in use stay.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Covers not used for 30 days are removed */
export const COVER_CACHE_MAX_AGE = 30 * 24 * 3600 * 1000;

/**
 * Remove the files in `dir` that were not modified for `maxAge` ms. Sub-directories are left alone.
 *
 * The files are processed one after the other with the asynchronous API: an old cache can hold tens
 * of thousands of files, and the adapter must keep answering meanwhile.
 *
 * @param dir the cache directory
 * @param maxAge age in ms after which a file is removed
 * @param now current time in ms
 * @returns the number of removed files
 */
export async function pruneCoverCache(dir: string, maxAge = COVER_CACHE_MAX_AGE, now = Date.now()): Promise<number> {
    let removed = 0;

    for await (const entry of await fs.promises.opendir(dir)) {
        if (!entry.isFile()) {
            continue;
        }

        const file = path.join(dir, entry.name);
        try {
            const stat = await fs.promises.stat(file);
            if (now - stat.mtimeMs > maxAge) {
                await fs.promises.unlink(file);
                removed++;
            }
        } catch {
            // removed meanwhile or not accessible - the next run tries again
        }
    }

    return removed;
}

/**
 * Mark a cached cover as used, so that {@link pruneCoverCache} keeps it
 *
 * @param file path of the cached cover
 * @param now time to set
 */
export function touchCoverFile(file: string, now = new Date()): void {
    try {
        fs.utimesSync(file, now, now);
    } catch {
        // the cover is delivered anyway; at worst it is downloaded again after a month
    }
}

/** A cover larger than this is not an album art but a stream or a file that is no image (#64) */
export const COVER_MAX_SIZE = 10 * 1024 * 1024;

/**
 * Whether the downloaded data is an image - JPEG, PNG, GIF, WebP, BMP or SVG.
 *
 * The status code alone does not say it: a speaker or a music service can answer the cover URL with
 * the audio file itself (#64). Cached under the hash of the URL, it was shown as a broken cover every
 * time the track came back. The content type is not reliable either - services send covers as
 * `application/octet-stream` - so the first bytes decide.
 *
 * @param data the downloaded file
 */
export function isImageData(data: Buffer): boolean {
    if (data.length < 4) {
        return false;
    }
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
        return true; // JPEG
    }
    const head = data.subarray(0, 512).toString('latin1');
    if (head.startsWith('\x89PNG') || head.startsWith('GIF8') || head.startsWith('BM')) {
        return true;
    }
    if (head.startsWith('RIFF') && head.substring(8, 12) === 'WEBP') {
        return true;
    }
    // SVG: markup from the first character on (after a BOM, read as latin1), and the first element -
    // after an XML declaration, a comment or a doctype, which start with `<?` and `<!` - is <svg>, so
    // that an HTML error page with an icon in it does not count. Simple checks instead of one pattern
    // with nested repetitions, which could backtrack exponentially.
    const markup = head.replace(/^\xEF\xBB\xBF/, '').trimStart();
    const firstElement = markup.startsWith('<') ? markup.match(/<([a-zA-Z][\w:.-]*)/) : null;
    return firstElement?.[1].toLowerCase() === 'svg';
}

/**
 * Version of a cover for its URL in `current_cover` (#204, #205).
 *
 * The cover of a speaker is always stored as `coverImage/<ip>.png`. With the same URL for every track,
 * vis does not notice a new cover - switching back to a radio station showed the logo of the other
 * one - and the browser keeps the old image from its cache. The URL gets the hash of the content as
 * query: it changes with the cover, but stays the same for the same image, so the cache still works.
 *
 * @param data content of the cover
 */
export function coverVersion(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 8);
}
