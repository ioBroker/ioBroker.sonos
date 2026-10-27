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
    },
});
