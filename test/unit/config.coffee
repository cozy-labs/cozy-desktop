should = require 'should'

configHelpers = require '../helpers/config'

Config = require '../../src/config'


describe 'Config', ->

    before 'instanciate config', configHelpers.createConfig
    after 'clean config directory', configHelpers.cleanConfig

    describe 'saveConfig', ->
        it 'saves last changes made on the config', ->
            @config.devices['new-cozy2'] =
                deviceName: 'new-cozy2'
                password: 'password'
                url: 'none'
            @config.save()
            conf = new Config @basePath
            should.exist conf.devices['new-cozy2']

    describe 'getDefaultDeviceName', ->
        it 'returns devicename from args', ->
            process.argv = ['arg1', '-d', 'test']
            name = @config.getDefaultDeviceName()
            name.should.equal 'test'
        it 'returns default devicename when no args', ->
            process.argv = []
            name = @config.getDefaultDeviceName()
            name.should.equal 'tester'

    describe 'getDevice', ->
        it 'returns config that matches given device name', ->
            device = @config.getDevice 'tester'
            should.exist device.deviceName
            device.deviceName.should.equal 'tester'

    describe 'updateSync', ->
        it 'updates config from a javascript object', ->
            @config.updateSync
                deviceName: 'tester'
                url: 'somewhere'
            device = @config.getDevice()
            @config.devices['tester'].url.should.equal 'somewhere'

    describe 'addRemoteCozy', ->
        it 'adds a new entry to the config file', ->
            @config.addRemoteCozy
                deviceName: 'new-cozy'
                url: 'http://something.com'
                path: '/myfolder'
            device = @config.getDevice 'new-cozy'
            should.exist device.deviceName
            device.deviceName.should.equal 'new-cozy'

    describe 'removeRemoteCozy', ->
        it 'removes an entry to the config file', ->
            @config.removeRemoteCozy 'tester'
            should.not.exist @config.devices['tester']

    describe 'getUrl', ->
        it 'gives remote Cozy url', ->
            @config.getUrl().should.equal 'nonecozy'

    describe 'setMode', ->
        it 'sets the pull or push mode', ->
            @config.setMode 'push'
            device = @config.getDevice()
            device.mode.should.equal 'push'

        it 'throws an error for incompatible mode', ->
            @config.setMode 'push'
            should.throws((=> @config.setMode 'pull'), /Incompatible mode/)
            should.throws((=> @config.setMode 'full'), /Incompatible mode/)

    describe 'setInsecure', ->
        it 'sets the insecure flag', ->
            @config.setInsecure true
            device = @config.getDevice()
            device.insecure.should.be.true()

    describe 'augmentCouchOptions', ->
        it 'enables invalid certificates when insecure', ->
            @config.setInsecure true
            options = @config.augmentCouchOptions {}
            should.exist options.ajax
            options.ajax.rejectUnauthorized.should.be.false()
            options.ajax.requestCert.should.be.true()
            options.ajax.agent.should.be.false()
        it 'enables invalid certificates when insecure', ->
            @config.setInsecure false
            options = @config.augmentCouchOptions {}
            should.not.exist options.ajax
