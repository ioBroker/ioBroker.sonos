/**
 * The styles of the shadow roots. An element fills the box of its host, has a transparent background, inherits
 * `color` and `font` and takes everything else from the theme of the host (`--iob-*`), so it looks right in light
 * and dark. It never measures itself: the parts it shows follow the size of the box with container queries.
 *
 * `--accent` is the color of the sliders and the active buttons: the setting of the component, else the primary
 * color of the host.
 */

/** What every shadow root needs: the box, buttons, sliders, covers and the hint */
export const BASE_CSS = `
:host {
    display: block;
    width: 100%;
    height: 100%;
}
* {
    box-sizing: border-box;
}
.mount {
    width: 100%;
    height: 100%;
    /* the size of the box does not depend on what is in it - the parts follow it, see the container queries */
    container-type: size;
}
.mount.dialog {
    height: auto;
    /* in a dialog the content decides the height: only the width is queried */
    container-type: inline-size;
}
.view {
    --hover: color-mix(in srgb, currentColor 10%, transparent);
    --track: color-mix(in srgb, currentColor 22%, transparent);
    --pad: clamp(4px, 3cqmin, 12px);
    --gap: clamp(4px, 2.5cqmin, 10px);
    --icon: clamp(18px, 8cqmin, 26px);
    width: 100%;
    height: 100%;
    padding: var(--pad);
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    overflow: hidden;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
}
.dialog .view {
    --pad: 0px;
    --gap: 12px;
    --icon: 24px;
    height: auto;
}
.edit {
    pointer-events: none;
}
.secondary {
    color: var(--iob-text-secondary);
}
button {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    margin: 0;
    padding: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
}
button:disabled {
    cursor: default;
    opacity: 0.4;
}
button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
}
button svg {
    width: var(--icon);
    height: var(--icon);
    fill: currentColor;
    display: block;
}
button.icon {
    padding: calc(var(--icon) * 0.2);
    border-radius: 50%;
}
button.icon:hover:not(:disabled),
button.pill:hover:not(:disabled) {
    background: var(--hover);
}
button.small svg {
    width: calc(var(--icon) * 0.8);
    height: calc(var(--icon) * 0.8);
}
button.active {
    color: var(--accent);
}
button.main {
    color: var(--accent);
    box-shadow: inset 0 0 0 2px var(--accent);
}
button.main svg {
    width: calc(var(--icon) * 1.25);
    height: calc(var(--icon) * 1.25);
}
button.pill {
    gap: 6px;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid var(--iob-divider);
    font-size: 0.85em;
    white-space: nowrap;
}
button.pill svg {
    width: 1.2em;
    height: 1.2em;
}
button.pill.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
}
input[type='range'] {
    --fill: 0%;
    /* a form control does not inherit the color; the thumb and the track are drawn in it */
    color: inherit;
    flex: 1;
    min-width: 0;
    height: 18px;
    margin: 0;
    background: transparent;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
}
input[type='range']:disabled {
    cursor: default;
    opacity: 0.4;
}
input[type='range']:focus-visible {
    outline: none;
}
input[type='range']::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(to right, var(--accent) var(--fill), var(--track) var(--fill));
}
input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -4px;
    border: none;
    border-radius: 50%;
    background: var(--accent);
}
input[type='range']:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 4px var(--track);
}
input[type='range']::-moz-range-track {
    height: 4px;
    border-radius: 2px;
    background: var(--track);
}
input[type='range']::-moz-range-progress {
    height: 4px;
    border-radius: 2px;
    background: var(--accent);
}
input[type='range']::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: none;
    border-radius: 50%;
    background: var(--accent);
}
.cover {
    border-radius: calc(var(--iob-border-radius) * 2);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--hover);
}
.cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}
.cover svg {
    width: 45%;
    height: 45%;
    fill: currentColor;
    opacity: 0.35;
}
.ellipsis {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.hint {
    width: 100%;
    height: 100%;
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-align: center;
    color: var(--iob-text-secondary);
    font-size: clamp(11px, 5cqmin, 15px);
}
.hint svg {
    width: clamp(18px, 10cqmin, 30px);
    height: clamp(18px, 10cqmin, 30px);
    fill: currentColor;
}
`;

/**
 * The player. The parts leave in this order as the box gets lower: groups, rooms, progress, volume - and in a strip
 * the transport, which is then a play button and a button that opens the whole player in a dialog.
 */
