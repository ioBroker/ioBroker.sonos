// @ts-expect-error no types
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { moduleFederationShared } from '@iobroker/types-vis-2/modulefederation.vis.config';
import { readFileSync } from 'node:fs';

// The shared modules come from @iobroker/types-vis-2, so they stay in sync with what the vis-2 host
// provides. Passing package.json filters the list down to the packages this widget set really uses.
const pack = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const config = {
    plugins: [
        federation({
            manifest: true,
            name: 'vis2SonosWidgets',
            filename: 'customWidgets.js',
            exposes: {
                './SonosPlayer': './src/SonosPlayer',
                './SonosRoom': './src/SonosRoom',
                './translations': './src/translations.ts',
            },
            remotes: {},
            shared: moduleFederationShared(pack),
            dts: false,
        }),
        react(),
    ],
    server: {
        port: 4173,
        proxy: {
            '/_socket': 'http://localhost:8082',
            '/vis.0': 'http://localhost:8082',
            '/adapter': 'http://localhost:8082',
            '/vis': 'http://localhost:8082',
            '/widgets': 'http://localhost:8082/vis',
            '/widgets.html': 'http://localhost:8082/vis',
            '/web': 'http://localhost:8082',
            '/state': 'http://localhost:8082',
        },
    },
    base: './',
    resolve: {
        tsconfigPaths: true,
        // the fallback copies inside the widget bundle must be unique too
        dedupe: ['react', 'react-dom', '@emotion/react', '@mui/material'],
    },
    build: {
        // module federation emits top level await, which needs Chrome 89 or newer
        target: 'chrome89',
        outDir: './build',
        rollupOptions: {
            onwarn(warning: { code: string }, warn: (warning: { code: string }) => void): void {
                // Suppress "Module level directives cause errors when bundled" warnings
                if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
                    return;
                }
                warn(warning);
            },
        },
    },
};

export default config;
