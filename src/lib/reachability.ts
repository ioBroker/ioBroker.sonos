/**
 * Reachability check for the `alive` state (#252).
 *
 * The speakers do not announce that they go away: a speaker that loses power or goes to sleep (Move,
 * Roam) simply stops answering, and the group topology keeps listing it for a while - with
 * `@svrooij/sonos` even for good. Everything the adapter does with a speaker goes through its
 * control port, so whether that port accepts a connection is what "alive" means here.
 */
import * as net from 'node:net';

/**
 * Whether a TCP connection to `host:port` can be opened within `timeout` ms. Never rejects.
 *
 * @param host IP address or host name
 * @param port TCP port
 * @param timeout time in ms after which the host counts as unreachable
 */
export function isReachable(host: string, port: number, timeout: number): Promise<boolean> {
    return new Promise(resolve => {
        let settled = false;
        const socket = net.connect({ host, port, timeout });

        const finish = (reachable: boolean): void => {
            if (!settled) {
                settled = true;
                socket.destroy();
                resolve(reachable);
            }
        };

        socket.on('connect', () => finish(true));
        socket.on('timeout', () => finish(false));
        // EHOSTUNREACH, ECONNREFUSED, ... - the listener also keeps the error from being thrown
        socket.on('error', () => finish(false));
    });
}
