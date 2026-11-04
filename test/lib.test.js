'use strict';

/*
 * Unit tests for the pure helpers in build/lib.
 * They run against the compiled output, so `npm run build` must have run before.
 */
const { expect } = require('chai');

const {
    getMediaRoot,
    htAudioInLabel,
    isDirectPlayUri,
    isHtAudioSilent,
    isLineInStreamUri,
    isStreamUri,
    isTvStreamUri,
    matchesMusicService,
    mediaItem,
    nowPlayingLabels,
    parseHtAudioIn,
    streamContentFromDidl,
    tvAudioFormat,
    tvStreamUri,
} = require('../build/lib/content-directory');

const { encodeSmapiId, parseSmapiId } = require('../build/lib/smapi');

const LABELS = {
    radio: 'TuneIn Radio',
    library: 'Music library',
    shares: 'Network shares',
    lineIn: 'Line-In',
    tv: 'TV',
    tvHdmi: 'HDMI',
};

const UUID = 'RINCON_347E5C9E3A4801400';

describe('content-directory: URI helpers', () => {
    it('builds and recognizes the TV stream URI', () => {
        expect(tvStreamUri(UUID)).to.equal(`x-sonos-htastream:${UUID}:spdif`);
        expect(isTvStreamUri(tvStreamUri(UUID))).to.be.true;
    });

    it('does not treat other URIs as TV', () => {
        expect(isTvStreamUri('x-rincon-stream:RINCON_1')).to.be.false;
        expect(isTvStreamUri('x-rincon:RINCON_1')).to.be.false;
        expect(isTvStreamUri(undefined)).to.be.false;
        expect(isTvStreamUri('')).to.be.false;
    });

    it('recognizes line-in', () => {
        expect(isLineInStreamUri('x-rincon-stream:RINCON_1')).to.be.true;
        expect(isLineInStreamUri('x-sonos-htastream:RINCON_1:spdif')).to.be.false;
    });

    it('routes streams past the queue', () => {
        expect(isStreamUri('x-sonosapi-stream:s25111?sid=254')).to.be.true;
        expect(isDirectPlayUri('x-rincon-cpcontainer:1006206ccatalog')).to.be.true;
        // a plain library track has to go through the queue
        expect(isDirectPlayUri('x-file-cifs://nas/music/track.mp3')).to.be.false;
    });
});

describe('content-directory: HDMI audio format', () => {
    it('reads HTAudioIn out of a GetZoneInfo response', () => {
        expect(parseHtAudioIn('<u:GetZoneInfoResponse><HTAudioIn>18</HTAudioIn></u:GetZoneInfoResponse>')).to.equal(18);
    });

    it('returns null when the speaker has no TV input', () => {
        expect(parseHtAudioIn('<u:GetZoneInfoResponse><MACAddress>00:11</MACAddress></u:GetZoneInfoResponse>')).to.be
            .null;
        expect(parseHtAudioIn('')).to.be.null;
    });

    it('maps silence codes to an empty label', () => {
        expect(isHtAudioSilent(0)).to.be.true;
        expect(htAudioInLabel(0)).to.equal('');
    });

    it('labels a real audio format', () => {
        expect(htAudioInLabel(2)).to.equal('Stereo PCM');
        expect(htAudioInLabel(18)).to.equal('Dolby Digital 5.1');
        expect(htAudioInLabel(84934721)).to.equal('DTS 5.1');
    });

    it('returns an empty label for an unknown code', () => {
        expect(htAudioInLabel(999999)).to.equal('');
    });

    it('extracts the stream content from DIDL metadata', () => {
        const didl = '<DIDL-Lite><item><r:streamContent>Stereo PCM</r:streamContent></item></DIDL-Lite>';
        expect(streamContentFromDidl(didl)).to.equal('Stereo PCM');
        expect(streamContentFromDidl(undefined)).to.equal('');
    });

    it('picks an audio format out of free text', () => {
        expect(tvAudioFormat('Dolby Digital 5.1')).to.contain('Dolby');
        expect(tvAudioFormat('')).to.equal('');
    });
});

describe('content-directory: nowPlayingLabels', () => {
    it('shows TV as title and the format as artist', () => {
        const labels = nowPlayingLabels(
            { uri: tvStreamUri(UUID), title: '', artist: '' },
            LABELS,
            { metadata: '<DIDL-Lite><item><r:streamContent>Stereo PCM</r:streamContent></item></DIDL-Lite>' },
        );
        expect(labels.title).to.equal('TV');
        expect(labels.station).to.equal('TV');
        expect(labels.artist).to.contain('PCM');
    });

    it('falls back to the Line-In label for an empty line-in title', () => {
        const labels = nowPlayingLabels({ uri: 'x-rincon-stream:RINCON_1', title: '' }, LABELS);
        expect(labels.title).to.equal('Line-In');
    });

    it('leaves a normal track untouched', () => {
        const labels = nowPlayingLabels(
            { uri: 'x-file-cifs://nas/a.mp3', title: 'Song', artist: 'Band', album: 'Disc' },
            LABELS,
        );
        expect(labels).to.deep.equal({ title: 'Song', artist: 'Band', album: 'Disc', station: '' });
    });
});

describe('content-directory: getMediaRoot', () => {
    const ids = result => result.items.map(item => item.id);

    it('offers TV only on a home theater device', () => {
        expect(ids(getMediaRoot({}, LABELS, UUID, { homeTheater: true }))).to.include('tv');
        expect(ids(getMediaRoot({}, LABELS, UUID, { homeTheater: false }))).to.not.include('tv');
        // no options at all means no TV either
        expect(ids(getMediaRoot({}, LABELS, UUID))).to.not.include('tv');
    });

    it('puts TV first when it is available', () => {
        expect(ids(getMediaRoot({}, LABELS, UUID, { homeTheater: true }))[0]).to.equal('tv');
    });

    it('never invents a music service the household does not have', () => {
        const listed = ids(getMediaRoot({}, LABELS, UUID, { homeTheater: true }));
        expect(listed).to.not.include('service:Spotify');
        expect(listed).to.not.include('service:YouTube Music');
    });

    it('lists a reported service and keeps the featured ones in front', () => {
        const result = getMediaRoot({ Deezer: { id: 2 }, Spotify: { id: 9 } }, LABELS, UUID, { homeTheater: false });
        const listed = ids(result);
        expect(listed).to.include('service:Spotify');
        expect(listed).to.include('service:Deezer');
        expect(listed.indexOf('service:Spotify')).to.be.below(listed.indexOf('service:Deezer'));
    });

    it('always offers the local containers', () => {
        const listed = ids(getMediaRoot(undefined, LABELS, UUID));
        expect(listed).to.include.members(['R:0', 'A:', 'S:', 'AI:']);
    });

    it('lists every service only once', () => {
        const listed = ids(getMediaRoot({ Spotify: { id: 9 } }, LABELS, UUID));
        expect(listed.length).to.equal(new Set(listed).size);
    });
});

describe('content-directory: matchesMusicService', () => {
    it('matches by the sid of the reported service', () => {
        expect(matchesMusicService('x-sonos-http:track%3a1?sid=2311&flags=8224', 'Whatever', { id: 2311 })).to.be.true;
    });

    it('matches Spotify by its well known markers', () => {
        expect(matchesMusicService('x-sonos-spotify:spotify%3atrack%3a4uLU6', 'Spotify')).to.be.true;
        expect(matchesMusicService('x-file-cifs://nas/track.mp3', 'Spotify')).to.be.false;
    });
});

describe('content-directory: mediaItem', () => {
    it('fills the optional fields', () => {
        expect(mediaItem({ id: 'R:0', title: 'Radio' })).to.deep.equal({
            id: 'R:0',
            title: 'Radio',
            uri: '',
            metadata: '',
            artist: '',
            album: '',
            cover: '',
            folder: false,
        });
    });
});

describe('smapi: object ids', () => {
    it('round-trips a service name and item id', () => {
        const encoded = encodeSmapiId('YouTube Music', 'search:track:live @ home');
        expect(parseSmapiId(encoded)).to.deep.equal({
            serviceName: 'YouTube Music',
            itemId: 'search:track:live @ home',
        });
    });

    it('rejects ids that are not smapi ids', () => {
        expect(parseSmapiId('R:0')).to.be.undefined;
        expect(parseSmapiId('')).to.be.undefined;
    });
});

const {
    fromPlayMode,
    toFormatted,
    toPlayMode,
    toSeconds,
    toTrack,
} = require('../build/lib/backend/svrooij-backend');

