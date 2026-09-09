/*!
 * Build tasks of ioBroker.sonos
 *
 * Four independent front-ends live next to the adapter, all built with vite - the first three
 * additionally with module federation:
 *
 *   src-widgets/  -> widgets/sonos/       the vis-2 widget set (loaded by vis-2)
 *   src-admin/    -> admin/custom/        the JsonConfig `custom` component of the "Control" tab
 *   src-devices/  -> admin/dm-widgets/    the widgets ioBroker.devices shows in its dashboard
 *   src-web/      -> www/                 the control page the `web` adapter serves at /sonos/
 *
 * `npm run build` builds the adapter and all four front-ends - that is what CI and `npm publish`
 * run. The two admin bundles take several minutes each because module federation pre-builds the
 * whole shared GUI stack, so their result is committed instead of being rebuilt on install:
 * `npm run build:admin` / `npm run build:devices` rebuild just one of them, and the output has to
 * be committed whenever something under `src-admin/` or `src-devices/` changed.
 *
 * This file is run straight from source - `node tasks.mts` - by the type stripping node brings
 * along, so it must stay free of syntax that a compiler would have to rewrite (`enum`,
 * `namespace`, parameter properties). `npm run check:ts` enforces that with `erasableSyntaxOnly`.
 */
import { existsSync } from 'node:fs';
import { deleteFoldersRecursive, npmInstall, buildReact, copyFiles, patchHtmlFile } from '@iobroker/build-tools';

/** Directory of this file, and with it the root of the adapter */
const ROOT: string = import.meta.dirname;
/** Directory of the vis-2 widget sources */
const SRC_WIDGETS = `${ROOT}/src-widgets`;
/** Directory of the JsonConfig custom component */
const SRC_ADMIN = `${ROOT}/src-admin`;
/** Directory of the ioBroker.devices widgets */
const SRC_DEVICES = `${ROOT}/src-devices`;
/** Directory of the control page for the web adapter */
const SRC_WEB = `${ROOT}/src-web`;

/**
 * Copies the built vis-2 widgets into `widgets/sonos/`.
 *
 * The vis-1 widget set lives in the same place - `widgets/sonos.html` and the `css/` and `js/`
 * folders next to it - and must survive, so only the bundle of the previous build is removed.
 */
function copyWidgets(): void {
    deleteFoldersRecursive(`${ROOT}/widgets/sonos/assets`);
    // mf-manifest.json is kept: vis-2 reads it to decide whether the set was built against a
    // compatible React, and asks for it before mf-stats.json (see visWidgetSetCompatibility.ts).
    copyFiles(['src-widgets/build/**/*', '!src-widgets/build/index.html'], 'widgets/sonos/');
}

/**
 * Copies the built JsonConfig component into `admin/custom/`.
 *
 * `mf-manifest.json` is copied on purpose: admin fetches it next to the remote entry to decide
 * from the shared modules which GUI API generation the component was built against, and refuses
 * to start a component built for an older one.
 */
function copyAdmin(): void {
    copyFiles(['src-admin/build/**/*', '!src-admin/build/index.html'], 'admin/custom/');
    copyFiles(['src-admin/src/i18n/*.json'], 'admin/custom/i18n');
}

/**
 * Copies the built ioBroker.devices widgets into `admin/dm-widgets/`, from where the devices
 * adapter loads them - see `common.deviceWidgets` in io-package.json.
 */
function copyDevices(): void {
    copyFiles(['src-devices/build/**/*', '!src-devices/build/index.html'], 'admin/dm-widgets/');
    copyFiles(['src-devices/img/**/*'], 'admin/dm-widgets');
    copyFiles(['src-devices/src/i18n/*.json'], 'admin/dm-widgets/i18n');
}

/**
 * Copies the built control page into `www/`.
 *
 * `iobroker upload sonos` puts that folder into the ioBroker file storage of this adapter, and the
 * web adapter serves it from there - its catch-all route reads the first path segment as the
 * adapter name, so `http://<host>:8082/sonos/` is `www/index.html`. No web extension is involved.
 */
async function copyWeb(): Promise<void> {
    copyFiles(['src-web/build/**/*'], 'www/');
    await patchHtmlFile('www/index.html', '..');
}

async function installIfNeeded(dir: string): Promise<void> {
    if (!existsSync(`${dir}/node_modules`)) {
        await npmInstall(dir);
    }
}

async function buildWidgets(): Promise<void> {
    deleteFoldersRecursive(`${SRC_WIDGETS}/build`);
    await installIfNeeded(SRC_WIDGETS);
    await buildReact(SRC_WIDGETS, { rootDir: ROOT, vite: true });
    copyWidgets();
}

async function buildAdmin(): Promise<void> {
    deleteFoldersRecursive(`${ROOT}/admin/custom`);
    deleteFoldersRecursive(`${SRC_ADMIN}/build`);
    await installIfNeeded(SRC_ADMIN);
    await buildReact(SRC_ADMIN, { rootDir: SRC_ADMIN, vite: true });
    copyAdmin();
}

async function buildDevices(): Promise<void> {
    deleteFoldersRecursive(`${ROOT}/admin/dm-widgets`);
    deleteFoldersRecursive(`${SRC_DEVICES}/build`);
    await installIfNeeded(SRC_DEVICES);
    await buildReact(SRC_DEVICES, { rootDir: SRC_DEVICES, vite: true });
    copyDevices();
}

async function buildWeb(): Promise<void> {
    deleteFoldersRecursive(`${ROOT}/www`);
    deleteFoldersRecursive(`${SRC_WEB}/build`);
    await installIfNeeded(SRC_WEB);
    await buildReact(SRC_WEB, { rootDir: SRC_WEB, vite: true });
    await copyWeb();
}

async function main(): Promise<void> {
    if (process.argv.includes('--copy-files')) {
        copyWidgets();
        return;
    }
    if (process.argv.includes('--admin')) {
        await buildAdmin();
        return;
    }
    if (process.argv.includes('--devices')) {
        await buildDevices();
        return;
    }
    if (process.argv.includes('--web')) {
        await buildWeb();
        return;
    }
    if (process.argv.includes('--all')) {
        await buildWidgets();
        await buildWeb();
        await buildAdmin();
        await buildDevices();
        return;
    }
    await buildWidgets();
}

main().catch((e: unknown) => {
    console.error(`Cannot build: ${e as string}`);
    process.exit(2);
});
