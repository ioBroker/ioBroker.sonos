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
        port: 4174,
        proxy: {
            // The socket client is delivered by the web adapter itself - it sends either the
            // socket.io client or the @iobroker/ws one, depending on how that instance is set up.
            '/socket.io.js': {
                target: 'http://localhost:8082',
                changeOrigin: true,
                rewrite: () => '/sonos/socket.io.js',
            },
            '/socket.io': 'http://localhost:8082',
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
