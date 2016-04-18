device = require('cozy-device-sdk').device
should = require 'should'

Cozy    = require '../helpers/integration'


describe "device", ->
    @slow 1000
    @timeout 10000

    before Cozy.ensurePreConditions

    describe 'pingCozy', ->
        it 'says OK when the URL belongs to a cozy', (done) ->
            device.pingCozy Cozy.url, (err) ->
                should.not.exist err
                done()

        it 'says KO else', (done) ->
            device.pingCozy 'http://localhost:12345', (err) ->
                should.exist err
                done()

    describe 'checkCredentials', ->
        it 'says OK with good credentials', (done) ->
            device.checkCredentials Cozy.url, Cozy.password, (err) ->
                should.not.exist err
                done()

        it 'says KO with bad credentials', (done) ->
            device.checkCredentials Cozy.url, 'xxxxxxxx', (err) ->
                should.exist err
                done()

    devicePasswords = []

    describe 'registerDeviceSafe', ->
        it 'gives an error when the password is invalid', (done) ->
            register = device.registerDeviceSafe
            register Cozy.url, Cozy.deviceName, 'xxxxxxxx', (err) ->
                err.should.equal 'Bad credentials'
                done()

        it 'register a device', (done) ->
            register = device.registerDeviceSafe
            register Cozy.url, Cozy.deviceName, Cozy.password, (err, res) ->
                should.not.exist err
                should.exist res
                should.exist res.password
                should.exist res.deviceName
                res.deviceName.should.equal Cozy.deviceName
                devicePasswords.push res.password
                done()

        it 'register a device with a suffix when it already exists', (done) ->
            register = device.registerDeviceSafe
            register Cozy.url, Cozy.deviceName, Cozy.password, (err, res) ->
                should.not.exist err
                should.exist res
                should.exist res.password
                should.exist res.deviceName
                res.deviceName.should.not.equal Cozy.deviceName
                res.deviceName.should.match /-2$/
                devicePasswords.push res.password
                done()

        it 'register a device with a suffix when it already exists', (done) ->
            register = device.registerDeviceSafe
            register Cozy.url, Cozy.deviceName, Cozy.password, (err, res) ->
                should.not.exist err
                should.exist res
                should.exist res.password
                should.exist res.deviceName
                res.deviceName.should.not.equal Cozy.deviceName
                res.deviceName.should.match /-3$/
                devicePasswords.push res.password
                done()

    describe 'unregisterDevice', ->
        it 'gives an error when the password is invalid', (done) ->
            unregister = device.unregisterDevice
            unregister Cozy.url, Cozy.deviceName, 'xxxxxxxx', (err) ->
                should.exist err
                if err.message is 'Bad credentials'
                    err.message.should.equal 'Bad credentials'
                else
                    err.message.should.equal 'Request unauthorized'
                done()

        it 'unregister a device', (done) ->
            unregister = device.unregisterDevice
            unregister Cozy.url, Cozy.deviceName, devicePasswords[0], (err) ->
                should.not.exist err
                done()

        it 'unregister a device (bis)', (done) ->
            deviceName = "#{Cozy.deviceName}-2"
            unregister = device.unregisterDevice
            unregister Cozy.url, deviceName, devicePasswords[1], (err) ->
                should.not.exist err
                done()

        it 'unregister a device (ter)', (done) ->
            deviceName = "#{Cozy.deviceName}-3"
            unregister = device.unregisterDevice
            unregister Cozy.url, deviceName, devicePasswords[2], (err) ->
                should.not.exist err
                done()

    describe 'getDiskSpace', ->
        it 'gets informations about disk space', (done) ->
            diskSpace = device.getDiskSpace
            diskSpace Cozy.url, 'owner', Cozy.password, (err, body) ->
                should.not.exist err
                should.exist body
                should.exist body.diskSpace
                should.exist body.diskSpace.totalDiskSpace
                should.exist body.diskSpace.freeDiskSpace
                should.exist body.diskSpace.usedDiskSpace
                done()
