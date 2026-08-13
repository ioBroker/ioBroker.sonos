/**
 * Configuration of the sonos adapter (see "native" in io-package.json)
 */
declare namespace ioBroker {
    interface SonosDeviceConfig {
        /** IP address of the sonos device */
        ip: string;
        /** Name of the device. If empty, the IP address will be used */
        name?: string;
        /** Room (enum.rooms.XXX), the device is assigned to */
        room?: string;
    }

    interface AdapterConfig {
        /** Interval in ms, how often the elapsed time will be updated while playing */
        elapsedInterval: number;
        /** Fade in time in ms. The values are read from the admin as string */
        fadeIn: number | string;
        /** Fade out time in ms. The values are read from the admin as string */
        fadeOut: number | string;
        /** Instance of the web adapter, that delivers the TTS files, e.g. "web.0" */
        webServer: string;
        /** Port of the sonos discovery web server */
        webserverPort?: number;
        /** Configured sonos devices */
        devices: SonosDeviceConfig[];
    }
}
