/**
 * Where the browser finds a picture of the file storage of ioBroker.
 *
 * The adapter writes the cover of a speaker into its file storage and names it in `current_cover` as a path:
 * `/sonos/coverImage/192_168_1_50.png?v=...`. Every host serves the file storage under another root - web (vis-2,
 * Aura as a web extension) at `<base>/sonos/...`, admin (devices, admin tabs) at `<base>/files/sonos/...`, the own
 * server of Aura at `<base>/webfs/sonos/...` - and the element cannot ask its host which one it is. So it tries the
 * roots one after another and keeps the one that answered for the next picture.
 *
 * `<base>` is where the host serves `adapter/`: this module lies at `<base>/adapter/sonos/webcomponents/`. That keeps
 * the path prefix of a reverse proxy.
 */

/** The roots of the file storage below `<base>`, in the order they are tried */
const ROOTS = ['', 'files/', 'webfs/'];

/**
 * `<base>/` for the URL of this module
 *
 * @param moduleUrl e.g. `https://example.com/iob/adapter/sonos/webcomponents/sonos-player.js`
 * @returns e.g. `https://example.com/iob/`
 */
export function getBaseUrl(moduleUrl: string): string {
    const url = new URL(moduleUrl);
    url.search = '';
    url.hash = '';
    // `<base>/adapter/sonos/webcomponents/<module>.js`
    const segments = url.pathname.split('/');
    url.pathname = `${segments.slice(0, Math.max(1, segments.length - 4)).join('/')}/`;
    return url.href;
}

const BASE = getBaseUrl(import.meta.url);

/** The root that answered last, tried first */
let workingRoot = 0;

/**
 * The URLs to try for a picture, the most likely first
 *
 * @param url a path of the file storage (`/sonos/coverImage/...`) or a URL the browser loads as it is
 */
export function getImageCandidates(url: string): string[] {
    if (!url) {
        return [];
    }
    if (!/^\/[^/]/.test(url)) {
        return [url];
    }
    const path = url.substring(1);
    const order = [workingRoot, ...ROOTS.keys()].filter((root, i, all) => all.indexOf(root) === i);
    return order.map(root => `${BASE}${ROOTS[root]}${path}`);
}

/**
 * Keep the root of a URL that answered, so that the next picture is asked there first
 *
 * @param candidate one of `getImageCandidates()`
 */
export function rememberImage(candidate: string): void {
    // the longest root first: `<base>/` is a prefix of all of them
    for (let root = ROOTS.length - 1; root >= 0; root--) {
        if (candidate.startsWith(`${BASE}${ROOTS[root]}`)) {
            workingRoot = root;
            return;
        }
    }
}