export const PLAYER_CSS = `
.player.offline .head .cover,
.player.offline .seek,
.player.offline .transport,
.player.offline .volume {
    opacity: 0.5;
}
.chips,
.groups {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
}
.groups .label {
    font-size: 0.8em;
    margin-right: 4px;
}
.head {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    align-items: center;
    gap: var(--gap);
}
.head > .cover {
    flex: none;
    height: min(100%, 40cqw);
    aspect-ratio: 1;
}
.info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
}
.name {
    font-size: clamp(10px, 4cqmin, 13px);
    line-height: 1.4;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}
.title {
    font-size: clamp(13px, 6.5cqmin, 22px);
    line-height: 1.3;
    font-weight: 600;
}
.sub {
    font-size: clamp(11px, 4.5cqmin, 15px);
    line-height: 1.4;
}
.quick {
    display: none;
    align-items: center;
    gap: 2px;
}
.seek,
.volume {
    flex: none;
    display: flex;
    align-items: center;
    gap: calc(var(--gap) * 0.6);
    min-width: 0;
}
.time,
.level {
    font-size: clamp(10px, 3.8cqmin, 13px);
    font-variant-numeric: tabular-nums;
    color: var(--iob-text-secondary);
}
.time {
    min-width: 3.2em;
}
.time.end,
.level {
    text-align: right;
}
.level {
    min-width: 2.2em;
}
.transport {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(2px, 3cqw, 16px);
}
@container (max-height: 259px) {
    .player .groups {
        display: none;
    }
}
@container (max-height: 229px) {
    .player .chips {
        display: none;
    }
}
@container (max-height: 189px) {
    .player .seek {
        display: none;
    }
}
@container (max-height: 149px) {
    .player .volume {
        display: none;
    }
}
@container (max-height: 109px) {
    .player .transport {
        display: none;
    }
    .player .quick {
        display: flex;
    }
}
@container (max-width: 299px) {
    .player .mode {
        display: none;
    }
}
@container (max-width: 179px) {
    .player .head > .cover {
        display: none;
    }
}
/* a tall, narrow box: the cover above the text */
@container (max-aspect-ratio: 4/5) and (min-height: 320px) {
    .player .head {
        flex-direction: column;
        justify-content: center;
    }
    .player .head > .cover {
        height: auto;
        width: min(80cqw, 38cqh);
    }
    .player .info {
        flex: none;
        width: 100%;
        text-align: center;
    }
}
.dialog .head {
    flex: none;
    flex-direction: column;
}
.dialog .head > .cover {
    height: auto;
    width: min(100%, 320px, 40vh);
}
.dialog .info {
    flex: none;
    width: 100%;
    text-align: center;
}
`;

/** The overview of all speakers; a low box shows only how many play and opens the list in a dialog */
export const ROOMS_CSS = `
.rooms-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.rooms-head svg,
.summary > svg {
    width: var(--icon);
    height: var(--icon);
    fill: currentColor;
    flex: none;
}
.rooms-head .label {
    flex: 1;
    font-weight: 600;
}
.rooms-head .count {
    font-variant-numeric: tabular-nums;
}
.link-hint {
    flex: none;
    color: var(--accent);
    font-size: 0.8em;
}
.list {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}
.dialog .list {
    flex: none;
    max-height: 70vh;
}
.row {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
    border-bottom: 1px solid var(--iob-divider);
}
.row:last-child {
    border-bottom: none;
}
.row.offline {
    opacity: 0.5;
}
.row > svg,
.row > img {
    width: 20px;
    height: 20px;
    flex: none;
    fill: currentColor;
    opacity: 0.7;
    object-fit: contain;
}
.row .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.row .room-name {
    font-weight: 600;
}
.row .playing {
    font-size: 0.85em;
}
.row .volume {
    flex: none;
    width: clamp(80px, 26cqw, 160px);
    display: flex;
    align-items: center;
    gap: 4px;
}
.row .volume svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
    opacity: 0.75;
    flex: none;
}
.summary {
    display: none;
    flex: 1;
    min-height: 0;
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    text-align: left;
    border-radius: calc(var(--iob-border-radius) * 2);
}
.summary .label {
    font-weight: 600;
    max-width: 100%;
}
.summary .big {
    font-size: clamp(18px, 16cqmin, 40px);
    font-weight: 700;
    line-height: 1;
}
.summary .big.playing {
    color: var(--accent);
}
.summary .total {
    font-size: 0.9em;
}
.summary .names {
    max-width: 100%;
    font-size: 0.85em;
}
@container (max-height: 159px) {
    .rooms .rooms-head,
    .rooms .link-hint,
    .rooms .list {
        display: none;
    }
    .rooms .summary {
        display: flex;
    }
}
@container (max-width: 279px) {
    .row .volume {
        display: none;
    }
}
`;

