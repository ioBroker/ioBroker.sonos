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
