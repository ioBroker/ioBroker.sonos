/**
 * Housekeeping of the cover cache (`iobroker-data/sonosCache`, #222).
 *
 * Every cover a speaker reports is downloaded once and kept under the md5 of its URI, so a cover
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
    return crypto.createHash('md5').update(data).digest('hex').substring(0, 8);
}
