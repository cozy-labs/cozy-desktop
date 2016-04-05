should = require 'should'

Cozy    = require '../helpers/integration'
Devices = require '../../src/devices'


describe "Devices", ->
    @slow 1000
    @timeout 10000

    before Cozy.ensurePreConditions

    describe 'pingCozy', ->
        it 'says OK when the URL belongs to a cozy', (done) ->
            Devices.pingCozy Cozy.url, (err) ->
                should.not.exist err
                done()

        it 'says KO else', (done) ->
            Devices.pingCozy 'http://localhost:12345', (err) ->
                should.exist err
                done()

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

    describe 'registerDeviceSafe', ->
        it 'gives an error when the password is invalid', (done) ->
            options =
                url: Cozy.url
                password: 'xxxxxxxx'
                deviceName: Cozy.deviceName
            Devices.registerDeviceSafe options, (err, credentials) ->
                err.should.equal 'Bad credentials'
                done()

        it 'register a device', (done) ->
            options =
                url: Cozy.url
                password: Cozy.password
                deviceName: Cozy.deviceName
            Devices.registerDeviceSafe options, (err, credentials) ->
                should.not.exist err
                should.exist credentials
                should.exist credentials.password
                should.exist credentials.deviceName
                credentials.deviceName.should.equal Cozy.deviceName
                devicePassword = credentials.password
                done()

        it 'register a device with a suffix when it already exists', (done) ->
            options =
                url: Cozy.url
                password: Cozy.password
                deviceName: Cozy.deviceName
            Devices.registerDeviceSafe options, (err, credentials) ->
                should.not.exist err
                should.exist credentials
                should.exist credentials.password
                should.exist credentials.deviceName
                credentials.deviceName.should.not.equal Cozy.deviceName
                credentials.deviceName.should.match /-2$/
                done()

        it 'register a device with a suffix when it already exists', (done) ->
            options =
                url: Cozy.url
                password: Cozy.password
                deviceName: Cozy.deviceName
            Devices.registerDeviceSafe options, (err, credentials) ->
                should.not.exist err
                should.exist credentials
                should.exist credentials.password
                should.exist credentials.deviceName
                credentials.deviceName.should.not.equal Cozy.deviceName
                credentials.deviceName.should.match /-3$/
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

        it 'unregister a device (bis)', (done) ->
            options =
                url: Cozy.url
                password: Cozy.password
                deviceName: "#{Cozy.deviceName}-2"
            Devices.unregisterDevice options, (err) ->
                should.not.exist err
                done()

        it 'unregister a device (ter)', (done) ->
            options =
                url: Cozy.url
                password: Cozy.password
                deviceName: "#{Cozy.deviceName}-3"
            Devices.unregisterDevice options, (err) ->
                should.not.exist err
                done()

    describe 'getDiskSpace', ->
        it 'gets informations about disk space', (done) ->
            options =
                url: Cozy.url
                password: Cozy.password
            Devices.getDiskSpace options, (err, body) ->
                should.not.exist err
                should.exist body
                should.exist body.diskSpace
                should.exist body.diskSpace.totalDiskSpace
                should.exist body.diskSpace.freeDiskSpace
                should.exist body.diskSpace.usedDiskSpace
                done()
