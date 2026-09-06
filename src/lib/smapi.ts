/**
 * Sonos Music API (SMAPI) client for Spotify and other music services.
 *
 * Tokens: speaker /status/accounts when still readable, plus tokens saved after
 * AppLink/DeviceLink (and after TokenRefreshRequired). Catalog browse is
 * getMetadata/search against the service SecureUri; playback uses the same
 * URI/DIDL patterns as the official Sonos controllers.
 */
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

import { mediaItem } from './content-directory';
import type { MediaBrowseItem } from './content-directory';

const SMAPI_NS = 'http://www.sonos.com/Services/1.1';
const USER_AGENT = 'Linux UPnP/1.0 Sonos/29.3-87071 (ICRU_iPhone7,1); iOS/Version 8.2 (Build 12D508)';
const BROWSE_COUNT = 100;

export interface MusicServiceInfo {
    name: string;
    id: number;
    type: number;
    uri: string;
    secureUri: string;
    auth: string;
}

export interface SmapiToken {
    token: string;
    key: string;
    sn: string;
}

export interface SmapiBrowseResult {
    items: MediaBrowseItem[];
    loginUrl?: string;
    loginHint?: string;
}

interface SmapiEntry {
    id: string;
    title: string;
    itemType: string;
    artist: string;
    album: string;
    cover: string;
    canPlay: boolean;
    canEnumerate: boolean;
}

class SmapiAuthError extends Error {
    constructor(message = 'SMAPI authentication required') {
        super(message);
        this.name = 'SmapiAuthError';
    }
}

type Logger = {
    debug(msg: string): void;
    warn(msg: string): void;
    info(msg: string): void;
};

