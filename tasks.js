/*!
 * Build tasks of ioBroker.sonos
 *
 * Builds the vis-2 widget set in `src-widgets` and copies the bundle into `widgets/sonos/`.
 */
'use strict';

const fs = require('node:fs');
const { deleteFoldersRecursive, npmInstall, buildReact, copyFiles } = require('@iobroker/build-tools');

/** Directory of the vis-2 widget sources */
const SRC_WIDGETS = `${__dirname}/src-widgets`;

/**
 * Copies the built vis-2 widgets into `widgets/sonos/`.
 *
 * The vis-1 widget set lives in the same place - `widgets/sonos.html` and the `css/` and `js/`
 * folders next to it - and must survive, so only the bundle of the previous build is removed.
 */
function copyWidgets() {
    deleteFoldersRecursive(`${__dirname}/widgets/sonos/assets`);
    copyFiles(
        ['src-widgets/build/**/*', '!src-widgets/build/index.html', '!src-widgets/build/mf-manifest.json'],
        'widgets/sonos/',
    );
}

async function installIfNeeded(dir) {
    if (!fs.existsSync(`${dir}/node_modules`)) {
        await npmInstall(dir);
    }
}

async function buildWidgets() {
    deleteFoldersRecursive(`${SRC_WIDGETS}/build`);
    await installIfNeeded(SRC_WIDGETS);
    await buildReact(SRC_WIDGETS, { rootDir: __dirname, vite: true });
    copyWidgets();
}

async function main() {
    if (process.argv.includes('--copy-files')) {
        copyWidgets();
        return;
    }
    await buildWidgets();
}

main().catch(e => {
    console.error(`Cannot build: ${e}`);
    process.exit(2);
});
