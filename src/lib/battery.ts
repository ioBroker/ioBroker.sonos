/**
 * Battery of the portable speakers, Move and Roam (#116, #211).
 *
 * The speakers report it on a status page of their own web server, not over UPnP, so neither
 * client library knows it. Speakers without a battery answer that page without one.
 */
import * as http from 'node:http';

export interface BatteryStatus {
    /** Charge in percent */
    level: number;
    /** `BATTERY`, `SONOS_CHARGING_RING` or `USB_POWER` */
    powerSource: string;
    /** True while the speaker is on external power, which is when the SONOS app shows it charging */
    charging: boolean;
}

/**
 * The battery out of the status page
 *
 * @param xml `<ZPSupportInfo><LocalBatteryStatus><Data name="Level">87</Data>...`
 * @returns null if the speaker has no battery - or runs S1 firmware, which leaves the page empty
 */
export function parseBatteryStatus(xml: string): BatteryStatus | null {
    const block = xml.match(/<LocalBatteryStatus>([\s\S]*?)<\/LocalBatteryStatus>/i)?.[1];
    if (!block) {
        return null;
    }

    const data: Record<string, string> = {};
    for (const [, name, value] of block.matchAll(/<Data\s+name="([^"]+)"\s*>([^<]*)<\/Data>/gi)) {
        data[name] = value.trim();
    }

    const level = parseInt(data.Level, 10);
    if (isNaN(level)) {
        return null;
    }

    const powerSource = data.PowerSource || '';
    return { level, powerSource, charging: !!powerSource && powerSource !== 'BATTERY' };
}

/**
 * Read the battery of a speaker
 *
 * @param ip IP address of the speaker
 * @param port control port of the speaker
 * @param timeout ms to wait for the answer
 * @returns null if the speaker has no battery
 * @throws {Error} if the speaker cannot be reached, so that it is asked again later
 */
export function readBatteryStatus(ip: string, port = 1400, timeout = 3000): Promise<BatteryStatus | null> {
    return new Promise((resolve, reject) => {
        const req = http.get({ host: ip, port, path: '/status/batterystatus', timeout }, res => {
            const chunks: Buffer[] = [];
            res.on('data', chunk => chunks.push(chunk as Buffer));
            res.on('end', () => {
                const status = res.statusCode || 500;
                if (status >= 500) {
                    reject(new Error(`HTTP ${status}`));
                } else {
                    // a speaker without the page has no battery either
                    resolve(status === 200 ? parseBatteryStatus(Buffer.concat(chunks).toString('utf8')) : null);
                }
            });
        });
        req.on('timeout', () => req.destroy(new Error('timed out')));
        req.on('error', reject);
    });
}
