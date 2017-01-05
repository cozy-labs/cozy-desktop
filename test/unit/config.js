import path from 'path';
import should from 'should';

import configHelpers from '../helpers/config';

import Config from '../../src/config';


describe('Config', function() {

    before('instanciate config', configHelpers.createConfig);
    after('clean config directory', configHelpers.cleanConfig);

    describe('saveConfig', () =>
        it('saves last changes made on the config', function() {
            this.config.devices['new-cozy2'] = {
                deviceName: 'new-cozy2',
                password: 'password',
                url: 'none'
            };
            this.config.save();
            let conf = new Config(path.join(this.syncPath, '.cozy-desktop'));
            return should.exist(conf.devices['new-cozy2']);}));

    describe('getDefaultDeviceName', function() {
        it('returns devicename from args', function() {
            process.argv = ['arg1', '-d', 'test'];
            let name = this.config.getDefaultDeviceName();
            return name.should.equal('test');
        });
        it('returns default devicename when no args', function() {
            process.argv = [];
            let name = this.config.getDefaultDeviceName();
            return name.should.equal('tester');
        });
    });

    describe('getDevice', () =>
        it('returns config that matches given device name', function() {
            let device = this.config.getDevice('tester');
            should.exist(device.deviceName);
            return device.deviceName.should.equal('tester');
        })
    );

    describe('updateSync', () =>
        it('updates config from a javascript object', function() {
            this.config.updateSync({
                deviceName: 'tester',
                url: 'somewhere'
            });
            let device = this.config.getDevice();
            return this.config.devices['tester'].url.should.equal('somewhere');
        })
    );

    describe('addRemoteCozy', () =>
        it('adds a new entry to the config file', function() {
            this.config.addRemoteCozy({
                deviceName: 'new-cozy',
                url: 'http://something.com',
                path: '/myfolder'
            });
            let device = this.config.getDevice('new-cozy');
            should.exist(device.deviceName);
            return device.deviceName.should.equal('new-cozy');
        })
    );

    describe('removeRemoteCozy', () =>
        it('removes an entry to the config file', function() {
            this.config.removeRemoteCozy('tester');
            return should.not.exist(this.config.devices['tester']);}));

    describe('getUrl', () =>
        it('gives remote Cozy url', function() {
            return this.config.getUrl().should.equal('nonecozy');
        })
    );

    describe('setMode', function() {
        it('sets the pull or push mode', function() {
            this.config.setMode('push');
            let device = this.config.getDevice();
            return device.mode.should.equal('push');
        });

        it('throws an error for incompatible mode', function() {
            this.config.setMode('push');
            should.throws((() => this.config.setMode('pull')), /Incompatible mode/);
            return should.throws((() => this.config.setMode('full')), /Incompatible mode/);
        });
    });

    describe('setInsecure', () =>
        it('sets the insecure flag', function() {
            this.config.setInsecure(true);
            let device = this.config.getDevice();
            return device.insecure.should.be.true();
        })
    );

    describe('augmentCouchOptions', function() {
        it('enables invalid certificates when insecure', function() {
            this.config.setInsecure(true);
            let options = this.config.augmentCouchOptions({});
            should.exist(options.ajax);
            options.ajax.rejectUnauthorized.should.be.false();
            options.ajax.requestCert.should.be.true();
            return options.ajax.agent.should.be.false();
        });
        it('enables invalid certificates when insecure', function() {
            this.config.setInsecure(false);
            let options = this.config.augmentCouchOptions({});
            return should.not.exist(options.ajax);
        });
    });
});
