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