describe('svrooij backend: play mode', () => {
    // shuffle and repeat are two independent ioBroker states but one enum in the library,
    // so the folding has to survive a round trip in both directions
    const COMBINATIONS = [
        [false, 'none'],
        [false, 'all'],
        [false, 'one'],
        [true, 'none'],
        [true, 'all'],
        [true, 'one'],
    ];

    it('round-trips every shuffle/repeat combination', () => {
        COMBINATIONS.forEach(([shuffle, repeat]) => {
            const folded = toPlayMode(shuffle, repeat);
            expect(fromPlayMode(folded), `${shuffle}/${repeat} via ${folded}`).to.deep.equal({ shuffle, repeat });
        });
    });

    it('maps the library enum to the documented strings', () => {
        expect(fromPlayMode('NORMAL')).to.deep.equal({ shuffle: false, repeat: 'none' });
        expect(fromPlayMode('REPEAT_ALL')).to.deep.equal({ shuffle: false, repeat: 'all' });
        expect(fromPlayMode('REPEAT_ONE')).to.deep.equal({ shuffle: false, repeat: 'one' });
        expect(fromPlayMode('SHUFFLE')).to.deep.equal({ shuffle: true, repeat: 'all' });
        expect(fromPlayMode('SHUFFLE_NOREPEAT')).to.deep.equal({ shuffle: true, repeat: 'none' });
        expect(fromPlayMode('SHUFFLE_REPEAT_ONE')).to.deep.equal({ shuffle: true, repeat: 'one' });
    });

    it('falls back to no shuffle and no repeat for an unknown mode', () => {
        expect(fromPlayMode(undefined)).to.deep.equal({ shuffle: false, repeat: 'none' });
        expect(fromPlayMode('SOMETHING_ELSE')).to.deep.equal({ shuffle: false, repeat: 'none' });
    });
});

describe('svrooij backend: time conversion', () => {
    it('reads the h:mm:ss the speakers answer with', () => {
        expect(toSeconds('0:00:00')).to.equal(0);
        expect(toSeconds('0:03:25')).to.equal(205);
        expect(toSeconds('1:02:03')).to.equal(3723);
        expect(toSeconds(undefined)).to.equal(0);
        expect(toSeconds('NOT_IMPLEMENTED')).to.equal(0);
    });

    it('writes the shape the adapter puts into current_elapsed_s', () => {
        expect(toFormatted(0)).to.equal('0:00');
        expect(toFormatted(65)).to.equal('1:05');
        expect(toFormatted(205)).to.equal('3:25');
        expect(toFormatted(3723)).to.equal('1:02:03');
    });

    it('round-trips a duration', () => {
        [0, 7, 65, 205, 3599, 3723, 7322].forEach(seconds => {
            expect(toSeconds(toFormatted(seconds)), `${seconds}s`).to.equal(seconds);
        });
    });
});

describe('svrooij backend: track mapping', () => {
    it('recognises a radio stream by its upnp class', () => {
        const track = toTrack({
            Title: 'Some Station',
            UpnpClass: 'object.item.audioItem.audioBroadcast',
            TrackUri: 'x-sonosapi-stream:s25111?sid=254',
        });
        expect(track.type).to.equal('radio');
        expect(track.title).to.equal('Some Station');
    });

    it('recognises a radio stream by its transport URI when the track is a plain item', () => {
        const track = toTrack(
            { Title: 'x-sonosapi-stream:s24896?sid=254', UpnpClass: 'object.item', StreamContent: 'Kontakt zu SWR3' },
            'x-sonosapi-stream:s24896?sid=254',
            'x-sonosapi-stream:s24896?sid=254&flags=8224&sn=0',
            { Title: 'SWR3', UpnpClass: 'object.item.audioItem.audioBroadcast' },
        );
        expect(track.type).to.equal('radio');
        expect(track.stationName).to.equal('SWR3');
        expect(track.title).to.equal('Kontakt zu SWR3');
    });

    it('reads the stream content out of an unparsed radio track', () => {
        const didl =
            '<DIDL-Lite xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/"><item><r:streamContent>Artist - Song</r:streamContent></item></DIDL-Lite>';
        const track = toTrack(didl, 'aac://example.com/stream', 'x-rincon-mp3radio://example.com/stream');
        expect(track.type).to.equal('radio');
        expect(track.title).to.equal('Artist - Song');
    });

    it('keeps line_in before radio and a normal track as track', () => {
        const lineIn = toTrack({ TrackUri: 'x-rincon-stream:RINCON_1' }, undefined, 'x-sonosapi-stream:s24896?sid=254');
        expect(lineIn.type).to.equal('line_in');

        const song = toTrack({ Title: 'Song', TrackUri: 'x-file-cifs://nas/a.mp3', UpnpClass: 'object.item' });
        expect(song.type).to.equal('track');
        expect(song.stationName).to.equal('');
    });

    it('recognises the TV input as line_in', () => {
        expect(toTrack({ TrackUri: 'x-sonos-htastream:RINCON_1:spdif' }).type).to.equal('line_in');
        expect(toTrack({ TrackUri: 'x-rincon-stream:RINCON_1' }).type).to.equal('line_in');
    });

    it('treats everything else as a track and converts the duration', () => {
        const track = toTrack({
            Title: 'Song',
            Artist: 'Band',
            Album: 'Disc',
            Duration: '0:03:25',
            TrackUri: 'x-file-cifs://nas/a.mp3',
        });
        expect(track.type).to.equal('track');
        expect(track.duration).to.equal(205);
        expect(track.artist).to.equal('Band');
    });

    it('survives a missing or unparsed track', () => {
        expect(toTrack(undefined)).to.deep.equal({ uri: '', duration: 0 });
        expect(toTrack('<DIDL-Lite/>', 'x-rincon:RINCON_1')).to.deep.equal({
            uri: 'x-rincon:RINCON_1',
            duration: 0,
        });
    });
});

const { SvrooijDevice } = require('../build/lib/backend/svrooij-backend');

describe('svrooij backend: partial events', () => {
    // UPnP LastChange events carry only what changed. Folding one must never reset a field the
    // event does not mention, otherwise the ioBroker states flap - back to STOPPED while
    // playback continues, or shuffle off because the event was about something else.
    const stubDevice = () => ({ Uuid: 'RINCON_1', Host: '192.168.1.50', Port: 1400, Name: 'Kitchen' });
    const stubBackend = { devices: [], getDeviceByUuid: () => undefined };
    const device = () => new SvrooijDevice(stubDevice(), stubBackend);

    it('keeps the transport state when a later event does not mention it', () => {
        const d = device();
        d.applyTransportEvent({ TransportState: 'PLAYING', CurrentTrack: 2 });
        d.applyTransportEvent({ CurrentTrack: 3 });
        expect(d.state.playbackState).to.equal('PLAYING');
        expect(d.state.trackNo).to.equal(3);
    });

    it('keeps shuffle and repeat when the event is about something else', () => {
        const d = device();
        d.applyTransportEvent({ CurrentPlayMode: 'SHUFFLE_REPEAT_ONE' });
        expect(d.state.playMode).to.deep.include({ shuffle: true, repeat: 'one' });

        d.applyTransportEvent({ TransportState: 'PAUSED_PLAYBACK' });
        expect(d.state.playMode).to.deep.include({ shuffle: true, repeat: 'one' });
        expect(d.state.playbackState).to.equal('PAUSED_PLAYBACK');
    });

    it('keeps crossfade when only the play mode changed', () => {
        const d = device();
        d.applyTransportEvent({ CurrentPlayMode: 'NORMAL', CurrentCrossfadeMode: true });
        expect(d.state.playMode.crossfade).to.be.true;

        d.applyTransportEvent({ CurrentPlayMode: 'REPEAT_ALL' });
        expect(d.state.playMode.crossfade).to.be.true;
        expect(d.state.playMode.repeat).to.equal('all');
    });

    it('keeps the current track when the event carries no track', () => {
        const d = device();
        d.applyTransportEvent({
            CurrentTrackURI: 'x-file-cifs://nas/a.mp3',
            CurrentTrackMetaData: { Title: 'Song', Duration: '0:03:25' },
        });
        expect(d.state.currentTrack.title).to.equal('Song');

        d.applyTransportEvent({ TransportState: 'PLAYING' });
        expect(d.state.currentTrack.title).to.equal('Song');
        expect(d.state.currentTrack.duration).to.equal(205);
    });

    it('keeps volume and mute when the rendering event is about the equalizer', () => {
        const d = device();
        d.applyRenderingEvent({ Volume: { Master: 42 }, Mute: { Master: false } });
        expect(d.state.volume).to.equal(42);
        expect(d.volume).to.equal(42);

        d.applyRenderingEvent({ NightMode: true });
        expect(d.state.volume).to.equal(42);
        expect(d.state.mute).to.be.false;
        expect(d.state.equalizer.nightMode).to.be.true;
    });

    it('reads speech enhancement out of DialogLevel', () => {
        const d = device();
        d.applyRenderingEvent({ DialogLevel: '1' });
        expect(d.state.equalizer.speechEnhancement).to.be.true;

        d.applyRenderingEvent({ DialogLevel: '0' });
        expect(d.state.equalizer.speechEnhancement).to.be.false;
    });

    it('turns a parsed transport metadata back into DIDL, which TTS needs to restore radio', () => {
        const d = device();
        d.applyTransportEvent({
            AVTransportURI: 'x-sonosapi-stream:s25111?sid=254',
            AVTransportURIMetaData: { Title: 'Some Station', UpnpClass: 'object.item.audioItem.audioBroadcast' },
        });
        expect(d.transportUri).to.equal('x-sonosapi-stream:s25111?sid=254');
        expect(d.transportUriMetadata).to.be.a('string').and.to.contain('Some Station');
    });

    it('decides the type again when only the transport changes', () => {
        const d = device();
        d.applyTransportEvent({
            CurrentTrackURI: 'http://stream.example/swr3.mp3',
            CurrentTrackMetaData: { Title: 'Kontakt zu SWR3', UpnpClass: 'object.item' },
        });
        expect(d.state.currentTrack.type).to.equal('track');

        d.applyTransportEvent({ AVTransportURI: 'x-sonosapi-stream:s24896?sid=254' });
        expect(d.state.currentTrack.type).to.equal('radio');

        d.applyTransportEvent({ AVTransportURIMetaData: { Title: 'SWR3', UpnpClass: 'object.item' } });
        expect(d.state.currentTrack.stationName).to.equal('SWR3');
        expect(d.state.currentTrack.title).to.equal('Kontakt zu SWR3');
    });
});

