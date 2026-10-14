/**
 * Reports the TCP ports the SONOS libraries listen on to the host (js-controller 8 and newer).
 *
 * Both libraries open an HTTP server for the UPnP events of the speakers, but neither tells which port it got:
 * `sonos-discovery` starts at 3500 and takes the next one when it is taken, `@svrooij/sonos` uses 6329 or
 * `SONOS_LISTENER_PORT`. So the ports are not configured, they are observed: Node publishes every
 * `server.listen()` on the `net.server.listen` tracing channel, and the caller's stack tells whether the
 * library opened it or another adapter running in the same process (compact mode).
 *
 * The UDP sockets for SSDP are not reported: they are opened with `reuseAddr`, so they are not exclusive.
 */
import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { Server } from 'node:net';

interface TcpPortData {
    port: number;
    bind?: string;
    family?: 4 | 6;
}

/** The js-controller 8 calls, which the installed `@iobroker/types` does not know yet */
interface UsedResourcesApi {
    registerUsedResource?(type: 'tcpPort', data: TcpPortData): Promise<void>;
    checkUsedResource?(type: 'tcpPort', data?: Partial<TcpPortData>): Promise<{ instance: string }[]>;
    freeUsedResource?(type: 'tcpPort', data?: Partial<TcpPortData>): Promise<void>;
}

interface ListenMessage {
    server: Server;
}

/** Files of the libraries, as they appear in a stack trace */
const LIBRARY_PATH = /[\\/](?:sonos-discovery|@svrooij[\\/]sonos)[\\/]/;

/** Addresses that mean "all interfaces". The registry assumes that when `bind` is missing. */
const ANY_ADDRESS = new Set(['::', '0.0.0.0']);

export class UsedResources {
    private readonly api: UsedResourcesApi;
    private readonly own = new WeakSet<Server>();
    private readonly channel = diagnosticsChannel.tracingChannel<unknown, ListenMessage>('net.server.listen');

    private readonly subscribers = {
        start: (): void => {},
        end: (): void => {},
        asyncStart: (message: ListenMessage): void => {
            // published synchronously inside listen(), so the stack still holds the caller
            if (LIBRARY_PATH.test(new Error().stack || '')) {
                this.own.add(message.server);
            }
        },
        asyncEnd: (message: ListenMessage): void => {
            if (this.own.has(message.server)) {
                this.register(message.server);
            }
        },
        error: (): void => {},
    };

    constructor(private readonly adapter: ioBroker.Adapter) {
        this.api = adapter as unknown as UsedResourcesApi;
        if (this.supported) {
            this.channel.subscribe(this.subscribers);
        } else {
            this.adapter.log.debug('js-controller does not support used resources, the ports are not reported');
        }
    }

    private get supported(): boolean {
        return typeof this.api.registerUsedResource === 'function';
    }

    /**
     * Warn when another instance already reported the port the library is about to open.
     * Call it before the backend is created, because afterwards the operating system has decided.
     *
     * @param port the port the library tries first
     * @param consequence what happens then, for the warning
     */
    async check(port: number, consequence: string): Promise<void> {
        if (typeof this.api.checkUsedResource !== 'function') {
            return;
        }
        try {
            const holders = await this.api.checkUsedResource('tcpPort', { port });
            if (holders.length) {
                const instances = holders.map(holder => holder.instance).join(', ');
                this.adapter.log.warn(`TCP port ${port} is already used by ${instances}: ${consequence}`);
            }
        } catch (e) {
            this.adapter.log.debug(`Cannot check TCP port ${port}: ${e}`);
        }
    }

    private register(server: Server): void {
        const address = server.address();
        if (!address || typeof address === 'string') {
            return;
        }

        const data: TcpPortData = { port: address.port };
        if (!ANY_ADDRESS.has(address.address)) {
            data.bind = address.address;
            data.family = address.family === 'IPv6' ? 6 : 4;
        }

        this.adapter.log.debug(`Listening for SONOS events on TCP port ${address.port}`);
        this.api
            .registerUsedResource?.('tcpPort', data)
            .catch(e => this.adapter.log.warn(`Cannot report TCP port ${address.port} to the host: ${e}`));

        // the host frees everything on shutdown, so only a server that closes while running matters
        server.once('close', () =>
            this.api
                .freeUsedResource?.('tcpPort', { port: address.port })
                .catch(e => this.adapter.log.debug(`Cannot free TCP port ${address.port}: ${e}`)),
        );
    }

    dispose(): void {
        if (this.supported) {
            this.channel.unsubscribe(this.subscribers);
        }
    }
}
