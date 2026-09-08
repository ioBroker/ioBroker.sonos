/// <reference types="vite/client" />

declare global {
    /**
     * The socket client the `web` adapter delivers under `socket.io.js` - either the real
     * socket.io client or the compatible one of `@iobroker/ws`. See `socket.ts`.
     */

    var io: unknown;

    var iob: unknown;
}

export {};
