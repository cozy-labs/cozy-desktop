should = require('should')
helpers = require './helpers'
client = helpers.getClient()

config      = require '../backend/config'
replication = require '../backend/replication'

describe "Replication Tests", ->

    before helpers.startVagrant
    #before helpers.cleanDB
    after helpers.cleanDB

    it "When I register a new device", (done) ->
        @timeout 6000

        read prompt: 'Please enter a test device name:', silent: false , (err, deviceName) ->
            read prompt: 'Please enter cozy VM password:', silent: true , (err, password) ->
                helpers.options.deviceName = deviceName
                helpers.options.password = password
                replication.registerDevice
                    url: helpers.options.url
                    deviceName: helpers.options.deviceName
                    password: helpers.options.password
                , (err, credentials) ->
                    credentials.id.should.be.type 'string'
                    credentials.password.should.be.type 'string'
                    config.addRemoteCozy
                        url: helpers.options.url
                        deviceName: helpers.options.deviceName
                        path: path.resolve 'synctest'
                        deviceId: credentials.id
                        devicePassword: credentials.password
                    done()

    it "When I unregister an existing device", (done) ->
        remoteConfig = config.getConfig()
        replication.unregisterDevice
            url: helpers.options.url
            deviceId: remoteConfig.deviceId
            password: helpers.options.password
        , (err, res) ->
            res.status.should.be.equal 200
            config.removeRemoteCozy helpers.options.deviceName
            done()

    it "When I run replication from remote", (done) ->
        done()

    it "When I run replication to remote", (done) ->
        done()

    it "When I run replication from and to remote", (done) ->
        done()