/** The source selection in its dialog */
export const SOURCE_CSS = `
.dialog .view.source {
    gap: 8px;
    height: min(70vh, 520px);
}
.tabs {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}
.search {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    border-bottom: 1px solid var(--iob-divider);
}
.search > svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
    opacity: 0.7;
}
.search input {
    flex: 1;
    min-width: 0;
    padding: 6px 0;
    border: none;
    outline: none;
    background: transparent;
    color: inherit;
    font: inherit;
}
.crumb {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 28px;
    font-size: 0.85em;
}
.items {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}
button.item {
    width: 100%;
    justify-content: flex-start;
    gap: 8px;
    padding: 4px;
    text-align: left;
    border-radius: var(--iob-border-radius);
}
button.item:hover {
    background: var(--hover);
}
.item .cover {
    width: 36px;
    height: 36px;
    flex: none;
    border-radius: 4px;
}
.item .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.item .text .sub {
    font-size: 0.8em;
}
.empty {
    padding: 8px;
    font-size: 0.85em;
}
`;

/**
 * The control centre: the speakers on the left, the player, the group and the library of the selected speaker on the
 * right - with the styles of the player and of the source selection, which it shows inline.
 *
 * The player part is a container of its own, so the player inside leaves out its parts as in its own box. In a
 * narrow box the speakers become a row of pills above; in a narrow or low one the right side shows one part at a
 * time, picked with the tabs (`.current`, kept by `ControlView`).
 */
export const CONTROL_CSS = `${PLAYER_CSS}${SOURCE_CSS}
.view.control {
    flex-direction: row;
}
.speakers {
    flex: 0 0 clamp(170px, 30cqw, 280px);
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-right: var(--gap);
    border-right: 1px solid var(--iob-divider);
}
.speakers-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.speakers-head > svg {
    width: calc(var(--icon) * 0.9);
    height: calc(var(--icon) * 0.9);
    fill: currentColor;
    flex: none;
}
.speakers-head .label {
    flex: 1;
    font-weight: 600;
}
.speaker-list {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
button.speaker {
    width: 100%;
    justify-content: flex-start;
    gap: 8px;
    padding: 6px 8px;
    text-align: left;
    border-radius: var(--iob-border-radius);
}
button.speaker:hover {
    background: var(--hover);
}
button.speaker.selected {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
}
button.speaker.selected .speaker-name {
    font-weight: 600;
}
button.speaker.offline {
    opacity: 0.5;
}
button.speaker > svg {
    width: 20px;
    height: 20px;
    opacity: 0.7;
}
button.speaker.playing > svg {
    fill: var(--accent);
    opacity: 1;
}
.speaker .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.speaker-sub {
    font-size: 0.85em;
}
.speaker-level {
    min-width: 2em;
    font-size: 0.8em;
    font-variant-numeric: tabular-nums;
    text-align: right;
}
.control-main {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--gap);
}
.part-tabs {
    flex: none;
    display: none;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
}
.part {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
.part > .view {
    flex: 1 1 0;
    min-height: 0;
    height: auto;
    padding: 0;
}
.part-player {
    flex: 0 0 clamp(150px, 44cqh, 260px);
    /* the player follows the size of its part, as in a box of its own */
    container-type: size;
}
.control-main:not(.has-library) .part-player {
    flex: 1 1 0;
}
.part-group {
    flex: none;
    max-height: 32cqh;
    overflow-y: auto;
    gap: 6px;
    padding: 6px 0;
    border-top: 1px solid var(--iob-divider);
    border-bottom: 1px solid var(--iob-divider);
}
.control-main:not(.has-library) .part-group {
    border-bottom: none;
}
.part-group .groups {
    flex-wrap: wrap;
    row-gap: 4px;
    overflow: visible;
}
.group-volume {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}
.group-volume > svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
    opacity: 0.75;
    flex: none;
}
.group-volume .label {
    flex: 0 1 auto;
    font-size: 0.8em;
}
.part-library {
    flex: 1 1 0;
}
.part-library > .view.source {
    gap: 6px;
}
/* a narrow box: the speakers are a row of pills above the rest */
@container (max-width: 599px) {
    .view.control {
        flex-direction: column;
    }
    .speakers {
        flex: none;
        padding: 0 0 var(--gap);
        border-right: none;
        border-bottom: 1px solid var(--iob-divider);
    }
    .speakers-head,
    .speaker-sub,
    .speaker-level {
        display: none;
    }
    .speaker-list {
        flex: none;
        flex-direction: row;
        gap: 4px;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
    }
    button.speaker {
        width: auto;
        max-width: 60cqw;
        gap: 6px;
        padding: 4px 12px;
        border: 1px solid var(--iob-divider);
        border-radius: 999px;
        font-size: 0.85em;
    }
    button.speaker.selected {
        border-color: var(--accent);
    }
    button.speaker > svg {
        width: 1.2em;
        height: 1.2em;
    }
}
/* a narrow or low box: one part at a time, picked with the tabs */
@container (max-width: 599px) or (max-height: 439px) {
    .part-tabs {
        display: flex;
    }
    .control-main .part {
        display: none;
    }
    .control-main .part.current {
        display: flex;
        flex: 1 1 0;
        max-height: none;
        border: none;
        padding: 0;
    }
}
`;
