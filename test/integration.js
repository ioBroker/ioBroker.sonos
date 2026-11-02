const http = require('node:http');
const path = require('node:path');
const { expect } = require('chai');
const { tests } = require('@iobroker/testing');

// Run integration tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Objects of a configured speaker (#238)', getHarness => {
            // 192.0.2.0/24 is reserved for documentation, so no speaker answers there
            const channelId = 'sonos.0.root.192_0_2_10';
            let harness;
            let stateNames;

            before(async function () {
                this.timeout(60000);
                harness = getHarness();
                stateNames = Object.keys(require('../build/lib/states').getChannelStates());

                await harness.changeAdapterConfig('sonos', {
                    native: { devices: [{ ip: '192.0.2.10', name: 'Test speaker' }] },
                });
                await harness.startAdapterAndWait();

                // the states are created one after another, wait for the last one
                const lastId = `${channelId}.${stateNames[stateNames.length - 1]}`;
                for (let i = 0; i < 40 && !(await harness.objects.getObjectAsync(lastId)); i++) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            });

            it('creates the channel of the speaker', async () => {
                const channel = await harness.objects.getObjectAsync(channelId);
                expect(channel).to.be.ok;
                expect(channel.type).to.equal('channel');
                expect(channel.common.name).to.equal('Test speaker');
                expect(channel.common.role).to.equal('media.music');
                expect(channel.native.ip).to.equal('192.0.2.10');
            });

            it('creates every state of the speaker', async () => {
                const missing = [];
                for (const name of stateNames) {
                    const obj = await harness.objects.getObjectAsync(`${channelId}.${name}`);
                    if (obj?.type !== 'state' || !obj.common.name || !obj.common.role) {
                        missing.push(name);
                    }
                }
                expect(missing).to.deep.equal([]);
            });

            it('sets the default value as acknowledged', async () => {
                const state = await harness.states.getStateAsync(`${channelId}.state_simple`);
                expect(state?.val).to.equal(false);
                expect(state?.ack).to.be.true;
            });

            it('does not use the deprecated methods', () => {
                expect(harness.hasLog(/Method "(createChannel|createState|deleteChannel)" is deprecated/)).to.be.false;
            });
        });

        suite('Alarms (#65, #325)', getHarness => {
            let harness;

            before(async function () {
                this.timeout(60000);
                harness = getHarness();
                await harness.startAdapterAndWait();
            });

            it('creates the objects to create an alarm', async () => {
                const folder = await harness.objects.getObjectAsync('sonos.0.alarms');
                const create = await harness.objects.getObjectAsync('sonos.0.alarms.create');

                expect(folder?.type).to.equal('folder');
                expect(create?.type).to.equal('state');
                expect(create.common.write).to.be.true;
            });

            it('refuses an alarm for an unknown room', async function () {
                this.timeout(30000);
                // the states are subscribed at the end of the start, which waits for the port check
                for (let i = 0; i < 25 && !harness.hasLog(/Cannot change the alarm create/); i++) {
                    await harness.states.setStateAsync('sonos.0.alarms.create', {
                        val: '{"room": "Garage", "time": "07:00"}',
                        ack: false,
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                expect(harness.hasLog('Cannot change the alarm create: Unknown room "Garage"', 'error')).to.be.true;
            });
        });

        suite('Battery of a portable speaker (#116, #211)', getHarness => {
            const channelId = 'sonos.0.root.127_0_0_1';
            let harness;
            let speaker;

            before(async function () {
                this.timeout(60000);
                // the status page of a Roam that is off its charger
                speaker = http.createServer((req, res) => {
                    if (req.url === '/status/batterystatus') {
                        res.end(
                            '<ZPSupportInfo><LocalBatteryStatus><Data name="Health">GREEN</Data><Data name="Level">87</Data>' +
                                '<Data name="Temperature">NORMAL</Data><Data name="PowerSource">BATTERY</Data></LocalBatteryStatus></ZPSupportInfo>',
                        );
                    } else {
                        res.writeHead(404);
                        res.end();
                    }
                });
                await new Promise((resolve, reject) =>
                    speaker.once('error', reject).listen(1400, '127.0.0.1', resolve),
                );

                harness = getHarness();
                await harness.changeAdapterConfig('sonos', {
                    native: { devices: [{ ip: '127.0.0.1', name: 'Roam' }] },
                });
                await harness.startAdapterAndWait();

                // the battery is read after the port check, which waits for the host
                for (let i = 0; i < 40 && !(await harness.states.getStateAsync(`${channelId}.battery_level`)); i++) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            });

            after(() => speaker?.close());

            it('creates the battery states and fills them', async () => {
                const level = await harness.objects.getObjectAsync(`${channelId}.battery_level`);
                expect(level?.common.role).to.equal('value.battery');
                expect(level.common.unit).to.equal('%');

                const levelState = await harness.states.getStateAsync(`${channelId}.battery_level`);
                expect(levelState?.val).to.equal(87);
                expect(levelState?.ack).to.be.true;

                const charging = await harness.states.getStateAsync(`${channelId}.battery_charging`);
                expect(charging?.val).to.equal(false);
                expect(charging?.ack).to.be.true;
            });
        });

        suite('Stop during the start', getHarness => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('does not start timers or the backend after the stop', async function () {
                this.timeout(30000);
                await harness.startAdapterAndWait();
                // the start is still running: the port check waits for the host, which the test environment does not have
                await harness.stopAdapter();

                expect(harness.hasLog(/called, but adapter is shutting down/)).to.be.false;
                expect(harness.hasLog('Listening for SONOS events')).to.be.false;
            });
        });
    },
});
