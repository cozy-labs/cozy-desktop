fs      = require 'fs'
touch   = require 'touch'
should  = require 'should'
date    = require 'date-utils'
request = require 'request-json-light'

config = require '../../backend/config'

helpers     = require '../helpers/helpers'
cliHelpers  = require '../helpers/cli'
fileHelpers = require '../helpers/files'


describe "Config Tests", ->

    before cliHelpers.initConfiguration
    before ->
        @conf = config.config.devices.tester
    after ->
        config.config.devices =
            tester: @conf
        config.saveConfig()

    describe 'getConfig', ->
        it 'returns config that matches given device name', ->
            conf = config.getConfig 'tester'
            should.exist conf.deviceName
            conf.deviceName.should.be.equal 'tester'

    describe 'getDeviceName', ->
        it 'returns devicename from args', ->
            process.argv = [ 'arg1', '-d', 'test']
            name = config.getDeviceName()
            name.should.be.equal 'test'
        it 'returns devicename from args', ->
            process.argv = []
            name = config.getDeviceName()
            name.should.be.equal 'tester'

    describe 'addRemoteCozy', ->
        it 'adds a new entry to the config file', ->
            config.addRemoteCozy
                deviceName: 'new-cozy'
                url: 'http://something.com'
                path: '/myfolder'

            conf = config.getConfig 'new-cozy'
            should.exist conf.deviceName
            conf.deviceName.should.be.equal 'new-cozy'

    describe 'removeRemoteCozy', ->
        it 'removes an entry to the config file', ->
            config.removeRemoteCozy 'new-cozy'
            # can't perform that test properly since failure exits the process.

    describe 'saveConfig', ->
        it "saves last changes made on the config", ->
            config.config.devices["new-cozy2"] =
                deviceName: 'new-cozy2'
                url: 'none'
            config.saveConfig()
            conf = config.getConfig()
            should.exist config.config.devices["new-cozy2"]

    describe 'updateSync', ->
        it "updates config from a javascript object", ->
            config.updateSync
                deviceName: 'new-cozy3'
                url: 'none'
            conf = config.getConfig()
            config.config.devices["new-cozy3"]

    describe 'setRemoteSeq', ->
        it 'saves seq field on default deviceName', ->
            config.setRemoteSeq 3
            conf = config.getConfig()
            should.exist conf.remoteSeq
            conf.remoteSeq.should.equal 3

    describe 'getRemoteSeq', ->
        it 'gets seq field on default deviceName', ->
            conf = config.getConfig()
            config.getRemoteSeq().should.equal 3

    describe 'setLocalSeq', ->
        it 'saves seq field on default deviceName', ->
            config.setLocalSeq 3
            conf = config.getConfig()
            should.exist conf.localSeq
            conf.localSeq.should.equal 3

    describe 'getLocalSeq', ->
        it 'gets seq field on default deviceName', ->
            conf = config.getConfig()
            config.getLocalSeq().should.equal 3

    describe 'getUrl', ->
        it 'should give remote Cozy url', ->
            config.getUrl().should.equal "nonecozy"
