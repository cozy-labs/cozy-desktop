should = require 'should'

Devices = require '../../backend/devices'

describe "Devices", ->
    @timeout 8000

    describe 'checkCredentials', ->
        it 'says OK with good credentials', (done) ->
            options =
                url: 'http://localhost:9104'
                password: 'cozytest'
            Devices.checkCredentials options, (err) ->
                should.not.exist err
                done()

        it 'says KO with bad credentials', (done) ->
            options =
                url: 'http://localhost:9104'
                password: 'xxxxxxxx'
            Devices.checkCredentials options, (err) ->
                should.exist err
                done()

    describe 'registerDevice', ->
        it 'gives an error when the password is invalid', (done) ->
            options =
                url: 'http://localhost:9104'
                password: 'xxxxxxxx'
                deviceName: 'test-device'
            Devices.registerDevice options, (err, credentials) ->
                err.should.equal 'Bad credentials'
                done()

        it 'register a device', (done) ->
            options =
                url: 'http://localhost:9104'
                password: 'cozytest'
                deviceName: 'test-device'
            Devices.registerDevice options, (err, credentials) ->
                should.not.exist err
                should.exist credentials
                should.exist credentials.password
                devicePassword = credentials.password
                done()

    describe 'unregisterDevice', ->
        it 'gives an error when the password is invalid', (done) ->
            options =
                url: 'http://localhost:9104'
                password: 'xxxxxxxx'
                deviceName: 'test-device'
            Devices.unregisterDevice options, (err) ->
                err.should.equal 'Bad credentials'
                done()

        it 'unregister a device', (done) ->
            options =
                url: 'http://localhost:9104'
                password: 'cozytest'
                deviceName: 'test-device'
            Devices.unregisterDevice options, (err) ->
                should.not.exist err
                done()

    describe 'getDiskSpace', ->
        it 'gets informations about disk space', (done) ->
            options =
                password: 'xxxxxxxx'
                url: 'http://localhost:9104'
            Devices.getDiskSpace options, (err, body) ->
                should.not.exist err
                should.exist body
                should.exist body.diskSpace
                should.exist body.diskSpace.totalDiskSpace
                should.exist body.diskSpace.freeDiskSpace
                should.exist body.diskSpace.usedDiskSpace
                should.exist body.diskSpace.totalUnit
                should.exist body.diskSpace.freeUnit
                should.exist body.diskSpace.usedUnit
                done()