describe('discovery backend: library guards (#170, #272)', () => {
    const { EventEmitter } = require('node:events');

    let Player;
    let listener;
    let system;

    before(() => {
        // A player subscribes to the events of its speaker as soon as it is created. There is no
        // speaker here, so the subscriber is replaced before the library is loaded.
        const subscriberPath = require.resolve('sonos-discovery/lib/Subscriber');
        require.cache[subscriberPath] = {
            id: subscriberPath,
            filename: subscriberPath,
            loaded: true,
            exports: function Subscriber() {
                this.dispose = () => {};
            },
        };
        require('../build/lib/backend/discovery-backend').guardLibrary();
        Player = require('sonos-discovery/lib/models/Player');
    });

    beforeEach(() => {
        listener = new EventEmitter();
        listener.endpoint = () => 'http://127.0.0.1:3500/';
        system = new EventEmitter();
        system.zones = [];
    });

    const player = uuid =>
        new Player(
            { uuid, zonename: uuid, location: 'http://192.168.0.10:1400/xml/device_description.xml' },
            listener,
            system,
        );

    // the shape the notification listener hands over for a RenderingControl event
    const volumeEvent = level => ({ volume: [{ channel: 'Master', val: String(level) }] });

    it('treats a player whose coordinator the topology does not know as standalone', () => {
        const a = player('RINCON_A');
        // what SonosSystem assigns when the coordinator of the zone is not in its cache
        a.coordinator = undefined;

        expect(() => listener.emit('last-change', 'RINCON_A', volumeEvent(20))).to.not.throw();
        expect(a.coordinator).to.equal(a);
        expect(a.state.volume).to.equal(20);
    });

    it('skips the group volume of a coordinator that heads no zone', () => {
        const a = player('RINCON_A');
        const b = player('RINCON_B');
        a.coordinator = b;
        system.zones = [{ uuid: 'RINCON_C', members: [] }];

        expect(() => listener.emit('last-change', 'RINCON_A', volumeEvent(20))).to.not.throw();
        expect(a.state.volume).to.equal(20);
    });

    it('still averages the group volume of a known zone', () => {
        const a = player('RINCON_A');
        const b = player('RINCON_B');
        b.coordinator = a;
        system.zones = [{ uuid: 'RINCON_A', members: [a, b] }];

        listener.emit('last-change', 'RINCON_A', volumeEvent(20));
        listener.emit('last-change', 'RINCON_B', volumeEvent(40));

        expect(a.groupState.volume).to.equal(30);
        expect(b.coordinator).to.equal(a);
        clearTimeout(a._groupVolumeTimer);
    });
});

describe('reachability (#252)', () => {
    const net = require('node:net');
    const { isReachable } = require('../build/lib/reachability');

    const listen = () =>
        new Promise(resolve => {
            const server = net.createServer(socket => socket.destroy());
            server.listen(0, '127.0.0.1', () => resolve(server));
        });

    it('is true while the port accepts connections', async () => {
        const server = await listen();
        try {
            expect(await isReachable('127.0.0.1', server.address().port, 1000)).to.be.true;
        } finally {
            server.close();
        }
    });

    it('is false when nothing listens on the port', async () => {
        const server = await listen();
        const port = server.address().port;
        await new Promise(resolve => server.close(resolve));

        expect(await isReachable('127.0.0.1', port, 1000)).to.be.false;
    });

    it('is false when the host does not answer in time', async () => {
        // TEST-NET-1 (RFC 5737) is never routed: the connect times out or fails right away
        const start = Date.now();
        expect(await isReachable('192.0.2.1', 1400, 300)).to.be.false;
        expect(Date.now() - start).to.be.below(2000);
    });
});

describe('cover cache (#222)', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { pruneCoverCache, touchCoverFile, COVER_CACHE_MAX_AGE } = require('../build/lib/cover-cache');

    const DAY = 24 * 3600 * 1000;
    let dir;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonos-cache-'));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const cover = (name, ageMs) => {
        const file = path.join(dir, name);
        fs.writeFileSync(file, 'cover');
        const time = new Date(Date.now() - ageMs);
        fs.utimesSync(file, time, time);
        return file;
    };

    it('removes covers older than the maximum age and keeps the others', async () => {
        cover('old', COVER_CACHE_MAX_AGE + DAY);
        cover('recent', DAY);

        expect(await pruneCoverCache(dir)).to.equal(1);
        expect(fs.readdirSync(dir)).to.deep.equal(['recent']);
    });

    it('keeps a cover that was used again', async () => {
        const file = cover('station', COVER_CACHE_MAX_AGE + DAY);
        touchCoverFile(file);

        expect(await pruneCoverCache(dir)).to.equal(0);
        expect(fs.existsSync(file)).to.be.true;
    });

    it('leaves sub-directories alone', async () => {
        const sub = path.join(dir, 'sub');
        fs.mkdirSync(sub);
        const time = new Date(Date.now() - COVER_CACHE_MAX_AGE - DAY);
        fs.utimesSync(sub, time, time);

        expect(await pruneCoverCache(dir)).to.equal(0);
        expect(fs.existsSync(sub)).to.be.true;
    });

    it('does not fail on a cover that cannot be touched', () => {
        expect(() => touchCoverFile(path.join(dir, 'missing'))).to.not.throw();
    });
});

describe('cover version (#204, #205)', () => {
    const { coverVersion } = require('../build/lib/cover-cache');

    it('changes with the cover', () => {
        expect(coverVersion(Buffer.from('station A'))).to.not.equal(coverVersion(Buffer.from('station B')));
    });

    it('stays the same for the same cover, so the browser cache still works', () => {
        expect(coverVersion(Buffer.from('station A'))).to.equal(coverVersion(Buffer.from('station A')));
    });

    it('is short and fits into a URL', () => {
        expect(coverVersion(Buffer.from('station A'))).to.match(/^[0-9a-f]{8}$/);
    });
});

