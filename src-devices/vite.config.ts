import react from '@vitejs/plugin-react';
import commonjs from 'vite-plugin-commonjs';
import { federation } from '@module-federation/vite';
import { moduleFederationShared } from '@iobroker/dm-widgets/modulefederation.devices.config.js';
import path from 'node:path';
import pack from './package.json';

// `npm run start` (Vite serve) sets command='serve'; the production federation build uses 'build'.
// `@iobroker/dm-widgets` is re-routed to a dev wrapper ONLY during serve, so the standalone dev
// harness gets a fully populated MUI/React bridge without depending on `window.__iobrokerShared__`
// being set in time. Production builds resolve the real package - the federation host (the
// ioBroker.devices tab) supplies the bridge values at runtime.
const isDevServe = process.env.NODE_ENV !== 'production' && !process.argv.includes('build');

const config = {
    plugins: [
        federation({
            manifest: true,
            // Must be unique across all adapters that deliver widgets to ioBroker.devices.
            name: 'DevicesWidgetSonosSet',
            filename: 'customDevices.js',
            exposes: {
                './Components': './src/Components.tsx',
                './translations': './src/translations',
            },
            remotes: {},
            shared: moduleFederationShared(pack),
            dts: false,
        }),
        react(),
        commonjs(),
    ],
    resolve: isDevServe
        ? {
              // The regex is anchored (`^...$`) so sub-path imports such as
              // `@iobroker/dm-widgets/modulefederation.devices.config` - used a few lines above -
              // are not intercepted as well.
              alias: [
                  {
                      find: /^@iobroker\/dm-widgets$/,
                      replacement: path.resolve(__dirname, 'src/dev-dm-widgets.ts'),
                  },
              ],
              tsconfigPaths: true,
          }
        : {
              tsconfigPaths: true,
          },
    server: {
        port: 3000,
        proxy: {
            '/files': 'http://localhost:8081',
            '/adapter': 'http://localhost:8081',
            '/session': 'http://localhost:8081',
            '/log': 'http://localhost:8081',
            '/lib': 'http://localhost:8081',
        },
    },
    base: './',
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
