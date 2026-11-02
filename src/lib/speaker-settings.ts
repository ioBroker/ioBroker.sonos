/**
 * Settings of a single speaker that neither client library offers: the status LED (#253), the
 * button lock and the sleep timer (#66).
 *
 * The status LED and the button lock belong to the device, so they also work for a Boost or a
 * Bridge, which are no players. The sleep timer belongs to the group: only its coordinator
 * answers, every other speaker refuses with UPnP error 800.
 */
import { AV_TRANSPORT, DEVICE_PROPERTIES, SoapError, soapCall, soapValue } from './soap';
import { parseFormattedTime } from './time';

/**
 * Read an `On`/`Off` setting
 *
 * @param baseUrl `http://<ip>:1400` of the speaker
 * @param action e.g. `GetLEDState`
 * @param tag the element of the answer, e.g. `CurrentLEDState`
 * @returns null if the speaker does not have the setting
 */
async function getOnOff(baseUrl: string, action: string, tag: string): Promise<boolean | null> {
    try {
        return soapValue(await soapCall(baseUrl, DEVICE_PROPERTIES, action), tag) === 'On';
    } catch (e) {
        if (e instanceof SoapError) {
            return null;
        }
        throw e;
    }
}

/**
 * Whether the status LED is on
 *
 * @param baseUrl `http://<ip>:1400` of the speaker
 * @returns null if the speaker has no status LED
 */
export function getLed(baseUrl: string): Promise<boolean | null> {
    return getOnOff(baseUrl, 'GetLEDState', 'CurrentLEDState');
}

/**
 * Switch the status LED
 *
 * @param baseUrl `http://<ip>:1400` of the speaker
 * @param on true to switch it on
 */
export async function setLed(baseUrl: string, on: boolean): Promise<void> {
    await soapCall(
        baseUrl,
        DEVICE_PROPERTIES,
        'SetLEDState',
        `<DesiredLEDState>${on ? 'On' : 'Off'}</DesiredLEDState>`,
    );
}

/**
 * Whether the buttons of the speaker are locked
 *
 * @param baseUrl `http://<ip>:1400` of the speaker
 * @returns null if the speaker has no buttons to lock
 */
export function getButtonLock(baseUrl: string): Promise<boolean | null> {
    return getOnOff(baseUrl, 'GetButtonLockState', 'CurrentButtonLockState');
}

/**
 * Lock or unlock the buttons of the speaker
 *
 * @param baseUrl `http://<ip>:1400` of the speaker
 * @param locked true to lock them
 */
export async function setButtonLock(baseUrl: string, locked: boolean): Promise<void> {
    await soapCall(
        baseUrl,
        DEVICE_PROPERTIES,
        'SetButtonLockState',
        `<DesiredButtonLockState>${locked ? 'On' : 'Off'}</DesiredButtonLockState>`,
    );
}

/**
 * Seconds until the group stops playing
 *
 * @param baseUrl `http://<ip>:1400` of the coordinator of the group
 * @returns 0 while no sleep timer is set, null if the speaker refuses - it is no coordinator
 */
export async function getSleepTimer(baseUrl: string): Promise<number | null> {
    let xml: string;
    try {
        xml = await soapCall(baseUrl, AV_TRANSPORT, 'GetRemainingSleepTimerDuration', '<InstanceID>0</InstanceID>');
    } catch (e) {
        if (e instanceof SoapError) {
            return null;
        }
        throw e;
    }

    const remaining = soapValue(xml, 'RemainingSleepTimerDuration');
    return remaining ? (parseFormattedTime(remaining) ?? 0) : 0;
}

/**
 * Stop the group after the given time
 *
 * @param baseUrl `http://<ip>:1400` of the coordinator of the group
 * @param seconds time until the group stops, 0 cancels the sleep timer
 */
export async function setSleepTimer(baseUrl: string, seconds: number): Promise<void> {
    const duration =
        seconds > 0
            ? [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
                  .map(part => String(part).padStart(2, '0'))
                  .join(':')
            : '';

    await soapCall(
        baseUrl,
        AV_TRANSPORT,
        'ConfigureSleepTimer',
        `<InstanceID>0</InstanceID><NewSleepTimerDuration>${duration}</NewSleepTimerDuration>`,
    );
}
