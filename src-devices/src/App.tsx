// Live dev harness - opens a real socket.io connection to the ioBroker admin on localhost:8081,
// wires a minimal StateContext and renders both SONOS widgets against actual adapter data.
//
// NOT part of the production bundle: only `src/index.tsx` (the Vite dev server entry) loads it,
// while the federation build starts from `Components.tsx`.

import React, { useEffect, useState } from 'react';
import { Connection, I18n, type ThemeType } from '@iobroker/gui-components';
import type { IStateContext, ObjectChangeListener, StateChangeListener } from '@iobroker/dm-widgets';

import SonosPlayerComponent from './SonosPlayerComponent';
import SonosRoomsComponent from './SonosRoomsComponent';
import translations from './translations';
import { loadRooms, type SonosRoom } from './utils';

// In production the host loads the exposed `./translations` module and merges it into its own
// dictionary before it instantiates a widget. Nothing does that here, so the harness would show
// the raw keys - do it once at module level, before any widget renders.
I18n.extendTranslations(translations);
I18n.setLanguage((navigator.language.split('-')[0] || 'en') as ioBroker.Languages);

const IOB_HOST = 'localhost';
const IOB_PORT = 8081;
const DEFAULT_INSTANCE = 'sonos.0';

const overlayStyle: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#191c1d',
    color: '#d8dde0',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 18,
};

/**
 * Minimal `IStateContext` on top of a real socket connection. The fan-out per id is done here, so
 * the same state can have several subscribers (two widget instances, for example).
 */
class DevStateContext implements IStateContext {
    private handlers = new Map<string, Set<StateChangeListener>>();

    private readonly socket: Connection;

    defaultHistory: string | null = null;
    instanceId = '';
    admin = true;
    language: ioBroker.Languages = 'en';
    longitude: number | null = null;
    latitude: number | null = null;
    isFloatComma = true;
    dateFormat = 'DD.MM.YYYY';
    imagePrefix = '../../files/';
    themeType: ThemeType = 'dark';

    constructor(socket: Connection) {
        this.socket = socket;
    }

    setCoordinates(latitude: number | null, longitude: number | null): void {
        this.latitude = latitude;
        this.longitude = longitude;
    }

    getImagePath(fileName: string | null | undefined): string | null {
        if (!fileName) {
            return null;
        }
        if (/^(https?:)?\/\//.test(fileName) || fileName.startsWith('data:')) {
            return fileName;
        }
        return `${this.imagePrefix}${fileName.startsWith('/') ? fileName.slice(1) : fileName}`;
    }

    getState(id: string, handler: StateChangeListener): void {
        let set = this.handlers.get(id);
        if (!set) {
            set = new Set();
            this.handlers.set(id, set);
            void this.socket.subscribeState(id, (subscribedId, state) => {
                const listeners = this.handlers.get(subscribedId);
                if (!listeners || !state) {
                    return;
                }
                for (const listener of listeners) {
                    listener(subscribedId, state);
                }
            });
            void this.socket
                .getState(id)
                .then(state => state && handler(id, state))
                .catch(() => {
                    /* the state may not exist yet */
                });
        }
        set.add(handler);
    }

    removeState(id: string, handler: StateChangeListener): void {
        const set = this.handlers.get(id);
        if (!set) {
            return;
        }
        set.delete(handler);
        if (!set.size) {
            this.socket.unsubscribeState(id);
            this.handlers.delete(id);
        }
    }

    async getObject<T>(id: string): Promise<T | undefined> {
        try {
            return (await this.socket.getObject(id)) as unknown as T;
        } catch {
            return undefined;
        }
    }

    getObjectProperty(_id: string, _property: string, _cb: ObjectChangeListener): void {}

    // eslint-disable-next-line @typescript-eslint/require-await
    async removeObject(_id: string, _cb: ObjectChangeListener): Promise<void> {}

    getSocket(): Connection {
        return this.socket;
    }

    destroy(): void {
        for (const id of this.handlers.keys()) {
            this.socket.unsubscribeState(id);
        }
        this.handlers.clear();
    }
}

/**
 * The real `WidgetGeneric.render()` lives in the host and only picks the size-specific renderer,
 * so the dev copies call it directly. Otherwise the standalone widget renders nothing.
 */
class DevPlayer extends SonosPlayerComponent {
    override render(): React.JSX.Element {
        return this.renderWideTall();
    }
}

