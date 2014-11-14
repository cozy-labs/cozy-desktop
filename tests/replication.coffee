uuid = require 'node-uuid'
path = require 'path'
should = require 'should'
helpers = require './helpers/helpers'
cliHelpers = require './helpers/cli'
fileHelpers = require './helpers/files'
client = helpers.getClient()

config      = require '../backend/config'
replication = require '../backend/replication'
binary      = require '../backend/binary'
pouch       = require '../backend/db'
filesystem  = require '../backend/filesystem'

describe "Replication Tests", ->

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    describe "getInfoSeq", ->
        it "returns the seq number if it is set", ->
            replication.getInfoSeq(last_seq: 42).should.be.equal 42
            replication.getInfoSeq(pull: last_seq: 42).should.be.equal 42

        it "returns 'now' else", ->
            replication.getInfoSeq({}).should.be.equal 'now'

        it "returns last seq number if nothing is passed", ->
            config.setSeq(42)
            replication.getInfoSeq().should.be.equal 42


    describe "getUrl", ->
        it "returns the cozy URL", ->
            remoteConfig = config.getConfig()
            url = "http://#{remoteConfig.deviceName}:#{remoteConfig.devicePassword}@localhost:9104/cozy"
            replication.getUrl().should.be.equal url


    describe "registerDevice", =>
        it "registers the device to the remote Cozy", (done) =>
            @deviceName = "tester#{uuid.v4().split('-').join('')}"
            options =
                url: helpers.options.url
                password: helpers.options.cozyPassword
                deviceName: @deviceName

            replication.registerDevice options, (err, res) =>
                should.not.exist err
                should.exist res.id
                @deviceId = res.id
                should.exist res.password
                done()


    describe "unregisterDevice", =>
        it "unregisters the device to the remote Cozy", (done) =>
            options =
                url: helpers.options.url
                password: helpers.options.cozyPassword
                deviceId: @deviceId

            replication.unregisterDevice options, (err, res, body) ->
                should.not.exist err
                should.exist res
                should.exist body
                done()


    # No way to test it
    #
    #describe "getReplicateFunction", ->
    #    it "returns replicate.from when appropriate", ->
    #        fn = replication.getReplicateFunction false, true
    #    it "returns replicate.to when appropriate", ->
    #        fn = replication.getReplicateFunction true, false
    #    it "returns sync when appropriate", ->
    #        fn = replication.getReplicateFunction true, true