function xmlEscape(value: string): string {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function decodeXml(value: string): string {
    return String(value)
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

function tagRe(tag: string): string {
    return `(?:[\\w.-]+:)?${tag}`;
}

function tagText(xml: string, tag: string): string {
    const name = tagRe(tag);
    const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
    return match ? decodeXml(match[1]).trim() : '';
}

function eachTag(xml: string, tag: string, onChunk: (innerAndTag: string) => void): void {
    const name = tagRe(tag);
    const re = new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?</${name}>`, 'gi');
    xml.replace(re, chunk => {
        onChunk(chunk);
        return '';
    });
}

function attr(xml: string, name: string): string {
    const match = xml.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'));
    return match ? decodeXml(match[1]) : '';
}

function isTrue(value: string | boolean | undefined): boolean {
    return value === true || value === 'true' || value === '1';
}

function parseAuth(raw: string): string {
    const value = String(raw || '').trim();
    if (value === '0') {
        return 'Anonymous';
    }
    if (value === '1') {
        return 'UserId';
    }
    if (value === '2') {
        return 'DeviceLink';
    }
    if (value === '3') {
        return 'AppLink';
    }
    return value || 'Anonymous';
}

function needsLoginToken(auth: string): boolean {
    return auth === 'DeviceLink' || auth === 'AppLink';
}

function isSoapSmapi(service: MusicServiceInfo): boolean {
    const url = `${service.secureUri || service.uri}`;
    return Boolean(url) && !/googleapis\.com|v1:sendRequest/i.test(url);
}

const FALLBACK_SERVICES: MusicServiceInfo[] = [
    {
        name: 'Spotify',
        id: 9,
        type: 2311,
        uri: 'https://spotify-v5.ws.sonos.com/smapi',
        secureUri: 'https://spotify-v5.ws.sonos.com/smapi',
        auth: 'AppLink',
    },
];

const SEARCH_IDS = [
    'search:track',
    'search:album',
    'search:artist',
    'search:playlist',
    'search:station',
    'tracks',
    'albums',
    'artists',
    'playlists',
    'all',
];

function colonEncode(id: string): string {
    return id.replace(/:/g, '%3a');
}

function httpBody(
    url: URL,
    options: https.RequestOptions,
    payload: Buffer,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
    const lib = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
        const req = lib.request(
            {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: `${url.pathname}${url.search}`,
                method: 'POST',
                ...options,
            },
            res => {
                const chunks: Buffer[] = [];
                res.on('data', chunk => chunks.push(chunk as Buffer));
                res.on('end', () => {
                    const raw = Buffer.concat(chunks);
                    const encoding = String(res.headers['content-encoding'] || '').toLowerCase();
                    let text = raw.toString('utf8');
                    try {
                        if (encoding.includes('gzip')) {
                            text = zlib.gunzipSync(raw).toString('utf8');
                        } else if (encoding.includes('deflate')) {
                            text = zlib.inflateSync(raw).toString('utf8');
                        }
                    } catch {
                        text = raw.toString('utf8');
                    }
                    resolve({ status: res.statusCode || 500, headers: res.headers, body: text });
                });
            },
        );
        req.on('error', reject);
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error(`SMAPI request timed out: ${url.href}`));
        });
        req.write(payload);
        req.end();
    });
}

async function httpGet(url: string): Promise<string> {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
        const req = lib.request(
            {
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: `${parsed.pathname}${parsed.search}`,
                method: 'GET',
            },
            res => {
                const chunks: Buffer[] = [];
                res.on('data', chunk => chunks.push(chunk as Buffer));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            },
        );
        req.on('error', reject);
        req.setTimeout(8000, () => {
            req.destroy();
            reject(new Error(`GET ${url} timed out`));
        });
        req.end();
    });
}

async function upnpSoap(baseUrl: string, controlPath: string, action: string, innerXml: string): Promise<string> {
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>${innerXml}</s:Body>
</s:Envelope>`;
    const url = new URL(`${baseUrl.replace(/\/$/, '')}${controlPath}`);
    const payload = Buffer.from(envelope, 'utf8');
    const res = await httpBody(
        url,
        {
            headers: {
                'CONTENT-TYPE': 'text/xml; charset="utf-8"',
                SOAPACTION: `"${action}"`,
                'CONTENT-LENGTH': payload.length,
            },
        },
        payload,
    );
    if (res.status >= 400) {
        throw new Error(`UPnP ${action} failed: HTTP ${res.status}`);
    }
    return res.body;
}

function smapiEnvelope(
    action: string,
    inner: string,
    creds: { deviceId: string; householdId: string; token?: string; key?: string; loginToken?: boolean },
): string {
    const tokenXml =
        creds.loginToken || creds.token || creds.key
            ? `<s:loginToken>
        <s:token>${xmlEscape(creds.token || '')}</s:token>
        <s:key>${xmlEscape(creds.key || '')}</s:key>
        <s:householdId>${xmlEscape(creds.householdId)}</s:householdId>
      </s:loginToken>`
            : '';
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:s="${SMAPI_NS}">
  <soap:Header>
    <s:context>
      <s:timezone>+01:00</s:timezone>
    </s:context>
    <s:credentials>
      <s:deviceId>${xmlEscape(creds.deviceId)}</s:deviceId>
      <s:deviceProvider>Sonos</s:deviceProvider>
      ${tokenXml}
    </s:credentials>
  </soap:Header>
  <soap:Body>
    <s:${action}>${inner}</s:${action}>
  </soap:Body>
</soap:Envelope>`;
}

function extractFault(xml: string): { code: string; string: string; detail: string } | undefined {
    if (!/<[\w.-:]*Fault[\s>/]/i.test(xml) && !/<[\w.-:]*faultcode[\s>/]/i.test(xml)) {
        return undefined;
    }
    return {
        code: tagText(xml, 'faultcode') || tagText(xml, 'faultCode'),
        string: tagText(xml, 'faultstring') || tagText(xml, 'faultString'),
        detail: xml,
    };
}

function parseSmapiEntries(xml: string): SmapiEntry[] {
    const source = xml.includes('&lt;media') ? decodeXml(xml) : xml;
    const entries: SmapiEntry[] = [];
    const push = (chunk: string, isCollection: boolean): void => {
        const id = tagText(chunk, 'id');
        const title = tagText(chunk, 'title');
        if (!id && !title) {
            return;
        }
        const itemType = tagText(chunk, 'itemType') || (isCollection ? 'collection' : 'track');
        let trackMeta = '';
        let streamMeta = '';
        eachTag(chunk, 'trackMetadata', inner => {
            trackMeta = inner;
        });
        eachTag(chunk, 'streamMetadata', inner => {
            streamMeta = inner;
        });
        entries.push({
            id: id || title,
            title: title || id,
            itemType,
            artist: tagText(trackMeta, 'artist') || tagText(chunk, 'artist'),
            album: tagText(trackMeta, 'album') || tagText(chunk, 'album'),
            cover: tagText(chunk, 'albumArtURI') || tagText(trackMeta, 'albumArtURI') || tagText(streamMeta, 'logo'),
            canPlay: isTrue(tagText(chunk, 'canPlay') || tagText(trackMeta, 'canPlay')) || !isCollection,
            canEnumerate: isCollection || isTrue(tagText(chunk, 'canEnumerate')),
        });
    };

    eachTag(source, 'mediaCollection', chunk => push(chunk, true));
    eachTag(source, 'mediaMetadata', chunk => push(chunk, false));
    return entries;
}

function didl(itemId: string, parentId: string, title: string, upnpClass: string, desc: string): string {
    return `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
  <item id="${xmlEscape(itemId)}" parentID="${xmlEscape(parentId)}" restricted="true">
    <dc:title>${xmlEscape(title)}</dc:title>
    <upnp:class>${xmlEscape(upnpClass)}</upnp:class>
    <desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">${xmlEscape(desc)}</desc>
  </item>
</DIDL-Lite>`;
}

function serviceDesc(service: MusicServiceInfo): string {
    if (needsLoginToken(service.auth)) {
        return `SA_RINCON${service.type}_X_#Svc${service.type}-0-Token`;
    }
    return `SA_RINCON${service.type}_`;
}

export function encodeSmapiId(serviceName: string, objectId: string): string {
    return `smapi:${encodeURIComponent(serviceName)}:${encodeURIComponent(objectId)}`;
}

export function parseSmapiId(objectId: string): { serviceName: string; itemId: string } | undefined {
    if (!objectId.startsWith('smapi:')) {
        return undefined;
    }
    const rest = objectId.slice('smapi:'.length);
    const colon = rest.indexOf(':');
    if (colon === -1) {
        return { serviceName: decodeURIComponent(rest), itemId: 'root' };
    }
    return {
        serviceName: decodeURIComponent(rest.slice(0, colon)),
        itemId: decodeURIComponent(rest.slice(colon + 1)) || 'root',
    };
}

function playTarget(
    service: MusicServiceInfo,
    item: SmapiEntry,
    sn: string,
): { uri: string; metadata: string; folder: boolean } | undefined {
    const sid = service.id;
    const encoded = colonEncode(item.id);
    const desc = serviceDesc(service);
    const itemType = item.itemType.toLowerCase();
    const isSpotify = service.id === 9 || service.name.toLowerCase() === 'spotify';
    const folder =
        item.canEnumerate && !['track', 'stream', 'program', 'show', 'audiobook', 'podcast'].includes(itemType);
    const playableType = ['track', 'stream', 'program', 'show', 'audiobook', 'podcast', 'artistradio'].includes(
        itemType,
    );
    const playContainer = item.canPlay && folder;

    if (itemType === 'search') {
        return { uri: '', metadata: '', folder: true };
    }

    let uri = '';
    let upnpClass = 'object.item.audioItem.musicTrack';
    let didlId = '-1';
    const parentId = '-1';

    if (isSpotify) {
        if (itemType === 'album') {
            uri = `x-rincon-cpcontainer:1004206c${encoded}?sid=9&flags=8300&sn=${sn}`;
            didlId = `0004206c${encoded}`;
            upnpClass = 'object.container.album.musicAlbum';
        } else if (itemType === 'playlist' || itemType === 'favorites') {
            uri = `x-rincon-cpcontainer:1006206c${encoded}?sid=9&flags=8300&sn=${sn}`;
            didlId = `1006206c${encoded}`;
            upnpClass = 'object.container.playlistContainer';
        } else if (itemType === 'artistradio') {
            uri = `x-sonosapi-radio:${encoded}?sid=9&flags=8300&sn=${sn}`;
            didlId = `100c206c${encoded}`;
            upnpClass = 'object.item.audioItem.audioBroadcast.#artistRadio';
        } else if (itemType === 'artisttoptracks' || itemType === 'artisttracklist') {
            uri = `x-rincon-cpcontainer:100e206c${encoded}?sid=9&flags=8300&sn=${sn}`;
            didlId = `100e206c${encoded}`;
            upnpClass = 'object.container.playlistContainer';
        } else if (itemType === 'stream' || itemType === 'program') {
            uri = `x-sonosapi-radio:${encoded}?sid=9&flags=8300&sn=${sn}`;
            upnpClass = 'object.item.audioItem.audioBroadcast';
        } else if (itemType === 'track' || playableType) {
            uri = `x-sonos-spotify:${encoded}?sid=9&flags=8224&sn=${sn}`;
            didlId = `00032020${encoded}`;
        } else if (playContainer) {
            uri = `x-rincon-cpcontainer:1006206c${encoded}?sid=9&flags=8300&sn=${sn}`;
            didlId = `1006206c${encoded}`;
            upnpClass = 'object.container.playlistContainer';
        }
    } else if (itemType === 'stream' || itemType === 'program') {
        uri = `x-sonosapi-stream:${item.id}?sid=${sid}`;
        upnpClass = 'object.item.audioItem.audioBroadcast';
    } else if (itemType === 'track' || playableType) {
        uri = `x-sonos-http:${encoded}?sid=${sid}&flags=8224&sn=${sn}`;
    } else if (playContainer) {
        uri = `x-rincon-cpcontainer:1006206c${encoded}?sid=${sid}&flags=8300&sn=${sn}`;
        upnpClass = 'object.container.playlistContainer';
    }

    if (!uri && !folder) {
        return undefined;
    }

    return {
        uri,
        metadata: uri ? didl(didlId, parentId, item.title, upnpClass, desc) : '',
        folder,
    };
}

function toBrowseItem(service: MusicServiceInfo, item: SmapiEntry, sn: string): MediaBrowseItem | undefined {
    if (item.itemType.toLowerCase() === 'search') {
        return undefined;
    }
    const target = playTarget(service, item, sn);
    if (!target) {
        return undefined;
    }
    const playNow = item.canPlay && Boolean(target.uri);
    const folder = target.folder && !playNow;
    return mediaItem({
        id: encodeSmapiId(service.name, item.id),
        title: item.title,
        uri: folder ? '' : target.uri,
        metadata: folder ? '' : target.metadata,
        artist: item.artist,
        album: item.album,
        cover: item.cover,
        folder,
    });
}

export class SmapiHub {
    private services?: MusicServiceInfo[];
    private deviceId?: string;
    private householdId?: string;
    private tokens = new Map<string, SmapiToken>();
    private serials = new Map<string, string>();
    private pendingLink = new Map<string, string>();
    private accountsFetched = 0;

    constructor(
        private readonly log: Logger,
        private readonly tokenFile: string,
    ) {
        this.loadTokens();
    }

    private loadTokens(): void {
        try {
            const raw = fs.readFileSync(this.tokenFile, 'utf8');
            const parsed = JSON.parse(raw) as Record<string, SmapiToken>;
            Object.keys(parsed || {}).forEach(key => {
                if (parsed[key]?.token) {
                    this.tokens.set(key, parsed[key]);
                }
            });
        } catch {
            // first run or unreadable file
        }
    }

    /**
     * These are third-party music service credentials, so the file must not be
     * world-readable. `mode` only applies while creating, so an existing file gets
     * an explicit chmod as well (a no-op on Windows).
     */
    private saveTokens(): void {
        try {
            fs.mkdirSync(path.dirname(this.tokenFile), { recursive: true, mode: 0o700 });
            const data: Record<string, SmapiToken> = {};
            this.tokens.forEach((value, key) => {
                data[key] = value;
            });
            fs.writeFileSync(this.tokenFile, JSON.stringify(data, null, 2), { mode: 0o600 });
            try {
                fs.chmodSync(this.tokenFile, 0o600);
            } catch {
                // Windows and some network shares do not support POSIX modes
            }
        } catch (err) {
            this.log.warn(`Cannot save SMAPI tokens: ${err}`);
        }
    }

    private tokenKey(service: MusicServiceInfo): string {
        return String(service.id);
    }

    async listServices(baseUrl: string): Promise<MusicServiceInfo[]> {
        if (this.services?.length) {
            return this.services;
        }
        const services: MusicServiceInfo[] = [];
        try {
            const xml = await upnpSoap(
                baseUrl,
                '/MusicServices/Control',
                'urn:schemas-upnp-org:service:MusicServices:1#ListAvailableServices',
                '<u:ListAvailableServices xmlns:u="urn:schemas-upnp-org:service:MusicServices:1"></u:ListAvailableServices>',
            );
            let descriptor = tagText(xml, 'AvailableServiceDescriptorList');
            if (!/<(?:[\w.-]+:)?Service\b/i.test(descriptor)) {
                descriptor = decodeXml(descriptor);
            }
            eachTag(descriptor, 'Service', chunk => {
                const open = chunk.match(/<(?:[\w.-]+:)?Service\b([^>]*)>/i)?.[1] || '';
                const id = parseInt(attr(open, 'Id') || attr(open, 'id') || '0', 10);
                const name = attr(open, 'Name') || attr(open, 'name');
                if (!id || !name) {
                    return;
                }
                const policyOpen = chunk.match(/<(?:[\w.-]+:)?Policy\b([^>]*)\/?>/i)?.[0] || '';
                services.push({
                    name,
                    id,
                    type: id * 256 + 7,
                    uri: attr(open, 'Uri') || attr(open, 'uri'),
                    secureUri: attr(open, 'SecureUri') || attr(open, 'secureUri') || attr(open, 'Uri'),
                    auth: parseAuth(attr(policyOpen, 'Auth')),
                });
            });
        } catch (err) {
            this.log.warn(`SMAPI: cannot list music services: ${err}`);
        }
        FALLBACK_SERVICES.forEach(fallback => {
            if (
                !services.some(
                    item => item.id === fallback.id || item.name.toLowerCase() === fallback.name.toLowerCase(),
                )
            ) {
                services.push(fallback);
            }
        });
        this.services = services;
        this.log.info(
            `SMAPI: ${services.length} music services (${services
                .map(item => item.name)
                .slice(0, 8)
                .join(', ')})`,
        );
        return services;
    }

    async findService(baseUrl: string, name: string): Promise<MusicServiceInfo | undefined> {
        const services = await this.listServices(baseUrl);
        const lower = name.toLowerCase();
        return (
            services.find(item => item.name.toLowerCase() === lower) ||
            services.find(item => item.name.toLowerCase().includes(lower) || lower.includes(item.name.toLowerCase()))
        );
    }

    /** True for services that speak the SOAP SMAPI protocol and therefore have a browsable catalog. */
    async hasSoapCatalog(baseUrl: string, serviceName: string): Promise<boolean> {
        const service = await this.findService(baseUrl, serviceName);
        return Boolean(service && isSoapSmapi(service));
    }

    private async getDeviceId(baseUrl: string): Promise<string> {
        if (this.deviceId) {
            return this.deviceId;
        }
        const xml = await upnpSoap(
            baseUrl,
            '/SystemProperties/Control',
            'urn:schemas-upnp-org:service:SystemProperties:1#GetString',
            '<u:GetString xmlns:u="urn:schemas-upnp-org:service:SystemProperties:1"><VariableName>R_TrialZPSerial</VariableName></u:GetString>',
        );
        this.deviceId = tagText(xml, 'StringValue') || tagText(xml, 'CurrentString');
        if (!this.deviceId) {
            throw new Error('Cannot read Sonos device id (R_TrialZPSerial)');
        }
        return this.deviceId;
    }

    private async getHouseholdId(baseUrl: string): Promise<string> {
        if (this.householdId) {
            return this.householdId;
        }
        const xml = await upnpSoap(
            baseUrl,
            '/DeviceProperties/Control',
            'urn:schemas-upnp-org:service:DeviceProperties:1#GetHouseholdID',
            '<u:GetHouseholdID xmlns:u="urn:schemas-upnp-org:service:DeviceProperties:1"></u:GetHouseholdID>',
        );
        this.householdId = tagText(xml, 'CurrentHouseholdID');
        if (!this.householdId) {
            throw new Error('Cannot read Sonos household id');
        }
        return this.householdId;
    }

    private async importSpeakerAccounts(baseUrl: string): Promise<void> {
        if (Date.now() - this.accountsFetched < 60_000) {
            return;
        }
        this.accountsFetched = Date.now();
        try {
            const xml = await httpGet(`${baseUrl.replace(/\/$/, '')}/status/accounts`);
            if (!xml.includes('<Account')) {
                this.log.debug('SMAPI: /status/accounts has no readable Account entries');
                return;
            }
            const services = this.services || [];
            xml.replace(/<Account\b([^>]*)>([\s\S]*?)<\/Account>/gi, (_all, attrs: string, body: string) => {
                if (attr(attrs, 'Deleted') === '1') {
                    return '';
                }
                const type = attr(attrs, 'Type');
                const service = services.find(item => String(item.type) === type);
                if (!service) {
                    return '';
                }
                const token = tagText(body, 'OADevID');
                const key = tagText(body, 'Key');
                const sn = attr(attrs, 'SerialNum') || '0';
                if (sn && sn !== '0') {
                    this.serials.set(this.tokenKey(service), sn);
                }
                if (token && key && token.length >= 16 && key.length >= 8 && !this.tokens.has(this.tokenKey(service))) {
                    this.tokens.set(this.tokenKey(service), { token, key, sn });
                    this.log.debug(`SMAPI: imported speaker account for ${service.name}`);
                }
                return '';
            });
            this.saveTokens();
        } catch (err) {
            this.log.debug(`SMAPI: cannot read /status/accounts: ${err}`);
        }
    }

    private async smapiCall(
        baseUrl: string,
        service: MusicServiceInfo,
        action: string,
        inner: string,
        retried = false,
    ): Promise<string> {
        const endpoint = service.secureUri || service.uri;
        if (!endpoint) {
            throw new Error(`No SMAPI endpoint for ${service.name}`);
        }
        await this.importSpeakerAccounts(baseUrl);
        const creds = {
            deviceId: await this.getDeviceId(baseUrl),
            householdId: await this.getHouseholdId(baseUrl),
            token: this.tokens.get(this.tokenKey(service))?.token,
            key: this.tokens.get(this.tokenKey(service))?.key,
            loginToken: needsLoginToken(service.auth),
        };
        if (needsLoginToken(service.auth) && !creds.token) {
            throw new SmapiAuthError();
        }
        const envelope = smapiEnvelope(action, inner, creds);
        const payload = Buffer.from(envelope, 'utf8');
        const url = new URL(endpoint);
        const res = await httpBody(
            url,
            {
                headers: {
                    SOAPAction: `"${SMAPI_NS}#${action}"`,
                    'Content-Type': 'text/xml; charset=utf-8',
                    'Accept-Language': 'en-US',
                    'Accept-Encoding': 'gzip, deflate',
                    'User-Agent': USER_AGENT,
                    'Content-Length': payload.length,
                },
            },
            payload,
        );
        const fault = extractFault(res.body);
        if (fault) {
            const blob = `${fault.code} ${fault.string} ${fault.detail}`.toLowerCase();
            if (!retried && blob.includes('tokenrefreshrequired')) {
                const token = tagText(fault.detail, 'authToken');
                const key = tagText(fault.detail, 'privateKey');
                if (token && key) {
                    const prev = this.tokens.get(this.tokenKey(service));
                    this.tokens.set(this.tokenKey(service), { token, key, sn: prev?.sn || '0' });
                    this.saveTokens();
                    this.log.debug(`SMAPI: refreshed token for ${service.name}`);
                    return this.smapiCall(baseUrl, service, action, inner, true);
                }
            }
            if (
                blob.includes('authtokenexpired') ||
                blob.includes('tokenrefreshrequired') ||
                blob.includes('notauthorized') ||
                blob.includes('not_linked') ||
                blob.includes('login') ||
                blob.includes('auth')
            ) {
                this.tokens.delete(this.tokenKey(service));
                throw new SmapiAuthError(fault.string || 'SMAPI authentication required');
            }
            throw new Error(`${service.name} ${action} failed: ${fault.string || fault.code || 'SOAP fault'}`);
        }
        if (res.status >= 400) {
            throw new Error(`${service.name} ${action} failed: HTTP ${res.status}`);
        }
        return res.body;
    }

    private async beginLogin(baseUrl: string, service: MusicServiceInfo): Promise<string> {
        const inner = `<s:householdId>${xmlEscape(await this.getHouseholdId(baseUrl))}</s:householdId>`;
        const action = service.auth === 'DeviceLink' ? 'getDeviceLinkCode' : 'getAppLink';
        const endpoint = service.secureUri || service.uri;
        const creds = {
            deviceId: await this.getDeviceId(baseUrl),
            householdId: await this.getHouseholdId(baseUrl),
            loginToken: true,
        };
        const envelope = smapiEnvelope(action, inner, creds);
        const payload = Buffer.from(envelope, 'utf8');
        const url = new URL(endpoint);
        const res = await httpBody(
            url,
            {
                headers: {
                    SOAPAction: `"${SMAPI_NS}#${action}"`,
                    'Content-Type': 'text/xml; charset=utf-8',
                    'Accept-Language': 'en-US',
                    'Accept-Encoding': 'gzip, deflate',
                    'User-Agent': USER_AGENT,
                    'Content-Length': payload.length,
                },
            },
            payload,
        );
        const linkCode = tagText(res.body, 'linkCode');
        const regUrl = tagText(res.body, 'regUrl');
        if (linkCode) {
            this.pendingLink.set(this.tokenKey(service), linkCode);
        }
        if (!regUrl) {
            throw new Error(`Cannot start ${service.name} login`);
        }
        return regUrl;
    }

    async completeLogin(baseUrl: string, serviceName: string): Promise<boolean> {
        const service = await this.findService(baseUrl, serviceName);
        if (!service) {
            return false;
        }
        const linkCode = this.pendingLink.get(this.tokenKey(service));
        if (!linkCode) {
            return false;
        }
        const householdId = await this.getHouseholdId(baseUrl);
        const deviceId = await this.getDeviceId(baseUrl);
        const inner = `<s:householdId>${xmlEscape(householdId)}</s:householdId>
      <s:linkCode>${xmlEscape(linkCode)}</s:linkCode>
      <s:linkDeviceId>${xmlEscape(deviceId)}</s:linkDeviceId>`;
        const endpoint = service.secureUri || service.uri;
        const envelope = smapiEnvelope('getDeviceAuthToken', inner, { deviceId, householdId, loginToken: true });
        const payload = Buffer.from(envelope, 'utf8');
        const url = new URL(endpoint);
        const res = await httpBody(
            url,
            {
                headers: {
                    SOAPAction: `"${SMAPI_NS}#getDeviceAuthToken"`,
                    'Content-Type': 'text/xml; charset=utf-8',
                    'Accept-Language': 'en-US',
                    'Accept-Encoding': 'gzip, deflate',
                    'User-Agent': USER_AGENT,
                    'Content-Length': payload.length,
                },
            },
            payload,
        );
        const token = tagText(res.body, 'authToken');
        const key = tagText(res.body, 'privateKey');
        if (!token) {
            this.log.warn(`SMAPI login for ${service.name} is not finished yet`);
            return false;
        }
        this.tokens.set(this.tokenKey(service), { token, key, sn: this.tokens.get(this.tokenKey(service))?.sn || '0' });
        this.pendingLink.delete(this.tokenKey(service));
        this.saveTokens();
        this.log.info(`SMAPI: stored ${service.name} account token`);
        return true;
    }

    /** Account serial (sn=) for SMAPI playback URIs, if the speaker still exposes it. */
    async accountSerial(baseUrl: string, serviceId: number): Promise<string> {
        await this.importSpeakerAccounts(baseUrl);
        const key = String(serviceId);
        return this.tokens.get(key)?.sn || this.serials.get(key) || '0';
    }

    private sn(service: MusicServiceInfo): string {
        return this.tokens.get(this.tokenKey(service))?.sn || this.serials.get(this.tokenKey(service)) || '0';
    }

    private entriesToItems(service: MusicServiceInfo, xml: string): MediaBrowseItem[] {
        return parseSmapiEntries(xml)
            .map(entry => toBrowseItem(service, entry, this.sn(service)))
            .filter((item): item is MediaBrowseItem => Boolean(item));
    }

    async browse(baseUrl: string, serviceName: string, objectId: string, german: boolean): Promise<SmapiBrowseResult> {
        const service = await this.findService(baseUrl, serviceName);
        if (!service) {
            throw new Error(`Unknown music service: ${serviceName}`);
        }
        if (!isSoapSmapi(service)) {
            return {
                items: [],
                loginHint: german
                    ? `${service.name} bietet keinen Katalog für Fremdsteuerungen. In der Sonos-App suchen und als Favorit oder Playlist speichern - die tauchen hier auf.`
                    : `${service.name} exposes no catalog to third-party controllers. Search in the Sonos app and save a favorite or playlist - those show up here.`,
            };
        }
        const loginHint = german
            ? `${service.name}: Katalog braucht eine einmalige App-Link-Anmeldung. Link öffnen, anmelden, dann „Anmeldung abgeschlossen“.`
            : `${service.name}: the catalog needs a one-time App-Link sign-in. Open the URL, sign in, then tap “Signed in”.`;
        try {
            const xml = await this.smapiCall(
                baseUrl,
                service,
                'getMetadata',
                `<s:id>${xmlEscape(objectId || 'root')}</s:id><s:index>0</s:index><s:count>${BROWSE_COUNT}</s:count><s:recursive>0</s:recursive>`,
            );
            const items = this.entriesToItems(service, xml);
            if (!items.length && needsLoginToken(service.auth) && (objectId || 'root') === 'root') {
                throw new SmapiAuthError('empty catalog');
            }
            if (!items.length) {
                this.log.warn(
                    `SMAPI ${service.name} getMetadata(${objectId || 'root'}) parsed 0 items from ${xml.length} bytes`,
                );
            }
            return { items };
        } catch (err) {
            this.log.warn(`SMAPI browse ${service.name}: ${err}`);
            let loginUrl = '';
            if (needsLoginToken(service.auth)) {
                try {
                    loginUrl = await this.beginLogin(baseUrl, service);
                } catch (loginErr) {
                    this.log.warn(`SMAPI login for ${service.name}: ${loginErr}`);
                }
            }
            return { items: [], loginUrl, loginHint };
        }
    }

    async search(baseUrl: string, serviceName: string, term: string, german: boolean): Promise<SmapiBrowseResult> {
        const service = await this.findService(baseUrl, serviceName);
        if (!service) {
            throw new Error(`Unknown music service: ${serviceName}`);
        }
        const query = term.trim();
        if (!query) {
            return { items: [] };
        }
        if (!isSoapSmapi(service)) {
            return {
                items: [],
                loginHint: german
                    ? `${service.name}: Die Titelsuche läuft über gespeicherte Favoriten, Playlists und Zuletzt gehört.`
                    : `${service.name}: Title search uses saved favorites, playlists and recently played tracks.`,
            };
        }
        const items: MediaBrowseItem[] = [];
        let lastErr: unknown;
        for (const category of SEARCH_IDS) {
            try {
                const xml = await this.smapiCall(
                    baseUrl,
                    service,
                    'search',
                    `<s:id>${xmlEscape(category)}</s:id><s:term>${xmlEscape(query)}</s:term><s:index>0</s:index><s:count>${BROWSE_COUNT}</s:count>`,
                );
                items.push(...this.entriesToItems(service, xml));
                if (items.length) {
                    break;
                }
            } catch (err) {
                lastErr = err;
                if (err instanceof SmapiAuthError) {
                    return this.browse(baseUrl, serviceName, 'root', german);
                }
            }
        }
        if (!items.length && lastErr instanceof Error) {
            this.log.warn(`SMAPI search on ${service.name}: ${lastErr.message}`);
        }
        if (!items.length) {
            return {
                items: [
                    mediaItem({
                        id: '',
                        title: german ? `Keine Treffer für „${query}“.` : `No matches for “${query}”.`,
                    }),
                ],
            };
        }
        return { items };
    }
}
