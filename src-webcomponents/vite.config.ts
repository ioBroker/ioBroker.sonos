import react from '@vitejs/plugin-react';
import { checkManifest, getReactImportPath, REACT_SPECIFIERS, type WebComponentText } from '@iobroker/web-components';
import { readFileSync } from 'node:fs';
import type { Plugin, UserConfig } from 'vite';

// with the extension: Vite may load its config natively, without a bundler that would add it
import { COMPONENTS, MODULE_FOLDER, type ComponentName } from './src/constants.ts';
import { buildManifests, type NativeWidget } from './src/manifests.ts';
import {
    DEVICES_WORDS,
    EXTRA_WORDS,
    LANGUAGES,
    MANIFEST_WORDS,
    VIS_WORDS,
    type Dictionary,
    type Language,
    type WordKey,
} from './src/texts.ts';

/**
 * The web components `<iob-sonos-player>` and `<iob-sonos-rooms>`: one ES module each,
 * `admin/webcomponents/sonos-player.js` and `sonos-rooms.js`, with its manifest next to it (`common.webComponents`).
 * Every host - vis-2, devices, Aura, admin - reads them from `/adapter/sonos/webcomponents/`. No module federation:
 * the host shares nothing but the socket.
 *
 * A host imports exactly one URL per component, so every component is a build of its own with everything it
 * needs compiled in: `vite build --mode player` and `vite build --mode rooms` (`npm run build`, `tasks.mts --wc`).
 *
 * React is not bundled: the four React imports point at `lib/esm/react-19.js`, which web and admin serve beside
 * `adapter/`. The path is relative to the module, so a path prefix of a reverse proxy stays.
 */

/** Reads a file of the adapter, relative to this one */
function readJson<T>(path: string): T {
    return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

/**
 * The words of `texts.ts` in every language: those of the i18n files of the native widgets, and the own ones. A
 * word without English stops the build; another missing language is taken in English.
 */
function readWords(): Record<Language, Dictionary> {
    const english: Partial<Dictionary> = {};
    const words = {} as Record<Language, Dictionary>;
    for (const lang of LANGUAGES) {
        const devices = readJson<Record<string, string>>(`../src-devices/src/i18n/${lang}.json`);
        const vis = readJson<Record<string, string>>(`../src-widgets/src/i18n/${lang}.json`);
        const dictionary: Partial<Dictionary> = { ...EXTRA_WORDS[lang] };
        for (const key of DEVICES_WORDS) {
            dictionary[key] = devices[key];
        }
        for (const key of VIS_WORDS) {
            dictionary[`vis_${key}`] = vis[key];
        }
        if (lang === 'en') {
            for (const [key, text] of Object.entries(dictionary)) {
                if (!text) {
                    throw new Error(`The word "${key}" has no English text`);
                }
            }
            Object.assign(english, dictionary);
        }
        for (const key of Object.keys(english) as WordKey[]) {
            dictionary[key] ||= english[key];
        }
        words[lang] = dictionary as Dictionary;
    }
    return words;
}

/** The ioBroker.devices widgets of the adapter: the components are called like them */
function readNativeWidgets(): Record<ComponentName, NativeWidget> {
    const io = readJson<{
        common: {
            deviceWidgets?: {
                components?: { name: string; label: WebComponentText; description?: WebComponentText }[];
            };
        };
    }>('../io-package.json');
    const native = (name: string): NativeWidget => {
        const widget = io.common.deviceWidgets?.components?.find(component => component.name === name);
        if (!widget) {
            throw new Error(`io-package.json has no ioBroker.devices widget "${name}"`);
        }
        return { label: widget.label, description: widget.description };
    };
    return { player: native('SonosPlayerComponent'), rooms: native('SonosRoomsComponent') };
}

const WORDS = readWords();

/** The words the module shows - without those of the manifests */
const MODULE_WORDS = Object.fromEntries(
    LANGUAGES.map(lang => [
        lang,
        Object.fromEntries(Object.entries(WORDS[lang]).filter(([key]) => !MANIFEST_WORDS.includes(key as WordKey))),
    ]),
);

/** Writes the manifest next to the module, checked like a host checks it */
function manifestFile(name: ComponentName): Plugin {
    return {
        name: 'sonos-web-component-manifest',
        generateBundle() {
            const manifests = buildManifests(key => {
                const text = {} as ioBroker.Translated;
                for (const lang of LANGUAGES) {
                    text[lang] = WORDS[lang][key];
                }
                return text;
            }, readNativeWidgets());
            const manifest = manifests[name];
            const problem = checkManifest(manifest);
            if (problem) {
                this.error(`${COMPONENTS[name].manifest}: ${problem}`);
            }
            this.emitFile({
                type: 'asset',
                fileName: COMPONENTS[name].manifest,
                source: `${JSON.stringify(manifest, null, 4)}\n`,
            });
        },
    };
}

export default ({ mode }: { mode: string }): UserConfig => {
    if (!(mode in COMPONENTS)) {
        throw new Error(
            `Build one component at a time: vite build --mode ${Object.keys(COMPONENTS).join('|')} (not "${mode}")`,
        );
    }
    const name = mode as ComponentName;
    const { module } = COMPONENTS[name];
    const reactImport = getReactImportPath(`${MODULE_FOLDER}/${module}`);

    return {
        plugins: [react(), manifestFile(name)],
        define: {
            'process.env.NODE_ENV': JSON.stringify('production'),
            __SONOS_WORDS__: JSON.stringify(MODULE_WORDS),
        },
        build: {
            target: 'es2022',
            outDir: './build',
            // the other component is built into the same folder; `tasks.mts` empties it before
            emptyOutDir: false,
            lib: {
                entry: `./src/${name}.tsx`,
                formats: ['es'],
                fileName: (): string => module,
            },
            rollupOptions: {
                external: [...REACT_SPECIFIERS],
                output: {
                    paths: Object.fromEntries(REACT_SPECIFIERS.map(specifier => [specifier, reactImport])),
                    // one file: a host imports exactly one URL
                    codeSplitting: false,
                    // library mode keeps whitespace for the bundler of a consumer; this module is loaded as it is
                    minify: true,
                },
            },
        },
    };
};
