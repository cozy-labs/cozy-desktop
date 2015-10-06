del    = require 'del'
fs     = require 'fs'
should = require 'should'

Config = require '../../backend/config'


describe 'Config', ->

    before ->
        @basePath = process.env['DEFAULT_DIR'] or 'tmp'
        @config = new Config @basePath
        @config.devices['tester'] =
            deviceName: 'tester'
            password: 'password'
            url: 'nonecozy'
    after ->
        del.sync @config.configPath

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

    describe 'setRemoteSeq', ->
        it 'saves seq field on default deviceName', ->
            @config.setRemoteSeq 3
            device = @config.getDevice()
            should.exist device.remoteSeq
            device.remoteSeq.should.equal 3

    describe 'getRemoteSeq', ->
        it 'gets seq field on default deviceName', ->
            @config.setRemoteSeq 3
            @config.getRemoteSeq().should.equal 3

    describe 'setLocalSeq', ->
        it 'saves seq field on default deviceName', ->
            @config.setLocalSeq 4
            device = @config.getDevice()
            should.exist device.localSeq
            device.localSeq.should.equal 4

    describe 'getLocalSeq', ->
        it 'gets seq field on default deviceName', ->
            @config.setLocalSeq 4
            @config.getLocalSeq().should.equal 4

    describe 'getUrl', ->
        it 'gives remote Cozy url', ->
            @config.getUrl().should.equal 'nonecozy'

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
