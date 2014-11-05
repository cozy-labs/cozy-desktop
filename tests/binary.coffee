fs = require 'fs'
touch = require 'touch'

should = require 'should'
date = require 'date-utils'

config      = require '../backend/config'
replication = require '../backend/replication'
binary      = require '../backend/binary'
pouch       = require '../backend/db'
request = require 'request-json-light'

helpers = require './helpers/helpers'
cliHelpers = require './helpers/cli'
fileHelpers = require './helpers/files'

params =
    url: 'http://localhost:9104/'


describe "Binary Tests", ->

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    describe 'checksum', ->
        it "calculates the SHA1 checksum of a binary", (done) ->
            remoteConfig = config.getConfig()
            binaryPath = "#{remoteConfig.path}/binary"

            fs.writeFile binaryPath, 'hello', (err) ->
                binary.checksum binaryPath, (err, checksum) ->
                    should.not.exist err
                    expectedSha1 = 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d'
                    checksum.should.be.equal expectedSha1
                    fs.unlink binaryPath, done

    describe 'move from doc', ->
        it "changes path for a given binary (in db and on the disk)", (done) ->
            remoteConfig = config.getConfig()
            binary1Path = "#{remoteConfig.path}/binary1"
            binary2Path = "#{remoteConfig.path}/binary2"
            doc = { _id: "test2", path: binary1Path }

            touch binary1Path, (err, res) ->
                pouch.db.put doc, (err, res) ->
                    doc._rev = res.rev
                    binary.moveFromDoc doc, binary2Path, (err) ->
                        should.not.exist err
                        fs.existsSync(binary2Path).should.be.true
                        fs.unlink binary2Path, ->
                            pouch.db.remove res._id, res.rev, ->
                                done()

    describe 'createEmptyRemoteDoc', =>
        it "creates an empty binary doc", (done) =>
            binary.createEmptyRemoteDoc (err, doc) =>
                should.not.exist err
                remoteConfig = config.getConfig()
                deviceName = config.getDeviceName()
                urlPath = "cozy/#{doc.id}"

                client = request.newClient remoteConfig.url
                client.setBasicAuth deviceName, remoteConfig.devicePassword

                client.get urlPath, (err, res, body) =>
                    should.not.exist err
                    should.exist body.docType
                    body.docType.should.be.equal 'Binary'
                    @doc = body

                    done()

    describe 'UploadAsAttachment', =>
        it "set an attachment to a empty binary doc", (done) =>
            remoteConfig = config.getConfig()
            path = "#{remoteConfig.path}/binary"
            fs.writeFile path, 'hello', (err) =>
                binary.uploadAsAttachment @doc._id, @doc._rev, path, (err) ->
                    should.not.exist err
                    done()

        it "and this file is properly attached", (done) =>
            remoteConfig = config.getConfig()
            deviceName = config.getDeviceName()
            urlPath = "cozy/#{@doc._id}"

            client = request.newClient remoteConfig.url
            client.setBasicAuth deviceName, remoteConfig.devicePassword

            client.get urlPath, (err, res, body) =>
                should.not.exist err
                should.exist body.docType
                body.docType.should.be.equal 'Binary'
                should.exist body._attachments
                should.exist body._attachments.file.length
                body._attachments.file.length.should.be.equal 5

                done()

    describe 'getRemoteDoc',  =>
        it "retrieves given doc remotely", (done) =>
            binary.getRemoteDoc @doc._id, (err, doc) =>
                should.not.exist err
                should.exist doc.docType
                doc.docType.should.be.equal 'Binary'
                should.exist doc._attachments
                should.exist doc._attachments.file.length
                done()

    describe 'docAlreadyExists', =>
        it "returns false when there is no doc with given checksum", (done) =>
            @checksum = 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d'
            doc1 =
                _id: "test-checksum-01"
                docType: "Binary"
                checksum: "blabla"
            doc2 =
                _id: "test-checksum-02"
                docType: "Binary"
                checksum: "blublu"

            pouch.addFilter 'binary', (err) =>
                should.not.exist err
                pouch.db.bulkDocs [doc1, doc2], (err) =>
                    should.not.exist err
                    binary.docAlreadyExists @checksum, (err, doc) ->
                        should.not.exist err
                        should.not.exist doc
                        done()

        it "returns true when there is doc with given checksum", (done) =>
            doc3 =
                _id: "test-checksum-03"
                docType: "Binary"
                checksum: @checksum

            pouch.db.put doc3, (err, res) =>
                binary.docAlreadyExists @checksum, (err, doc) =>
                    should.not.exist err
                    should.exist doc
                    doc.checksum.should.be.equal @checksum
                    done()

    describe 'saveLocation', =>
        it "saves path and checksum for a given doc", (done) =>
            remoteConfig = config.getConfig()
            path = "#{remoteConfig.path}/binary"
            binary.saveLocation path, @doc._id, @doc._rev, (err, document) =>
                should.not.exist err
                should.exist document
                binary.docAlreadyExists @checksum, (err, doc) =>
                    should.exist doc
                    doc.checksum.should.be.equal @checksum
                    doc.path.should.be.equal path
                    done()

    describe 'downloadFile', =>
        it 'saves remote file on disk', (done) =>
            remoteConfig = config.getConfig()
            options =
                deviceName: null
                doc:
                    binary:
                        file:
                            id: @doc._id
                    path: ''
                    name: 'binary-to-download'
                filePath: 'binary-to-download'
                binaryPath: "#{remoteConfig.path}/binary-to-download"

            binary.downloadFile options, (err) =>
                should.not.exist err
                binary.checksum options.binaryPath, (err, checksum) =>
                    should.not.exist err
                    checksum.should.equal @checksum
                    done()

    describe 'fetchFromDoc', ->
        before (done) =>
            conf = config.getConfig()
            @path = "#{conf.path}/binary-to-fetch"

            binary.createEmptyRemoteDoc (err, doc) =>
                should.not.exist err
                @urlPath = "cozy/#{doc.id}"
                fs.writeFile @path, 'hello', (err) =>
                    should.not.exist err
                    binary.uploadAsAttachment doc.id, doc.rev, @path, (err) =>
                        should.not.exist err
                        done()

        before (done) =>
            conf = config.getConfig()

            client = request.newClient conf.url
            client.setBasicAuth conf.deviceName, conf.devicePassword
            client.get @urlPath, (err, res, body) =>
                should.not.exist err
                @doc = body
                fs.unlink @path, done

        it 'downloads the file from remote and set path and utimes', (done) =>
            @creationDate = new Date
            fileDoc =
                binary:
                    file:
                        id: @doc._id
                path: ''
                name: 'binary-to-fetch'
                creationDate: @creationDate
                lastModification: @creationDate
            binary.fetchFromDoc null, fileDoc, (err) =>
                should.not.exist err
                fs.existsSync(@path).should.be.ok
                setTimeout done, 1000

        it 'and checksum and date are rightly set', (done) =>
            pouch.db.get @doc._id, (err, doc) =>
                @path.should.be.equal doc.path
                binary.checksum @path, (err, checksum) =>
                    doc.checksum.should.be.equal checksum
                    fs.stat @path, (err, stat) =>
                        @creationDate.setMilliseconds 0
                        (@creationDate.compareTo stat.mtime).should.be.equal 0
                        done()
