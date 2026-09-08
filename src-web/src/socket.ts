// Connection to ioBroker through the socket of the `web` adapter that serves this page.
//
// The socket client itself is NOT bundled: the web adapter answers every request ending in
// `socket.io.js` with the client that matches how that instance is configured - the real
// socket.io client, or the compatible one of `@iobroker/ws`. Both define `globalThis.io`, which
// is what `@iobroker/socket-client` waits for.

import { Connection } from '@iobroker/socket-client';

/** Injects `<host>/sonos/socket.io.js`, i.e. whatever client this web instance delivers. */
function loadSocketClient(): Promise<void> {
    if (globalThis.io || globalThis.iob) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        // Relative to the page, so it works under /sonos/ as well as behind a reverse proxy
        script.src = './socket.io.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Cannot load socket.io.js from the web adapter'));
        document.head.appendChild(script);
    });
}

/**
 * The port of the ioBroker web instance.
 *
 * In production the page is served by that instance, so its own port is the right one. `npm start`
 * serves the page from vite instead - there the default web port is used, and `vite.config.ts`
 * proxies the socket to it.
 */
function webPort(): string | number {
    if (import.meta.env.DEV) {
        return 8082;
    }
    return globalThis.location.port || (globalThis.location.protocol === 'https:' ? 443 : 80);
}

export async function createConnection(
    onReady: () => void,
    onConnection: (connected: boolean) => void,
): Promise<Connection> {
    await loadSocketClient();

    const socket = new Connection({
        name: 'sonos',
        protocol: globalThis.location.protocol as 'http:' | 'https:',
        host: globalThis.location.hostname,
        port: webPort(),
        doNotLoadAllObjects: true,
        onReady: () => onReady(),
        onError: (error: unknown) => console.error(`Socket error: ${error as string}`),
    });

    socket.registerConnectionHandler(onConnection);

    return socket;
}
