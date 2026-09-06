![Logo](admin/sonos.png)
# ioBroker.sonos

![Number of Installations](http://iobroker.live/badges/sonos-installed.svg)
![Number of Installations](http://iobroker.live/badges/sonos-stable.svg)
[![NPM version](http://img.shields.io/npm/v/iobroker.sonos.svg)](https://www.npmjs.com/package/iobroker.sonos)

![Test and Release](https://github.com/ioBroker/ioBroker.sonos/workflows/Test%20and%20Release/badge.svg)
[![Translation status](https://weblate.iobroker.net/widgets/adapters/-/sonos/svg-badge.svg)](https://weblate.iobroker.net/engage/adapters/?utm_source=widget)
[![Downloads](https://img.shields.io/npm/dm/iobroker.sonos.svg)](https://www.npmjs.com/package/iobroker.sonos)

Control and monitor SONOS devices with ioBroker.

## Widgets

The adapter ships one widget for both visualisation adapters. Both are installed with the adapter;
**vis** and **vis-2** are restarted automatically, and the editor needs a hard reload (Ctrl+F5).

**Sonos Control** switches rooms, controls playback, forms groups and starts favorites, playlists,
queue tracks, recent tracks and sources. Bind it to an *instance*, for example `sonos.0` - not to a
single state such as `play`. The widget discovers every speaker of that instance on its own.

Every discovered speaker appears as a chip at the top. Group membership is toggled with the
checkboxes. If a room belongs to a group, the now-playing area shows the track of the group, not the
last local title of that room. The library buttons (**Favorites**, **Playlists**, **Queue**,
**Recent**, **Sources**) open a sheet below them. **Recent** lists the last tracks of the selected
room.

![Sonos Control - player](img/widget-player.png)

*Rooms, grouping and now-playing*

![Sonos Control - favorites](img/widget-favorites.png)

*The library buttons open a sheet below the rooms*

![Sonos Control - sources](img/widget-sources.png)

*Sources: TuneIn, the music library, network shares, line-in and TV HDMI*

![Sonos Control - TV HDMI](img/widget-hdmi.png)

*TV HDMI: title TV, format, mute, night sound and speech enhancement*

### vis-2 and vis 1

There are two implementations of **Sonos Control** under the same template id `tplSonosControl`:
a React one for vis-2 (`src-widgets`) and the original jQuery one for vis 1 (`widgets/sonos.html`).

Each editor only ever shows one of them. Because the adapter declares `common.visWidgets`, vis-2
skips `widgets/sonos.html` completely and loads the React widget; vis 1 does not know about React
widget sets and loads the jQuery one. Views that were built with the vis-1 widget keep their
`oid` binding when they are opened in vis-2.

vis-2 additionally offers **Sonos room**, one speaker as a compact card with cover, title, transport
and volume. It has no vis-1 counterpart.

In vis-2 each part of Sonos Control (rooms, groups, volume, library) can be switched off, and the
widget can start on a given room.

### Sources

**Sources** browses TuneIn radio, the music library, network shares and line-in through the
speaker's content directory. Music services are listed only when the household actually reports
them, and services with a SMAPI catalog (Spotify for example) can be searched after a one-time
sign-in. Services without such a catalog only show what is already saved in the Sonos app as a
favorite or playlist.

**TV** appears only on speakers that really have an HDMI or optical input (Arc, Beam, Playbar,
Playbase, Ray, Amp). On the TV input there is no transport control - play, pause, seek, next and
previous are not offered; mute, night sound and speech enhancement are.

## Handling of groups
* States for handling SONOS groups:
   * **`coordinator`**: set/get the coordinator, so the SONOS device which is the master and coordinating the group. It requires the IP address (channel name) of the SONOS device to be the coordinator, but with underscore `_` instead of dot `.`, so use for example `192_168_0_100` for IP address `192.168.0.100`. If the device does not belong to any group, then the value is equal to the own channel name (IP).
   * **`group_volume`**: the volume of the group
   * **`group_muted`**: mute status of the group.
   * **`add_to_group`**: Add a certain SONOS device to the SONOS device under which this state is. Use IP address with underscores (see above).
   * **`remove_from_group`**: Remove a certain SONOS device from the SONOS device under which this state is. Use IP address with underscores (see above).

*) These states will be updated if changes are made in the SONOS app.

## Using it with the sayIt adapter
To use the [sayit adapter](https://github.com/ioBroker/ioBroker.sayit) with this SONOS adapter, ensure that the [web adapter](https://github.com/ioBroker/ioBroker.web) is instantiated and running too. The web adapter is required to allow the SONOS adapter to read the generated MP3 file from the sayit adapter.

### Warning: Stability problems in combination with sayIt adapter
Please note: This SONOS adapter has stability issues if using 'text to speech' with the sayIt adapter. Symptoms observed:
1. Arbitrary change of volume to 0 or 100 %.
2. No response after a random number of text to speech sequences

Workaround for text to speech is to use the [SONOS HTTP API](https://github.com/jishi/node-sonos-http-api).

## Favorites & Queue in VIS
Use states `favorites_list_html` and `queue_html` to show playlists and current queue with basic html widget in VIS. By clicking on a row, the playlist or track will be played immediately.
Format the table with the following css classes:

### Favorites
* `sonosFavoriteTable`: hole favorite table
* `sonosFavoriteRow`: rows with favorite information
* `sonosFavoriteNumber`: Number of favorites
* `sonosFavoriteCover`: Album art of favorite (grab image with `.sonosFavoriteCover img`)
* `sonosFavoriteTitle`: Name of favorite

### Queue
* `.sonosQueueTable`: hole table
* `.sonosQueueRow`: rows containing track information
* `.currentTrack`: added to the row containg the current playing track
* `.sonosQueueTrackNumber`: Number or track
* `.sonosQueueTrackCover`: Album art of track (grab image with `.sonosQueueTrackCover img`)
* `.sonosQueueTrackArtist`: Name of artist
* `.sonosQueueTrackAlbum`: Name of album (use `display:none`if not needed)
* `.sonosQueueTrackTitle`: Name of title

For long lists add `overflow:auto;` or `overflow-y:auto;` to basic html widget.
Please note: highlighting current playing favorite is not supported.

### Sample CSS
```
.sonosFavoriteTable {
    color: #bbb;
    font-size: 12px;
}
.sonosFavoriteRow {
    cursor: pointer;
}
.sonosFavoriteNumber {}
.sonosFavoriteCover img {
    width: 30px;
    height: 30px;
}
.sonosFavoriteTitle {}

.sonosQueueTable {
    color: #bbb;
    font-size: 12px;
}
.sonosQueueRow {
    display: table-row;
    cursor: pointer;
}
.sonosQueueRow.currentTrack {
    color: #fff;
    font-weight: bold;
}
.sonosQueueTrackNumber {}
.sonosQueueTrackCover img {
    width: 30px;
    height: 30px;
    display: table-column;
}
.sonosQueueTrackArtist {
    display: table-row;
}
.sonosQueueTrackAlbum {
    display: none;
}
.sonosQueueTrackTitle {
    display: table-row;
}
```

## To Do
* Rewrite with https://github.com/svrooij/node-sonos-ts

## Configuration
- Web server - [optional] If web server enabled or not
- Update of elapsed time(ms) - Interval in ms how often to update elapsed timer when the title is playing. (Default 2000)

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
## Changelog
### **WORK IN PROGRESS**
* (@GermanBluefox) Added a React implementation of `Sonos Control` for vis-2, plus the new `Sonos room` widget
* (kosmix1980) vis widget: rooms, groups, favorites, playlists, queue, recent tracks and sources
* (kosmix1980) Sources: TuneIn, music library, network shares, line-in and SMAPI catalog search
* (kosmix1980) TV HDMI as a playable source with format, cover, night sound and speech enhancement
* (kosmix1980) Added `playlist_list` / `playlist_list_array` and per-room `recent_tracks`
* (kosmix1980) Group members follow the coordinator's now-playing and transport
* (@GermanBluefox) TV is offered only on speakers that have an HDMI/optical input
* (@GermanBluefox) Music services are listed only when the household reports them
* (@GermanBluefox) Removed the YouTube Music catalog search: it used a private, undocumented Google endpoint
* (@GermanBluefox) Only the group coordinator updates the elapsed time of the group now
* (@GermanBluefox) SMAPI account tokens are stored with restrictive file permissions

### 4.0.3 (2026-08-13)
* (@GermanBluefox) Fixed TTS: without a volume in the file name, the announcement was played with volume 0
* (@GermanBluefox) Fixed the immediate stop of TTS: the state before TTS was not restored and TTS stayed blocked
* (@GermanBluefox) A muted player is unmuted now for the announcement and muted again afterwards
* (@GermanBluefox) An empty value in the `tts` state stops the running announcement
* (@GermanBluefox) The adapter was migrated to TypeScript and is now based on classes
* (@GermanBluefox) The "root" device object is created now by js-controller from io-package.json
* (biglouis) Missing states of the already existing devices will be created at the start
* (VierlingMt) Fixed the error if `favorites_set` was called with an empty value
* (seb2010) Added support for treble and bass information
* (Apollon77) stores the tts files in files instead of binary states

### 3.0.0 (2023-10-09)
* (udondan) Added support for the playing Sonos playlists (added new state `playlist_set`)
* (bluefox) The minimal node.js version is 16

### 2.3.3 (2023-09-21)
* (foxriver76) fixed cover url

### 2.3.2 (2023-09-20)
* (foxriver76) stores the cover file in files instead of binary states

### 2.3.1 (2023-03-22)
* (Apollon77) Prepare for future js-controller versions

## License

The MIT License (MIT)

Copyright (c) 2014-2026, bluefox <dogafox@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
