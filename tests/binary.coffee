fs = require 'fs'
touch = require 'touch'

should = require('should')
helpers = require './helpers'
client = helpers.getClient()

config      = require '../backend/config'
replication = require '../backend/replication'
binary      = require '../backend/binary'
pouch       = require '../backend/db'

describe "Binary Tests", ->

    #before helpers.startVagrant
    #before helpers.cleanDB
    #after helpers.cleanDB

    params =
        url: 'http://localhost:9104/'

    it "When I calculate the SHA1 checksum of a binary", (done) ->
        remoteConfig = config.getConfig()
        binaryPath = "#{remoteConfig.path}/binary"

        fs.writeFile binaryPath, 'Hello', (err) ->
            binary.checksum binaryPath, (err, res) ->
                err.shoud.be.equal null
                checksum.should.be.equal '9770e0f54128b5e501583979e126a71268d7b54e'
                fs.unlink binaryPath, ->
                    done()


    it "When I move a binary from a DB doc", (done) ->
        remoteConfig = config.getConfig()
        binary1Path = "#{remoteConfig.path}/binary1"
        binary2Path = "#{remoteConfig.path}/binary2"
        doc = { path: binary1Path }

        touch binary1Path, (err, res) ->
            pouch.db.post doc, (err, res) ->
                binary.moveFromDoc doc, binary2Path, (err) ->
                    err.shoud.be.equal null
                    fs.existsSync(binary2Path).should.be.true
                    fs.unlink binary2Path, ->
                        pouch.db.delete res.id, res.rev, ->
                            done()



    it "When I upload an attachment", (done) ->
