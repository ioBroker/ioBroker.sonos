/**
 * What both elements share: the shadow root with React in it, the speakers of an instance, the source selection and
 * the dialogs.
 *
 * The base class `IobWebComponent` subscribes what `getStateIds` names whenever the socket or the settings change.
 * Here the states also depend on what arrives: the speakers of the instance (read once with `getObjectViewSystem`),
 * the group coordinator of a speaker (a state) and an open source selection. So every drawing compares the states
 * wanted now with those subscribed, and has them subscribed anew when they differ.
 */
import type { CSSProperties, ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { WebComponentSettings, WebComponentSocket } from '@iobroker/web-components';
import { getThemeCssVariables, IobWebComponent } from '@iobroker/web-components/element';

import { coordinatorOf, LIBRARY_STATES, stateId, toRooms, type RoomTarget, type SonosRoom } from './constants';
import { SourceBrowser } from './SourceBrowser';
import { BASE_CSS, SOURCE_CSS } from './styles';
import { getWords, type Word } from './words';

/** The IDs as one comparable text */
function toKey(ids: string[]): string {
    return [...new Set(ids.filter(Boolean))].sort().join('\n');
}

export abstract class SonosElement<TSettings extends WebComponentSettings> extends IobWebComponent<TSettings> {
    readonly #mount: HTMLDivElement;

    #root: Root | null = null;

    /** The states `getStateIds` named last - what the base class has subscribed */
    #subscribed = '';

    /** The speakers of `#roomsFor`; null while they are read */
    #rooms: SonosRoom[] | null = null;

    #roomsFor = '';

    #roomsSocket: WebComponentSocket | null = null;

    /** The speaker whose source selection is open */
    #sourceRoom: RoomTarget | null = null;

    /** The drawings of the open dialogs, run with every drawing of the element */
    readonly #dialogDrawings = new Set<() => void>();

    #words: { lang: string; word: Word } | null = null;

    protected constructor(css: string) {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = BASE_CSS + css;
        this.#mount = document.createElement('div');
        this.#mount.className = 'mount';
        shadow.append(style, this.#mount);
    }

    /** The states the element shows, without those of the source selection */
    protected abstract getWantedStateIds(settings: TSettings): string[];

    /** The instance whose speakers the element needs, or null if it needs none */
    protected abstract getRoomsNamespace(settings: TSettings): string | null;

    /** What the element shows */
    protected abstract draw(): ReactNode;

    override disconnectedCallback(): void {
        super.disconnectedCallback();
        // a host that only moves the element connects it again in the same task: keep React then
        queueMicrotask(() => {
            if (!this.isConnected && this.#root) {
                this.#root.unmount();
                this.#root = null;
            }
        });
    }

    protected override getStateIds(settings: TSettings): string[] {
        const ids = [...this.getWantedStateIds(settings), ...this.#getLibraryIds()];
        this.#subscribed = toKey(ids);
        return ids;
    }

    protected override render(): void {
        if (!this.isConnected) {
            return;
        }
        this.#loadRooms();
        if (
            this.socket &&
            toKey([...this.getWantedStateIds(this.settings), ...this.#getLibraryIds()]) !== this.#subscribed
        ) {
            // draws again once subscribed
            this.resubscribe();
            return;
        }
        this.#root ||= createRoot(this.#mount);
        this.#root.render(this.draw());
        this.#dialogDrawings.forEach(draw => draw());
    }

    /** Have the states subscribed that `getStateIds` names now: the base class asks again for new settings */
    protected resubscribe(): void {
        const settings = this.settings;
        this.settings = settings;
    }

    /** The words in the language of the system */
    protected get word(): Word {
        const lang = this.systemLang;
        if (this.#words?.lang !== lang) {
            this.#words = { lang, word: getWords(lang) };
        }
        return this.#words.word;
    }

    /** The color of the sliders and the active buttons */
    protected get accent(): string {
        const accent = this.settings.accent;
        return typeof accent === 'string' && accent.trim() ? accent.trim() : 'var(--iob-primary)';
    }

    /** The speakers of the instance `getRoomsNamespace` names; null while they are read */
    protected get rooms(): SonosRoom[] | null {
        const namespace = this.getRoomsNamespace(this.settings);
        return namespace && namespace === this.#roomsFor && this.socket === this.#roomsSocket ? this.#rooms : null;
    }

    /** The value of a state of a speaker, if it is subscribed */
    protected stateValue(namespace: string, room: string, name: string): ioBroker.StateValue | undefined {
        return this.states[stateId(namespace, room, name)]?.val;
    }

    /** Read the speakers of the instance once - again only when the instance or the socket changes */
    #loadRooms(): void {
        const socket = this.socket;
        const namespace = socket ? this.getRoomsNamespace(this.settings) : null;
        if (!socket || !namespace || (namespace === this.#roomsFor && socket === this.#roomsSocket)) {
            return;
        }
        this.#roomsFor = namespace;
        this.#roomsSocket = socket;
        this.#rooms = null;
        const prefix = `${namespace}.root.`;
        socket
            .getObjectViewSystem('channel', prefix, `${prefix}香`)
            .then(channels => toRooms(channels, namespace, this.systemLang))
            .catch((error: unknown) => {
                console.warn(`<${this.localName}>: cannot read the speakers of ${namespace}: ${String(error)}`);
                return [];
            })
            .then(rooms => {
                if (namespace === this.#roomsFor && socket === this.#roomsSocket) {
                    this.#rooms = rooms;
                    this.resubscribe();
                }
            })
            .catch(() => undefined);
    }

    /** The lists of the open source selection: those of the speaker and of its group coordinator */
    #getLibraryIds(): string[] {
        const source = this.#sourceRoom;
        if (!source) {
            return [];
        }
        const { namespace, room } = source;
        const ids = [stateId(namespace, room, 'coordinator')];
        const coordinator = coordinatorOf(room, this.stateValue(namespace, room, 'coordinator'));
        for (const name of LIBRARY_STATES) {
            ids.push(stateId(namespace, room, name));
            if (coordinator !== room) {
                ids.push(stateId(namespace, coordinator, name));
            }
        }
        return ids;
    }

    /**
     * Show React content in a dialog of the host. It is drawn again with the element, so it follows the states
     *
     * @param title title of the dialog
     * @param css styles of the content, in a shadow root of its own
     * @param width the width wanted, in px
     * @param content what to draw
     */
    protected async openInDialog(title: string, css: string, width: number, content: () => ReactNode): Promise<void> {
        if (this.editMode) {
            return;
        }
        const element = document.createElement('div');
        const shadow = element.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = BASE_CSS + css;
        const mount = document.createElement('div');
        mount.className = 'mount dialog';
        shadow.append(style, mount);
        const root = createRoot(mount);
        const draw = (): void => {
            // the host moves the content into its dialog, out of this element: it brings the theme along
            for (const [name, value] of Object.entries(getThemeCssVariables(this.theme))) {
                element.style.setProperty(name, value);
            }
            root.render(content());
        };
        this.#dialogDrawings.add(draw);
        draw();
        try {
            await this.openDialog({ title, element, width });
        } finally {
            this.#dialogDrawings.delete(draw);
            root.unmount();
        }
    }

    /**
     * The source selection of a speaker: favorites, playlists, queue, recently played and the sources
     *
     * @param target the speaker
     * @param name its name, for the title
     */
    protected async openSources(target: RoomTarget, name: string): Promise<void> {
        if (this.editMode || this.#sourceRoom) {
            return;
        }
        this.#sourceRoom = target;
        this.resubscribe();
        const { namespace, room } = target;
        try {
            await this.openInDialog(`${this.word('sonosdm_sources')} · ${name}`, SOURCE_CSS, 600, () => (
                <div
                    className="view source"
                    style={{ '--accent': this.accent } as CSSProperties}
                >
                    <SourceBrowser
                        room={room}
                        coordinator={coordinatorOf(room, this.stateValue(namespace, room, 'coordinator'))}
                        value={(from, state) => this.stateValue(namespace, from, state)}
                        command={(state, val) => void this.setState(stateId(namespace, room, state), val)}
                        word={this.word}
                    />
                </div>
            ));
        } finally {
            this.#sourceRoom = null;
            if (this.isConnected) {
                this.resubscribe();
            }
        }
    }
}
