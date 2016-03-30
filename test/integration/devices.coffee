should = require 'should'

Cozy    = require '../helpers/integration'
Devices = require '../../src/devices'


describe "Devices", ->
    @slow 1000
    @timeout 10000

    before Cozy.ensurePreConditions

    describe 'checkCredentials', ->
        it 'says OK with good credentials', (done) ->
            options =
                url: Cozy.url
                password: Cozy.password
            Devices.checkCredentials options, (err) ->
                should.not.exist err
                done()

        it 'says KO with bad credentials', (done) ->
            options =
                url: Cozy.url
                password: 'xxxxxxxx'
            Devices.checkCredentials options, (err) ->
                should.exist err
                done()

    devicePassword = ''

    describe 'registerDevice', ->
        it 'gives an error when the password is invalid', (done) ->
            options =
                url: Cozy.url
                password: 'xxxxxxxx'
                deviceName: Cozy.deviceName
            Devices.registerDevice options, (err, credentials) ->
                err.should.equal 'Bad credentials'
                done()

        it 'register a device', (done) ->
            options =
                url: Cozy.url
                password: Cozy.password
                deviceName: Cozy.deviceName
            Devices.registerDevice options, (err, credentials) ->
                should.not.exist err
                should.exist credentials
                should.exist credentials.password
                devicePassword = credentials.password
                done()

    describe 'getDiskSpace', ->
        it 'gets informations about disk space', (done) ->
            options =
                url: Cozy.url
                deviceName: Cozy.deviceName
                password: devicePassword
            Devices.getDiskSpace options, (err, body) ->
                should.not.exist err
                should.exist body
                should.exist body.diskSpace
                should.exist body.diskSpace.totalDiskSpace
                should.exist body.diskSpace.freeDiskSpace
                should.exist body.diskSpace.usedDiskSpace
                done()

    describe 'unregisterDevice', ->
        it 'gives an error when the password is invalid', (done) ->
            options =
                url: Cozy.url
                password: 'xxxxxxxx'
                deviceName: Cozy.deviceName
            Devices.unregisterDevice options, (err) ->
                should.exist err
                err.message.should.equal 'Bad credentials'
                done()

        it 'unregister a device', (done) ->
            options =
                url: Cozy.url
                password: Cozy.password
                deviceName: Cozy.deviceName
            Devices.unregisterDevice options, (err) ->
                should.not.exist err
                done()
