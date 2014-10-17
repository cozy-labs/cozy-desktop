fs = require 'fs'
touch = require 'touch'

should = require('should')
helpers = require './helpers'
client = helpers.getClient()

config      = require '../backend/config'
replication = require '../backend/replication'
binary      = require '../backend/binary'
pouch       = require '../backend/db'
filesystem  = require '../backend/filesystem'

describe "Filesystem Tests", ->

    #before helpers.startVagrant
    #before helpers.cleanDB
    #after helpers.cleanDB

    params =
        url: 'http://localhost:9104/'

    it "When I make directory from DB document", (done) ->
        doc =
            path: "/hello/"
            name: "world"
            creationDate: "1ZU16:O1:00"
            lastModification: "1ZU16:O1:00"

        remoteConfig = config.getConfig()
        dirPath = path.join remoteConfig.path, doc.path, doc.name

        filesystem.makeDirectoryFromDoc doc, (err, res) ->
            err.shoud.be.equal null
            fs.existsSync(dirPath).should.be.true
            fs.stat dirPath (err, stats) ->
                stats.atime.should.be.equal(new Date(doc.creationDate))
                stats.mtime.should.be.equal(new Date(doc.lastModification))
                fs.rmDir dirPath, ->
                    done()


    it "When I touch file from DB document", (done) ->
        doc =
            _id: uuid.v4().split('-').join('')
            docType: 'File'
            class: 'document'
            name: "/hello/"
            path: "world"
            mime: "application/octet-stream"
            tags: []
            creationDate: "1ZU16:O1:00"
            lastModification: "1ZU16:O1:00"

        remoteConfig = config.getConfig()
        filePath = path.join remoteConfig.path, doc.path, doc.name

        pouch.db.put doc, (err, res) ->
            filesystem.touchFileFromDoc doc, (err, res) ->
                err.shoud.be.equal null
                fs.existsSync(filePath).should.be.true
                fs.stat filePath (err, stats) ->
                    stats.atime.should.be.equal(new Date(doc.creationDate))
                    stats.mtime.should.be.equal(new Date(doc.lastModification))
                    fs.unlink filePath, ->
                        done()


    it "When I (re)build filesystem tree from DB documents", (done) ->
