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