describe('cover of what was started (#64)', () => {
    const { albumArtFromDidl } = require('../build/lib/content-directory');
    const { isImageData } = require('../build/lib/cover-cache');

    const ART = 'https://art.example.com/cover.jpg?w=300&h=300';
    const DIDL =
        '<DIDL-Lite xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="-1">' +
        '<dc:title>Alexa</dc:title>' +
        '<upnp:albumArtURI>https://art.example.com/cover.jpg?w=300&amp;h=300</upnp:albumArtURI>' +
        '</item></DIDL-Lite>';

    it('reads the cover out of raw DIDL', () => {
        expect(albumArtFromDidl(DIDL)).to.equal(ART);
    });

    it('reads the cover out of entity encoded DIDL', () => {
        const encoded = DIDL.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        expect(albumArtFromDidl(encoded)).to.equal(ART);
    });

    it('accepts the lower case tag and attributes', () => {
        expect(albumArtFromDidl('<upnp:albumarturi dlna:profileID="JPEG_TN">/getaa?s=1</upnp:albumarturi>')).to.equal(
            '/getaa?s=1',
        );
    });

    it('returns nothing without metadata or cover', () => {
        expect(albumArtFromDidl(undefined)).to.equal('');
        expect(albumArtFromDidl('')).to.equal('');
        expect(albumArtFromDidl('<DIDL-Lite><item><dc:title>x</dc:title></item></DIDL-Lite>')).to.equal('');
    });

    it('recognizes images by their first bytes', () => {
        expect(isImageData(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).to.equal(true); // JPEG
        expect(isImageData(Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'))).to.equal(true);
        expect(isImageData(Buffer.from('GIF89a....'))).to.equal(true);
        expect(isImageData(Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'latin1'))).to.equal(true);
        expect(isImageData(Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>'))).to.equal(
            true,
        );
    });

    it('recognizes an SVG after a comment or a doctype', () => {
        expect(isImageData(Buffer.from('<!-- logo --><svg xmlns="http://www.w3.org/2000/svg"/>'))).to.equal(true);
        expect(isImageData(Buffer.from('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"><svg/>'))).to.equal(true);
    });

    it('stays fast on input made to backtrack', () => {
        const start = Date.now();
        isImageData(Buffer.from(`<!--${'--><!--'.repeat(70)}x`));
        expect(Date.now() - start).to.be.below(100);
    });

    it('rejects audio and text answered for a cover URL', () => {
        expect(isImageData(Buffer.from('ID3\x04\x00\x00\x00\x00', 'latin1'))).to.equal(false); // MP3
        expect(isImageData(Buffer.from([0xff, 0xfb, 0x90, 0x64]))).to.equal(false); // MPEG frame
        expect(isImageData(Buffer.from('\x00\x00\x00\x20ftypM4A ', 'latin1'))).to.equal(false); // AAC
        expect(isImageData(Buffer.from('#EXTM3U\n#EXT-X-VERSION:3'))).to.equal(false); // HLS
        expect(isImageData(Buffer.from('<html><body>Not found</body></html>'))).to.equal(false);
        expect(isImageData(Buffer.from('<html><body><svg><path/></svg> Not found</body></html>'))).to.equal(false);
        expect(isImageData(Buffer.alloc(0))).to.equal(false);
    });
});

describe('elapsed time', () => {
    const { parseFormattedTime, toFormattedTime } = require('../build/lib/time');

    it('reads hours, minutes and seconds', () => {
        expect(parseFormattedTime('1:02:03')).to.equal(3723);
    });

    it('reads minutes and seconds', () => {
        expect(parseFormattedTime('02:03')).to.equal(123);
    });

    it('reads plain seconds', () => {
        expect(parseFormattedTime('75')).to.equal(75);
    });

    it('reads its own output', () => {
        for (const seconds of [0, 59, 61, 3599, 3600, 3723, 36000]) {
            expect(parseFormattedTime(toFormattedTime(seconds))).to.equal(seconds);
        }
    });

    it('rejects text that is not a time', () => {
        for (const text of ['', 'abc', '1:xx', '1:2:3:4', '-5']) {
            expect(parseFormattedTime(text), text).to.be.null;
        }
    });
});

describe('alarms (#65, #325)', () => {
    const http = require('node:http');
    const {
        alarmStateValues,
        applyAlarmSetting,
        createAlarmClock,
        newAlarm,
        nextAlarmStart,
        normalizeRecurrence,
        parseAlarmTime,
    } = require('../build/lib/alarm-clock');

    const esc = text =>
        String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // an alarm as the reporter of #65 has it: a TuneIn station on weekdays
    const RADIO_URI = 'x-sonosapi-stream:s17488?sid=254&flags=8224&sn=0';
    const RADIO_DIDL =
        '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="R:0/0/0" parentID="R:0/0" restricted="true"><dc:title>95.5 Charivari</dc:title><upnp:class>object.item.audioItem.audioBroadcast</upnp:class><desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON65031_</desc></item></DIDL-Lite>';
    const ROOM = 'RINCON_5CAAFD798FBE01400';

    const ALARM_LIST =
        '<Alarms>' +
        `<Alarm ID="1713" StartTime="07:10:00" Duration="02:00:00" Recurrence="WEEKDAYS" Enabled="1" RoomUUID="${ROOM}" ProgramURI="${esc(RADIO_URI)}" ProgramMetaData="${esc(RADIO_DIDL)}" PlayMode="SHUFFLE" Volume="10" IncludeLinkedZones="1"/>` +
        `<Alarm ID="51" StartTime="09:00:00" Duration="01:00:00" Recurrence="ON_06" Enabled="0" RoomUUID="${ROOM}" ProgramURI="x-rincon-buzzer:0" ProgramMetaData="" PlayMode="NORMAL" Volume="12" IncludeLinkedZones="0"/>` +
        '</Alarms>';

    const FAVORITES =
        '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/">' +
        `<item id="FV:2/3" parentID="FV:2" restricted="false"><dc:title>95.5 Charivari</dc:title><res protocolInfo="x-sonosapi-stream:*:*:*">${esc(RADIO_URI)}</res><r:resMD>${esc(RADIO_DIDL)}</r:resMD></item>` +
        '</DIDL-Lite>';

    const envelope = (action, body) =>
        `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:${action}Response xmlns:u="urn:schemas-upnp-org:service:AlarmClock:1">${body}</u:${action}Response></s:Body></s:Envelope>`;

    let server;
    let baseUrl;
    let requests;
    let refuse;

    before(async () => {
        server = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => (body += chunk));
            req.on('end', () => {
                const action = String(req.headers.soapaction).replace(/^"[^#]*#|"$/g, '');
                requests.push({ path: req.url, action, body });

                if (refuse) {
                    res.writeHead(500);
                    res.end(
                        '<s:Envelope><s:Body><s:Fault><detail><UPnPError><errorCode>801</errorCode></UPnPError></detail></s:Fault></s:Body></s:Envelope>',
                    );
                } else if (action === 'ListAlarms') {
                    res.end(
                        envelope(
                            'ListAlarms',
                            `<CurrentAlarmList>${esc(ALARM_LIST)}</CurrentAlarmList><CurrentAlarmListVersion>${ROOM}:39</CurrentAlarmListVersion>`,
                        ),
                    );
                } else if (action === 'CreateAlarm') {
                    res.end(envelope('CreateAlarm', '<AssignedID>1714</AssignedID>'));
                } else if (action === 'Browse') {
                    res.end(envelope('Browse', `<Result>${esc(FAVORITES)}</Result>`));
                } else {
                    res.end(envelope(action, ''));
                }
            });
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(() => server.close());

    beforeEach(() => {
        requests = [];
        refuse = false;
    });

    const clock = () => createAlarmClock(() => baseUrl);

    const lookup = {
        roomUuid: room => ({ bedroom: ROOM, '192.168.1.50': 'RINCON_KITCHEN' })[room.toLowerCase()],
        findFavorite: async title =>
            title.toLowerCase() === '95.5 charivari' ? { uri: RADIO_URI, metadata: RADIO_DIDL } : undefined,
    };

    describe('AlarmClock service', () => {
        it('lists the alarms with every setting', async () => {
            const alarms = await clock().list();

            expect(requests[0].path).to.equal('/AlarmClock/Control');
            expect(alarms).to.have.length(2);
            expect(alarms[0]).to.deep.equal({
                id: 1713,
                startTime: '07:10:00',
                duration: '02:00:00',
                recurrence: 'WEEKDAYS',
                enabled: true,
                roomUuid: ROOM,
                programUri: RADIO_URI,
                programMetadata: RADIO_DIDL,
                playMode: 'SHUFFLE',
                volume: 10,
                includeLinkedZones: true,
            });
            expect(alarms[1]).to.include({
                id: 51,
                enabled: false,
                recurrence: 'ON_06',
                programUri: 'x-rincon-buzzer:0',
            });
        });

        it('sends back what it read, with every argument in the order of the service', async () => {
            const [alarm] = await clock().list();
            await clock().update(alarm);

            const update = requests.pop();
            expect(update.action).to.equal('UpdateAlarm');
            expect(update.body).to.include(
                '<u:UpdateAlarm xmlns:u="urn:schemas-upnp-org:service:AlarmClock:1">' +
                    '<ID>1713</ID><StartLocalTime>07:10:00</StartLocalTime><Duration>02:00:00</Duration>' +
                    `<Recurrence>WEEKDAYS</Recurrence><Enabled>1</Enabled><RoomUUID>${ROOM}</RoomUUID>` +
                    `<ProgramURI>${esc(RADIO_URI)}</ProgramURI><ProgramMetaData>${esc(RADIO_DIDL)}</ProgramMetaData>` +
                    '<PlayMode>SHUFFLE</PlayMode><Volume>10</Volume><IncludeLinkedZones>1</IncludeLinkedZones>' +
                    '</u:UpdateAlarm>',
            );
        });

        it('creates an alarm and returns its ID', async () => {
            const id = await clock().create(await newAlarm({ room: 'Bedroom', time: '6:45' }, lookup));

            expect(id).to.equal(1714);
            expect(requests[0].action).to.equal('CreateAlarm');
            expect(requests[0].body).to.include('<StartLocalTime>06:45:00</StartLocalTime>');
            expect(requests[0].body).to.not.include('<ID>');
        });

        it('deletes an alarm', async () => {
            await clock().destroy(51);

            expect(requests[0].action).to.equal('DestroyAlarm');
            expect(requests[0].body).to.include('<ID>51</ID>');
        });

        it('reports the UPnP error of a refused action', async () => {
            refuse = true;

            const error = await clock()
                .destroy(51)
                .catch(e => e);
            expect(error.message).to.equal('DestroyAlarm failed: HTTP 500, UPnP error 801');
        });

        it('fails without a known speaker', async () => {
            const error = await createAlarmClock(() => '')
                .list()
                .catch(e => e);
            expect(error.message).to.equal('no speaker is known yet');
        });

        it('finds a favorite with the metadata an alarm needs', async () => {
            expect(await clock().findFavorite('95.5 CHARIVARI')).to.deep.equal({
                uri: RADIO_URI,
                metadata: RADIO_DIDL,
            });
            expect(requests[0].path).to.equal('/MediaServer/ContentDirectory/Control');
            expect(await clock().findFavorite('unknown station')).to.be.undefined;
        });
    });

    describe('next start', () => {
        // Thursday, 29 October 2026, 08:00 local time
        const now = new Date(2026, 9, 29, 8, 0, 0);
        const expectStart = (alarm, from, expected) => {
            const settings = { enabled: true, startTime: '07:10:00', recurrence: 'DAILY', ...alarm };
            expect(nextAlarmStart(settings, from)).to.equal(expected.getTime());
        };

        it('is today while the time is still ahead', () => {
            expectStart({ startTime: '09:30:00' }, now, new Date(2026, 9, 29, 9, 30, 0));
        });

        it('is tomorrow once the time has passed', () => {
            expectStart({}, now, new Date(2026, 9, 30, 7, 10, 0));
        });

        it('skips the weekend on weekdays', () => {
            expectStart({ recurrence: 'WEEKDAYS' }, now, new Date(2026, 9, 30, 7, 10, 0));
            expectStart({ recurrence: 'WEEKDAYS' }, new Date(2026, 9, 30, 8, 0, 0), new Date(2026, 10, 2, 7, 10, 0));
        });

        it('waits for the weekend on weekends', () => {
            expectStart({ recurrence: 'WEEKENDS' }, now, new Date(2026, 9, 31, 7, 10, 0));
        });

        it('takes the listed days, 0 is Sunday', () => {
            expectStart({ recurrence: 'ON_03' }, now, new Date(2026, 10, 1, 7, 10, 0));
        });

        it('rings once at the next occurrence of the time', () => {
            expectStart({ recurrence: 'ONCE' }, now, new Date(2026, 9, 30, 7, 10, 0));
        });

        it('is a week ahead when only today is listed and the time has passed', () => {
            expectStart({ recurrence: 'ON_4' }, now, new Date(2026, 10, 5, 7, 10, 0));
        });

        it('is null while the alarm is disabled', () => {
            expect(nextAlarmStart({ enabled: false, startTime: '07:10:00', recurrence: 'DAILY' }, now)).to.be.null;
        });
    });

    describe('settings', () => {
        const alarm = () => ({
            id: 51,
            startTime: '09:00:00',
            duration: '01:00:00',
            recurrence: 'ON_06',
            enabled: false,
            roomUuid: ROOM,
            programUri: 'x-rincon-buzzer:0',
            programMetadata: '',
            playMode: 'NORMAL',
            volume: 12,
            includeLinkedZones: false,
        });

        it('reads times as the user writes them', () => {
            expect(parseAlarmTime('7:30')).to.equal('07:30:00');
            expect(parseAlarmTime(' 07:30:15 ')).to.equal('07:30:15');
            for (const text of ['', '7', '7:5', '24:00', '12:60', '1:2:3:4', 'noon']) {
                expect(parseAlarmTime(text), text).to.be.null;
            }
        });

        it('reads recurrences as the user writes them', () => {
            expect(normalizeRecurrence('weekdays')).to.equal('WEEKDAYS');
            expect(normalizeRecurrence('on_5313')).to.equal('ON_135');
            for (const text of ['', 'ON_', 'ON_7', 'sometimes']) {
                expect(normalizeRecurrence(text), text).to.be.null;
            }
        });

        it('changes each setting named like its state', async () => {
            const changed = alarm();
            const settings = {
                enabled: 'true',
                time: '6:15',
                duration: '0:30',
                recurrence: 'daily',
                volume: '25',
                play_mode: 'shuffle_norepeat',
                include_grouped: true,
                room: '192.168.1.50',
                source: '95.5 Charivari',
            };
            for (const [setting, value] of Object.entries(settings)) {
                await applyAlarmSetting(changed, setting, value, lookup);
            }

            expect(changed).to.deep.equal({
                id: 51,
                startTime: '06:15:00',
                duration: '00:30:00',
                recurrence: 'DAILY',
                enabled: true,
                roomUuid: 'RINCON_KITCHEN',
                programUri: RADIO_URI,
                programMetadata: RADIO_DIDL,
                playMode: 'SHUFFLE_NOREPEAT',
                volume: 25,
                includeLinkedZones: true,
            });
        });

        it('reads "false" as false', async () => {
            const changed = { ...alarm(), enabled: true };
            await applyAlarmSetting(changed, 'enabled', 'false', lookup);
            expect(changed.enabled).to.be.false;
        });

        it('takes a URI or the chime as source', async () => {
            const changed = alarm();
            await applyAlarmSetting(changed, 'source', 'x-rincon-mp3radio://example.com/stream', lookup);
            expect(changed.programUri).to.equal('x-rincon-mp3radio://example.com/stream');

            await applyAlarmSetting(changed, 'source', 'sonos chime', lookup);
            expect(changed.programUri).to.equal('x-rincon-buzzer:0');
        });

        it('rejects invalid values and leaves the alarm as it was', async () => {
            const invalid = [
                ['time', '25:00'],
                ['duration', 'long'],
                ['recurrence', 'sometimes'],
                ['volume', '101'],
                ['volume', ''],
                ['play_mode', 'LOUD'],
                ['room', 'Garage'],
                ['source', 'unknown station'],
                ['color', 'red'],
            ];
            for (const [setting, value] of invalid) {
                const changed = alarm();
                const error = await applyAlarmSetting(changed, setting, value, lookup).catch(e => e);
                expect(error, `${setting}=${value}`).to.be.an('error');
                expect(changed).to.deep.equal(alarm());
            }
        });

        it('creates an alarm from room and time, the rest with defaults', async () => {
            expect(await newAlarm({ room: 'bedroom', time: '6:45', recurrence: 'weekdays' }, lookup)).to.deep.equal({
                id: 0,
                startTime: '06:45:00',
                duration: '01:00:00',
                recurrence: 'WEEKDAYS',
                enabled: true,
                roomUuid: ROOM,
                programUri: 'x-rincon-buzzer:0',
                programMetadata: '',
                playMode: 'NORMAL',
                volume: 20,
                includeLinkedZones: false,
            });

            const error = await newAlarm({ time: '6:45' }, lookup).catch(e => e);
            expect(error.message).to.equal('"room" and "time" are required');
        });

        it('shows the alarm in the states', () => {
            const radio = {
                ...alarm(),
                enabled: true,
                programUri: RADIO_URI,
                programMetadata: RADIO_DIDL,
                startTime: '07:10:30',
            };

            expect(alarmStateValues(radio, 'Bedroom', new Date(2026, 9, 29, 8, 0, 0))).to.deep.equal({
                enabled: true,
                time: '07:10:30',
                recurrence: 'ON_06',
                duration: '01:00',
                volume: 12,
                room: 'Bedroom',
                source: '95.5 Charivari',
                play_mode: 'NORMAL',
                include_grouped: false,
                next_start: new Date(2026, 9, 31, 7, 10, 30).getTime(),
            });
            expect(alarmStateValues(alarm(), 'Bedroom', new Date()).source).to.equal('SONOS Chime');
        });
    });
});

describe('battery (#116, #211)', () => {
    const http = require('node:http');
    const { parseBatteryStatus, readBatteryStatus } = require('../build/lib/battery');

    // the page of a Move on its charging ring, as soco documents it
    const page = (level, powerSource) =>
        '<?xml version="1.0" ?><ZPSupportInfo><LocalBatteryStatus>' +
        '<Data name="Health">GREEN</Data>' +
        `<Data name="Level">${level}</Data>` +
        '<Data name="Temperature">NORMAL</Data>' +
        `<Data name="PowerSource">${powerSource}</Data>` +
        '</LocalBatteryStatus></ZPSupportInfo>';

    it('reads level and power source', () => {
        expect(parseBatteryStatus(page(100, 'SONOS_CHARGING_RING'))).to.deep.equal({
            level: 100,
            powerSource: 'SONOS_CHARGING_RING',
            charging: true,
        });
    });

    it('is charging on USB power and not on the battery', () => {
        expect(parseBatteryStatus(page(40, 'USB_POWER')).charging).to.be.true;
        expect(parseBatteryStatus(page(87, 'BATTERY')).charging).to.be.false;
    });

    it('is null for a speaker without battery and for S1 firmware', () => {
        expect(parseBatteryStatus('<?xml version="1.0" ?><ZPSupportInfo></ZPSupportInfo>')).to.be.null;
        expect(parseBatteryStatus('')).to.be.null;
        expect(parseBatteryStatus(page('', 'BATTERY'))).to.be.null;
    });

    describe('from the speaker', () => {
        let server;
        let port;
        let answer;

        before(async () => {
            server = http.createServer((req, res) => {
                if (req.url !== '/status/batterystatus') {
                    res.writeHead(404);
                    res.end();
                    return;
                }
                res.writeHead(answer.status);
                res.end(answer.body);
            });
            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
            port = server.address().port;
        });

        after(() => server.close());

        it('reads the status page', async () => {
            answer = { status: 200, body: page(87, 'BATTERY') };
            expect(await readBatteryStatus('127.0.0.1', port)).to.deep.equal({
                level: 87,
                powerSource: 'BATTERY',
                charging: false,
            });
        });

        it('is null for a speaker without the page', async () => {
            answer = { status: 404, body: '' };
            expect(await readBatteryStatus('127.0.0.1', port)).to.be.null;
        });

        it('fails while the speaker cannot answer, so that it is asked again', async () => {
            answer = { status: 503, body: '' };
            const error = await readBatteryStatus('127.0.0.1', port).catch(e => e);
            expect(error.message).to.equal('HTTP 503');
        });

        it('fails while the speaker is away', async () => {
            const closed = http.createServer();
            await new Promise(resolve => closed.listen(0, '127.0.0.1', resolve));
            const closedPort = closed.address().port;
            await new Promise(resolve => closed.close(resolve));

            const error = await readBatteryStatus('127.0.0.1', closedPort).catch(e => e);
            expect(error).to.be.an('error');
        });
    });
});

describe('status LED, button lock and sleep timer (#253, #66)', () => {
    const http = require('node:http');
    const {
        getButtonLock,
        getLed,
        getSleepTimer,
        setButtonLock,
        setLed,
        setSleepTimer,
    } = require('../build/lib/speaker-settings');

    let server;
    let baseUrl;
    let requests;
    /** answer per action: the body of the response, or a number for a refusal with this UPnP error */
    let answers;

    before(async () => {
        server = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => (body += chunk));
            req.on('end', () => {
                const action = String(req.headers.soapaction).replace(/^"[^#]*#|"$/g, '');
                requests.push({ path: req.url, action, body });

                const answer = answers[action];
                if (typeof answer === 'number') {
                    res.writeHead(500);
                    res.end(
                        `<s:Envelope><s:Body><s:Fault><detail><UPnPError><errorCode>${answer}</errorCode></UPnPError></detail></s:Fault></s:Body></s:Envelope>`,
                    );
                } else {
                    res.end(
                        `<s:Envelope><s:Body><u:${action}Response>${answer || ''}</u:${action}Response></s:Body></s:Envelope>`,
                    );
                }
            });
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(() => server.close());

    beforeEach(() => {
        requests = [];
        answers = {};
    });

    it('reads the status LED', async () => {
        answers.GetLEDState = '<CurrentLEDState>On</CurrentLEDState>';
        expect(await getLed(baseUrl)).to.be.true;
        expect(requests[0].path).to.equal('/DeviceProperties/Control');

        answers.GetLEDState = '<CurrentLEDState>Off</CurrentLEDState>';
        expect(await getLed(baseUrl)).to.be.false;
    });

    it('switches the status LED', async () => {
        await setLed(baseUrl, false);
        await setLed(baseUrl, true);

        expect(requests.map(request => request.action)).to.deep.equal(['SetLEDState', 'SetLEDState']);
        expect(requests[0].body).to.include('<DesiredLEDState>Off</DesiredLEDState>');
        expect(requests[1].body).to.include('<DesiredLEDState>On</DesiredLEDState>');
    });

    it('reads and sets the button lock', async () => {
        answers.GetButtonLockState = '<CurrentButtonLockState>On</CurrentButtonLockState>';
        expect(await getButtonLock(baseUrl)).to.be.true;

        await setButtonLock(baseUrl, false);
        expect(requests[1].action).to.equal('SetButtonLockState');
        expect(requests[1].body).to.include('<DesiredButtonLockState>Off</DesiredButtonLockState>');
    });

    it('is null for a device without the setting', async () => {
        answers.GetButtonLockState = 401;
        expect(await getButtonLock(baseUrl)).to.be.null;
    });

    it('fails while the device is away, so that it is asked again', async () => {
        const closed = http.createServer();
        await new Promise(resolve => closed.listen(0, '127.0.0.1', resolve));
        const closedPort = closed.address().port;
        await new Promise(resolve => closed.close(resolve));

        const error = await getLed(`http://127.0.0.1:${closedPort}`).catch(e => e);
        expect(error).to.be.an('error');
    });

    it('reports a refused switch', async () => {
        answers.SetLEDState = 402;
        const error = await setLed(baseUrl, false).catch(e => e);
        expect(error.message).to.equal('SetLEDState failed: HTTP 500, UPnP error 402');
    });

    it('reads the remaining time of the sleep timer', async () => {
        answers.GetRemainingSleepTimerDuration =
            '<RemainingSleepTimerDuration>0:29:58</RemainingSleepTimerDuration><CurrentSleepTimerGeneration>3</CurrentSleepTimerGeneration>';
        expect(await getSleepTimer(baseUrl)).to.equal(1798);
        expect(requests[0].path).to.equal('/MediaRenderer/AVTransport/Control');
        expect(requests[0].body).to.include('<InstanceID>0</InstanceID>');

        answers.GetRemainingSleepTimerDuration =
            '<RemainingSleepTimerDuration></RemainingSleepTimerDuration><CurrentSleepTimerGeneration>3</CurrentSleepTimerGeneration>';
        expect(await getSleepTimer(baseUrl)).to.equal(0);
    });

    it('is null for a speaker that is not the coordinator', async () => {
        answers.GetRemainingSleepTimerDuration = 800;
        expect(await getSleepTimer(baseUrl)).to.be.null;
    });

    it('sets the sleep timer as hh:mm:ss and cancels it with an empty duration', async () => {
        await setSleepTimer(baseUrl, 1800);
        await setSleepTimer(baseUrl, 5430);
        await setSleepTimer(baseUrl, 0);

        expect(requests.map(request => request.action)).to.deep.equal([
            'ConfigureSleepTimer',
            'ConfigureSleepTimer',
            'ConfigureSleepTimer',
        ]);
        expect(requests[0].body).to.include('<NewSleepTimerDuration>00:30:00</NewSleepTimerDuration>');
        expect(requests[1].body).to.include('<NewSleepTimerDuration>01:30:30</NewSleepTimerDuration>');
        expect(requests[2].body).to.include('<NewSleepTimerDuration></NewSleepTimerDuration>');
    });
});

describe('favorite without autoplay (#173)', () => {
    const { DiscoveryDevice } = require('../build/lib/backend/discovery-backend');
    const { SvrooijDevice } = require('../build/lib/backend/svrooij-backend');

    let calls;
    beforeEach(() => (calls = []));

    describe('sonos-discovery', () => {
        const device = () =>
            new DiscoveryDevice(
                {
                    uuid: 'RINCON_1',
                    baseUrl: 'http://192.168.1.50:1400',
                    roomName: 'Kitchen',
                    replaceWithFavorite: async title => calls.push(`favorite ${title}`),
                    replaceWithPlaylist: async title => calls.push(`playlist ${title}`),
                    play: async () => calls.push('play'),
                },
                {},
            );

        it('plays a favorite or a playlist by default', async () => {
            await device().playFavorite('Radio Bob');
            await device().playPlaylist('Morning');
            expect(calls).to.deep.equal(['favorite Radio Bob', 'play', 'playlist Morning', 'play']);
        });

        it('only loads them without autoplay', async () => {
            await device().playFavorite('Radio Bob', false);
            await device().playPlaylist('Morning', false);
            expect(calls).to.deep.equal(['favorite Radio Bob', 'playlist Morning']);
        });
    });

    describe('@svrooij/sonos', () => {
        const backend = {
            getFavorites: async () => [{ title: 'Radio Bob', uri: 'x-sonosapi-stream:s1?sid=254', metadata: '' }],
            getPlaylists: async () => [{ title: 'Morning', uri: 'file:///jffs/settings/savedqueues.rsq#3', metadata: '' }],
        };
        const device = () =>
            new SvrooijDevice(
                {
                    Uuid: 'RINCON_1',
                    Host: '192.168.1.50',
                    Port: 1400,
                    Name: 'Kitchen',
                    Play: async () => calls.push('play'),
                    SwitchToQueue: async () => calls.push('queue'),
                    AVTransportService: {
                        SetAVTransportURI: async input => calls.push(`uri ${input.CurrentURI}`),
                        RemoveAllTracksFromQueue: async () => calls.push('clear'),
                        AddURIToQueue: async input => {
                            calls.push(`add ${input.EnqueuedURI}`);
                            return { FirstTrackNumberEnqueued: 1 };
                        },
                    },
                },
                backend,
            );

        it('plays a favorite or a playlist by default', async () => {
            await device().playFavorite('Radio Bob');
            await device().playPlaylist('Morning');
            expect(calls).to.deep.equal([
                'uri x-sonosapi-stream:s1?sid=254',
                'play',
                'clear',
                'add file:///jffs/settings/savedqueues.rsq#3',
                'queue',
                'play',
            ]);
        });

        it('only loads them without autoplay', async () => {
            await device().playFavorite('Radio Bob', false);
            await device().playPlaylist('Morning', false);
            expect(calls).to.not.include('play');
            expect(calls).to.include('uri x-sonosapi-stream:s1?sid=254');
            expect(calls).to.include('queue');
        });
    });
});

describe('TTS after a file that cannot be played (#176)', () => {
    const { TTS } = require('../build/lib/tts');

    /** Lets the promise chains of the TTS run to their end */
    const settle = async () => {
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setImmediate(resolve));
        }
    };

    function fakeAdapter() {
        const errors = [];
        return {
            errors,
            config: { fadeIn: 0, fadeOut: 0 },
            log: { debug: () => {}, info: () => {}, warn: () => {}, error: text => errors.push(text) },
            // the 40 s safety timer of a playing file is not needed here
            setTimeout: () => ({}),
            clearTimeout: () => {},
            delay: async () => {},
        };
    }

    function fakePlayer(failures) {
        const calls = [];
        const player = {
            state: {
                playbackState: 'PLAYING',
                volume: 30,
                mute: false,
                currentTrack: { uri: 'x-file-cifs://nas/music/song.mp3' },
                trackNo: 3,
                elapsedTime: 42,
            },
            volume: 30,
            muted: false,
            transportUriMetadata: '',
            setVolume: async volume => {
                calls.push(`volume ${volume}`);
                player.state.volume = volume;
            },
            setMute: async mute => calls.push(`mute ${mute}`),
            addToQueue: async uri => {
                calls.push(`queue ${uri}`);
                if (failures.includes(uri)) {
                    throw new Error('UPnP error 714');
                }
                return 7;
            },
            seekTrack: async track => calls.push(`track ${track}`),
            seekTime: async time => calls.push(`time ${time}`),
            play: async () => calls.push('play'),
            pause: async () => calls.push('pause'),
            removeFromQueue: async track => calls.push(`remove ${track}`),
            setTransportUri: async uri => calls.push(`uri ${uri}`),
        };
        return { player, calls };
    }

    it('gives the volume back when a file fails', async () => {
        const adapter = fakeAdapter();
        const { player, calls } = fakePlayer(['http://host/broken.mp3']);
        const tts = new TTS(adapter, player);

        tts.add('http://host/broken.mp3', 50);
        await settle();

        expect(calls).to.include('volume 0'); // faded out for the announcement
        expect(calls[calls.length - 1]).to.equal('volume 30');
        expect(calls).to.include('track 3');
        expect(calls).to.include('time 42');
        expect(adapter.errors.join('\n')).to.contain('UPnP error 714');
        tts.destroy();
    });

    it('plays the next announcement after a failed one', async () => {
        const { player, calls } = fakePlayer(['http://host/broken.mp3']);
        const tts = new TTS(fakeAdapter(), player);

        tts.add('http://host/broken.mp3', 50);
        await settle();
        tts.add('http://host/hello.mp3', 40);
        await settle();

        expect(calls).to.include('queue http://host/hello.mp3');
        expect(calls[calls.length - 1]).to.equal('volume 40');
        tts.destroy();
    });

    it('goes on with the queue when a file in the middle fails', async () => {
        const { player, calls } = fakePlayer(['http://host/broken.mp3']);
        const tts = new TTS(fakeAdapter(), player);

        tts.add('http://host/first.mp3', 40);
        tts.add('http://host/broken.mp3', 40);
        tts.add('http://host/third.mp3', 40);
        await settle();
        // the first file ended - a stop in the first second after the start is ignored, so move the start back
        tts.playStopped = Date.now() - 5000;
        tts.playingEnded();
        await settle();

        expect(calls).to.include('queue http://host/broken.mp3');
        expect(calls).to.include('queue http://host/third.mp3');
        tts.destroy();
    });
});

describe('speakers that left their group (#121)', () => {
    const { speakersLeftGroup } = require('../build/lib/group-changes');

    it('finds a speaker that followed another one and follows itself now', () => {
        const before = { kitchen: 'living', living: 'living', bath: 'bath' };
        const after = { kitchen: 'kitchen', living: 'living', bath: 'bath' };
        expect(speakersLeftGroup(before, after)).to.deep.equal(['kitchen']);
    });

    it('finds every member of a dissolved group', () => {
        const before = { kitchen: 'living', bath: 'living', living: 'living' };
        const after = { kitchen: 'kitchen', bath: 'bath', living: 'living' };
        expect(speakersLeftGroup(before, after)).to.have.members(['kitchen', 'bath']);
    });

    it('ignores a speaker that joins a group or moves into another one', () => {
        const before = { kitchen: 'kitchen', bath: 'living' };
        const after = { kitchen: 'living', bath: 'office' };
        expect(speakersLeftGroup(before, after)).to.deep.equal([]);
    });

    it('ignores the first topology after the start and unchanged speakers', () => {
        expect(speakersLeftGroup({}, { kitchen: 'kitchen' })).to.deep.equal([]);
        expect(speakersLeftGroup({ kitchen: 'kitchen' }, { kitchen: 'kitchen' })).to.deep.equal([]);
    });
});

describe('log of sonos-discovery in the adapter log (#177)', () => {
    const { libraryLogText, routeLibraryLog } = require('../build/lib/backend/discovery-backend');
    const libraryLogger = require('sonos-discovery/lib/helpers/logger');

    it('joins messages and error messages', () => {
        expect(libraryLogText([new Error('EHOSTUNREACH'), 'resubscribing failed'])).to.equal(
            'resubscribing failed - EHOSTUNREACH',
        );
        expect(libraryLogText(['state', { a: 1 }, undefined])).to.equal('state - {"a":1}');
    });

    it('turns errors of the library into warnings and the rest into debug output', () => {
        const log = { warn: [], info: [], debug: [] };
        routeLibraryLog({
            warn: text => log.warn.push(text),
            info: text => log.info.push(text),
            debug: text => log.debug.push(text),
        });

        // what Player.js does when the metadata of a transport event cannot be processed
        libraryLogger.error(new Error('Unexpected close tag'));
        libraryLogger.warn('resubscribing to sid uuid:1 failed', new Error('EHOSTUNREACH'));
        libraryLogger.error('unsubscribe from sid uuid:1 failed', new Error('ECONNREFUSED'));
        libraryLogger.debug('Updated playback state in notification handler');

        expect(log.warn).to.deep.equal(['sonos-discovery: Unexpected close tag']);
        expect(log.debug).to.deep.equal([
            'sonos-discovery: resubscribing to sid uuid:1 failed - EHOSTUNREACH',
            'sonos-discovery: unsubscribe from sid uuid:1 failed - ECONNREFUSED',
        ]);
    });
});

describe('channel of a speaker under a new address (#140)', () => {
    const { ChannelRegistry } = require('../build/lib/channel-registry');

    function registry() {
        const bound = [];
        const moved = [];
        const reg = new ChannelRegistry(
            (channel, uuid) => bound.push(`${channel}=${uuid}`),
            (channel, uuid, ipChannel) => moved.push(`${channel}->${ipChannel}`),
        );
        return { reg, bound, moved };
    }

    it('binds a configured channel to the speaker found at its address', () => {
        const { reg, bound } = registry();
        reg.addChannel('192_168_1_50');

        expect(reg.resolve('RINCON_A', '192_168_1_50')).to.equal('192_168_1_50');
        expect(reg.resolve('RINCON_A', '192_168_1_50')).to.equal('192_168_1_50');
        expect(bound).to.deep.equal(['192_168_1_50=RINCON_A']);
        expect(reg.uuidOf('192_168_1_50')).to.equal('RINCON_A');
    });

    it('keeps the channel when the speaker gets a new address', () => {
        const { reg, moved } = registry();
        reg.addChannel('192_168_1_50');
        reg.resolve('RINCON_A', '192_168_1_50');

        expect(reg.resolve('RINCON_A', '192_168_1_60')).to.equal('192_168_1_50');
        expect(reg.resolve('RINCON_A', '192_168_1_60')).to.equal('192_168_1_50');
        expect(moved).to.deep.equal(['192_168_1_50->192_168_1_60']); // reported once
    });

    it('does not give the channel to another speaker that got the old address', () => {
        const { reg } = registry();
        reg.addChannel('192_168_1_50');
        reg.resolve('RINCON_A', '192_168_1_50');

        expect(reg.resolve('RINCON_B', '192_168_1_50')).to.equal(null);
    });

    it('knows the speaker stored with the channel after a restart', () => {
        const { reg, bound } = registry();
        reg.addChannel('192_168_1_50', 'RINCON_A');

        expect(reg.resolve('RINCON_A', '192_168_1_60')).to.equal('192_168_1_50');
        expect(reg.resolve('RINCON_B', '192_168_1_50')).to.equal(null);
        expect(bound).to.deep.equal([]);
    });

    it('names a speaker without channel after its address, as before', () => {
        const { reg, bound } = registry();
        reg.addChannel('192_168_1_50');

        expect(reg.resolve('RINCON_C', '192_168_1_70')).to.equal('192_168_1_70');
        expect(reg.resolve('RINCON_C', null)).to.equal(null);
        expect(bound).to.deep.equal([]);
    });

    it('forgets everything when the configuration is read again', () => {
        const { reg } = registry();
        reg.addChannel('192_168_1_50', 'RINCON_A');
        reg.clear();

        expect(reg.resolve('RINCON_A', '192_168_1_60')).to.equal('192_168_1_60');
    });
});

describe('stereo pairs', () => {
    const http = require('node:http');
    const { parseZoneGroupState, pairDescription, readZoneGroupState, stereoPairOf } = require(
        '../build/lib/stereo-pairs',
    );
    const { xmlEscape } = require('../build/lib/content-directory');

    const location = ip => `http://${ip}:1400/xml/device_description.xml`;
    const PAIR = 'RINCON_A01400:LF,LF;RINCON_B01400:RF,RF';

    // as a speaker answers GetZoneGroupState: the topology is an XML document inside the SOAP answer
    const topology =
        '<ZoneGroupState><ZoneGroups>' +
        // a stereo pair: the right speaker is hidden
        '<ZoneGroup Coordinator="RINCON_A01400" ID="RINCON_A01400:1">' +
        `<ZoneGroupMember UUID="RINCON_A01400" Location="${location('192.168.1.21')}" ZoneName="Wohnzimmer" ChannelMapSet="${PAIR}"/>` +
        `<ZoneGroupMember UUID="RINCON_B01400" Location="${location('192.168.1.22')}" ZoneName="Wohnzimmer" Invisible="1" ChannelMapSet="${PAIR}"/>` +
        '</ZoneGroup>' +
        // a soundbar with Sub and surrounds: the satellites are nested and no pair
        '<ZoneGroup Coordinator="RINCON_C01400" ID="RINCON_C01400:2">' +
        `<ZoneGroupMember UUID="RINCON_C01400" Location="${location('192.168.1.30')}" ZoneName="Kino &amp; Bar" HTSatChanMapSet="RINCON_C01400:LF,RF;RINCON_D01400:SW;RINCON_E01400:LR;RINCON_F01400:RR">` +
        `<Satellite UUID="RINCON_D01400" Location="${location('192.168.1.31')}" ZoneName="Kino &amp; Bar" Invisible="1"/>` +
        `<Satellite UUID="RINCON_E01400" Location="${location('192.168.1.32')}" ZoneName="Kino &amp; Bar" Invisible="1"/>` +
        '</ZoneGroupMember>' +
        '</ZoneGroup>' +
        // a single speaker with a Sub is no pair either
        '<ZoneGroup Coordinator="RINCON_G01400" ID="RINCON_G01400:3">' +
        `<ZoneGroupMember UUID="RINCON_G01400" Location="${location('192.168.1.40')}" ZoneName="Kitchen" ChannelMapSet="RINCON_G01400:LF,RF;RINCON_H01400:SW,SW"/>` +
        `<ZoneGroupMember UUID="RINCON_H01400" Location="${location('192.168.1.41')}" ZoneName="Kitchen" Invisible="1" ChannelMapSet="RINCON_G01400:LF,RF;RINCON_H01400:SW,SW"/>` +
        '</ZoneGroup>' +
        '</ZoneGroups><VanishedDevices></VanishedDevices></ZoneGroupState>';

    const answer = xml =>
        `<s:Envelope><s:Body><u:GetZoneGroupStateResponse><ZoneGroupState>${xmlEscape(xml)}</ZoneGroupState></u:GetZoneGroupStateResponse></s:Body></s:Envelope>`;

    it('finds the two speakers of a pair in the channel map', () => {
        expect(stereoPairOf(PAIR)).to.deep.equal({ left: 'RINCON_A01400', right: 'RINCON_B01400' });
        expect(stereoPairOf(`${PAIR};RINCON_S01400:SW,SW`)).to.deep.equal({
            left: 'RINCON_A01400',
            right: 'RINCON_B01400',
        });
    });

    it('finds no pair in a single speaker with a Sub, a soundbar or no map', () => {
        expect(stereoPairOf('RINCON_G01400:LF,RF;RINCON_H01400:SW,SW')).to.be.null;
        expect(stereoPairOf('RINCON_C01400:LF,RF;RINCON_D01400:SW;RINCON_E01400:LR;RINCON_F01400:RR')).to.be.null;
        expect(stereoPairOf('')).to.be.null;
        expect(stereoPairOf(undefined)).to.be.null;
    });

    it('marks both speakers of a pair, the hidden one as invisible', () => {
        const members = parseZoneGroupState(answer(topology));
        const byUuid = uuid => members.find(member => member.uuid === uuid);

        expect(byUuid('RINCON_A01400')).to.deep.equal({
            uuid: 'RINCON_A01400',
            ip: '192.168.1.21',
            roomName: 'Wohnzimmer',
            invisible: false,
            pair: { role: 'left', invisible: false, partnerUuid: 'RINCON_B01400', partnerIp: '192.168.1.22' },
        });
        expect(byUuid('RINCON_B01400')).to.deep.equal({
            uuid: 'RINCON_B01400',
            ip: '192.168.1.22',
            roomName: 'Wohnzimmer',
            invisible: true,
            pair: { role: 'right', invisible: true, partnerUuid: 'RINCON_A01400', partnerIp: '192.168.1.21' },
        });
    });

    it('lists the other speakers without pair, and no satellites', () => {
        const members = parseZoneGroupState(answer(topology));

        expect(members.map(member => member.uuid)).to.deep.equal([
            'RINCON_A01400',
            'RINCON_B01400',
            'RINCON_C01400',
            'RINCON_G01400',
            'RINCON_H01400',
        ]);
        expect(members.slice(2).map(member => member.pair)).to.deep.equal([undefined, undefined, undefined]);
        expect(members[2].roomName).to.equal('Kino & Bar');
        expect(members[2].ip).to.equal('192.168.1.30');
    });

    it('is empty for an answer without topology', () => {
        expect(parseZoneGroupState('<s:Envelope><s:Body></s:Body></s:Envelope>')).to.deep.equal([]);
        expect(parseZoneGroupState('')).to.deep.equal([]);
    });

    it('describes the hidden speaker as controlled through its partner', () => {
        const right = pairDescription(
            { role: 'right', invisible: true, partnerUuid: 'RINCON_A01400', partnerIp: '192.168.1.21' },
            '192.168.1.21',
        );
        expect(right.en).to.equal(
            'Right speaker of the stereo pair with 192.168.1.21 - SONOS controls the pair through 192.168.1.21 only',
        );
        expect(right.de).to.equal(
            'Rechter Lautsprecher des Stereopaars mit 192.168.1.21 - SONOS steuert das Paar nur über 192.168.1.21',
        );

        const left = pairDescription(
            { role: 'left', invisible: false, partnerUuid: 'RINCON_B01400', partnerIp: '192.168.1.22' },
            '192.168.1.22',
        );
        expect(left.en).to.equal('Left speaker of the stereo pair with 192.168.1.22 - controls the pair');
    });

    describe('from the speaker', () => {
        let server;
        let baseUrl;
        let requests;

        before(async () => {
            server = http.createServer((req, res) => {
                req.resume();
                req.on('end', () => {
                    requests.push({ path: req.url, action: String(req.headers.soapaction) });
                    res.end(answer(topology));
                });
            });
            await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
            baseUrl = `http://127.0.0.1:${server.address().port}`;
        });

        after(() => server.close());

        beforeEach(() => {
            requests = [];
        });

        it('asks the ZoneGroupTopology service', async () => {
            const members = await readZoneGroupState(baseUrl);

            expect(requests).to.deep.equal([
                {
                    path: '/ZoneGroupTopology/Control',
                    action: '"urn:schemas-upnp-org:service:ZoneGroupTopology:1#GetZoneGroupState"',
                },
            ]);
            expect(members.filter(member => member.pair).map(member => member.uuid)).to.deep.equal([
                'RINCON_A01400',
                'RINCON_B01400',
            ]);
        });
    });
});
