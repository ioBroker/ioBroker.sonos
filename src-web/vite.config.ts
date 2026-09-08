import react from '@vitejs/plugin-react';

// The page is served by the `web` adapter out of the ioBroker file storage of this adapter:
// `iobroker upload sonos` puts `www/` there, and web's catch-all route reads
// `<first path segment>` as the adapter name - so `http://<host>:8082/sonos/` is this app.
//
// Because of that the app must not use absolute asset paths (`base: './'`) and must not rely on
// server-side routing: web answers exactly the files that exist, there is no SPA fallback.
const config = {
    plugins: [react()],
    base: './',
    server: {
        // `index.html` recognizes the dev server by this port and then loads the socket client
        // straight from the web adapter - so the port is not free to choose.
        port: 3000,
        proxy: {
            // How the page reaches the socket of this web instance: `socketUrl` and friends.
            '/_socket': 'http://localhost:8082',
            // Cover images live in the file storage of the adapter: `current_cover` holds
            // `/sonos/coverImage/<ip>.png`, which the web adapter serves from there.
            '/sonos': 'http://localhost:8082',
        },
    },
    build: {
        target: 'chrome89',
        outDir: './build',
        // One page, one bundle: every file has to be uploaded into the ioBroker file storage,
        // and the whole app is far below what a lazy-loaded chunk would save.
        chunkSizeWarningLimit: 1024,
        rollupOptions: {
            output: {
                codeSplitting: false,
                entryFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash][extname]',
            },
        },
    },
};

export default config;