class DevPlayerCompact extends SonosPlayerComponent {
    override render(): React.JSX.Element {
        return this.renderCompact();
    }
}

class DevRooms extends SonosRoomsComponent {
    override render(): React.JSX.Element {
        return this.renderWideTall();
    }
}

type ConnectionState = 'connecting' | 'ready' | { error: string };

const widget = {
    id: 'dev-sonos',
    type: 'widget' as const,
    name: 'sonos',
    control: { states: [], type: 'unknown', storeId: '', parentId: '', deviceId: '', channelId: '' },
};

const baseSettings = {
    size: '2x2' as const,
    favorite: false,
    color: '',
    chartHours: 0,
    icon: '',
    iconActive: '',
    text: '',
    textActive: '',
};

export default function App(): React.JSX.Element {
    const [context, setContext] = useState<DevStateContext | null>(null);
    const [connection, setConnection] = useState<ConnectionState>('connecting');
    const [rooms, setRooms] = useState<SonosRoom[]>([]);
    const [room, setRoom] = useState('');

    useEffect(() => {
        let socket: Connection | null = null;
        try {
            socket = new Connection({
                host: IOB_HOST,
                port: IOB_PORT,
                protocol: 'http:',
                name: 'sonos-dev-harness',
                admin5only: true,
                onReady: () => {
                    setContext(new DevStateContext(socket!));
                    setConnection('ready');
                    loadRooms(socket!, DEFAULT_INSTANCE)
                        .then(list => {
                            setRooms(list);
                            if (list.length) {
                                setRoom(current => current || list[0].room);
                            }
                        })
                        .catch((error: unknown) => console.warn(`Cannot read the rooms: ${error as string}`));
                },
                onError: (error: Error) => setConnection({ error: String(error?.message || error) }),
            } as ConstructorParameters<typeof Connection>[0]);
        } catch (error) {
            setConnection({ error: String(error) });
        }

        return () => {
            try {
                socket?.destroy?.();
            } catch {
                // ignore
            }
        };
    }, []);

    if (connection === 'connecting') {
        return <div style={overlayStyle}>{`Connecting to http://${IOB_HOST}:${IOB_PORT} ...`}</div>;
    }
    if (typeof connection === 'object') {
        return <div style={{ ...overlayStyle, color: '#ff6b6b' }}>{`Connection error: ${connection.error}`}</div>;
    }
    if (!context) {
        return <div style={overlayStyle}>Initializing state context ...</div>;
    }

    const playerSettings = { ...baseSettings, name: '', instance: DEFAULT_INSTANCE, room };
    const roomsSettings = { ...baseSettings, name: '', instance: DEFAULT_INSTANCE };

    return (
        <div style={{ minHeight: '100vh', background: '#191c1d', color: '#d8dde0', fontFamily: 'system-ui' }}>
            <div
                style={{
                    padding: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    borderBottom: '1px solid #2a2f33',
                }}
            >
                <span>Speaker:</span>
                <select
                    value={room}
                    onChange={e => setRoom(e.target.value)}
                    style={{ padding: 6, background: '#0b0f14', color: '#d8dde0', border: '1px solid #3a3f43' }}
                >
                    {rooms.length ? null : <option value="">- no speakers -</option>}
                    {rooms.map(item => (
                        <option
                            key={item.room}
                            value={item.room}
                        >
                            {item.name}
                        </option>
                    ))}
                </select>
                <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 13 }}>
                    {`connected to ${IOB_HOST}:${IOB_PORT}`}
                </span>
            </div>
            <div style={{ display: 'flex', gap: 20, padding: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ width: 360, height: 240 }}>
                    <DevPlayer
                        key={`player-${room}`}
                        widget={widget as never}
                        stateContext={context}
                        settings={playerSettings as never}
                        onHide={() => {}}
                    />
                </div>
                <div style={{ width: 170 }}>
                    <DevPlayerCompact
                        key={`compact-${room}`}
                        widget={widget as never}
                        stateContext={context}
                        settings={{ ...playerSettings, size: '1x1' } as never}
                        onHide={() => {}}
                    />
                </div>
                <div style={{ width: 420, height: 300 }}>
                    <DevRooms
                        key="rooms"
                        widget={widget as never}
                        stateContext={context}
                        settings={roomsSettings as never}
                        onHide={() => {}}
                    />
                </div>
            </div>
        </div>
    );
}
