/**
 * Plain UPnP actions on a speaker, for what neither client library offers.
 */
import * as http from 'node:http';

/** A UPnP service of the speakers: where it is controlled and its name */
export interface UpnpService {
    /** e.g. `/AlarmClock/Control` */
    path: string;
    /** e.g. `urn:schemas-upnp-org:service:AlarmClock:1` */
    urn: string;
}

export const ALARM_CLOCK: UpnpService = {
    path: '/AlarmClock/Control',
    urn: 'urn:schemas-upnp-org:service:AlarmClock:1',
};

export const DEVICE_PROPERTIES: UpnpService = {
    path: '/DeviceProperties/Control',
    urn: 'urn:schemas-upnp-org:service:DeviceProperties:1',
};

export const AV_TRANSPORT: UpnpService = {
    path: '/MediaRenderer/AVTransport/Control',
    urn: 'urn:schemas-upnp-org:service:AVTransport:1',
};

export const ZONE_GROUP_TOPOLOGY: UpnpService = {
    path: '/ZoneGroupTopology/Control',
    urn: 'urn:schemas-upnp-org:service:ZoneGroupTopology:1',
};

/** The speaker answered, but refused the action - unlike a speaker that cannot be reached */
export class SoapError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        /** UPnP error code SONOS explains the refusal with, e.g. 401 for an action the speaker does not know */
        public readonly upnpError?: number,
    ) {
        super(message);
    }
}

/**
 * Text of an element of a SOAP answer
 *
 * @param xml the SOAP answer
 * @param tag name of the element
 * @returns the text still escaped, or undefined if the element is missing
 */
export function soapValue(xml: string, tag: string): string | undefined {
    return xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))?.[1];
}

/**
 * Send one action to a service of a speaker
 *
 * @param baseUrl `http://<ip>:1400` of the speaker
 * @param service the service
 * @param action name of the action
 * @param args the arguments as XML, in the order the service defines them
 * @returns the SOAP answer
 * @throws {SoapError} if the speaker refused the action, and an `Error` if it could not be reached
 */
export function soapCall(baseUrl: string, service: UpnpService, action: string, args = ''): Promise<string> {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="${service.urn}">${args}</u:${action}>
  </s:Body>
</s:Envelope>`;

    const url = new URL(`${baseUrl.replace(/\/$/, '')}${service.path}`);
    const payload = Buffer.from(body, 'utf8');

    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: url.hostname,
                port: url.port || 1400,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'CONTENT-TYPE': 'text/xml; charset="utf-8"',
                    SOAPACTION: `"${service.urn}#${action}"`,
                    'CONTENT-LENGTH': payload.length,
                },
            },
            res => {
                const chunks: Buffer[] = [];
                res.on('data', chunk => chunks.push(chunk as Buffer));
                res.on('end', () => {
                    const xml = Buffer.concat(chunks).toString('utf8');
                    const status = res.statusCode || 500;
                    if (status >= 400) {
                        // SONOS explains a refused action with a UPnP error code only
                        const code = parseInt(soapValue(xml, 'errorCode') || '', 10) || undefined;
                        reject(
                            new SoapError(
                                `${action} failed: HTTP ${status}${code ? `, UPnP error ${code}` : ''}`,
                                status,
                                code,
                            ),
                        );
                        return;
                    }
                    resolve(xml);
                });
            },
        );
        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error(`${action} timed out`));
        });
        req.write(payload);
        req.end();
    });
}
