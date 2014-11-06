fs = require 'fs-extra'
touch = require 'touch'
date = require 'date-utils'

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

describe "Filesystem Tests", ->

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    describe "isInSyncDir", ->
        it "returns true when in synchronized directory", ->
            filesystem.isInSyncDir('/tmp/cozy/hello').should.be.true

        it "return false when not in synchronized directory", ->
            filesystem.isInSyncDir('/tmp/hello').should.be.false


    describe "deleteAll", ->
        it "deletes all the files and folders in a directory", (done) ->
            syncDir = '/tmp/cozy'
            touch "#{syncDir}/hello", ->
                fs.mkdir "#{syncDir}/directory", ->
                    filesystem.deleteAll syncDir, ->
                        fs.existsSync(syncDir).should.be.true
                        fs.existsSync("#{syncDir}/hello").should.be.false
                        fs.existsSync("#{syncDir}/directory").should.be.false
                        done()


    describe "getPaths", ->
        it "returns a hash of useful paths related to a given filepath", ->
            filesystem.getPaths '/tmp/cozy/testfile', (paths) ->
                paths.absolute.should.be.equal '/tmp/cozy/testfile'
                paths.relative.should.be.equal 'testfile'
                paths.name.should.be.equal 'testfile'
                paths.parent.should.be.equal '/'
                paths.absParent.should.be.equal '/tmp/cozy'


    describe "makeDirectoryFromDoc", ->
        it "creates a directory from DB document with the right modification time", (done) ->
            doc =
                value:
                    path: "/hello/"
                    name: "world"
                    creationDate: new Date
                    lastModification: new Date

            remoteConfig = config.getConfig()
            dirPath = path.join remoteConfig.path, doc.value.path, doc.value.name

            filesystem.makeDirectoryFromDoc doc, (err, res) ->
                should.not.exist err
                fs.existsSync(dirPath).should.be.true
                fs.stat dirPath, (err, stats) ->
                    creationDate = new Date(doc.value.creationDate)
                    creationDate.setMilliseconds 0
                    lastModification = new Date(doc.value.lastModification)
                    lastModification.setMilliseconds 0
                    (creationDate.compareTo stats.atime).should.be.equal 0
                    (lastModification.compareTo stats.mtime).should.be.equal 0
                    fs.rmdir dirPath, ->
                        done()


    describe "applyFolderDBChanges", ->
        syncDir = '/tmp/cozy'
        it "removes directory that has not been saved to the PouchDB \
            and keeps the other", (done) ->
            # root directories
            fs.mkdirSync "#{syncDir}/directory1"
            fs.mkdirSync "#{syncDir}/directory2"
            # directory1 content (should be removed)
            fs.mkdirSync "#{syncDir}/directory1/testdir"
            touch.sync "#{syncDir}/directory1/testfile"

            pouch.db.put
                _id: "test-dir2"
                path: ""
                name: "directory2"
                docType: "folder"
            , (err, res) ->
                should.not.exist err
                pouch.db.put
                    _id: "test-dir3"
                    path: "/directory2/"
                    name: "directory3"
                    docType: "folder"
                , (err, res) ->
                    should.not.exist err
                    filesystem.applyFolderDBChanges ->
                        fs.existsSync("#{syncDir}/directory1").should.be.false
                        fs.existsSync("#{syncDir}/directory2").should.be.true
                        fs.existsSync("#{syncDir}/directory2/directory3").should.be.true
                        done()


    describe "applyFileDBChanges", ->
        syncDir = '/tmp/cozy'
        filePath = "#{syncDir}/test_file_to_fetch"

        createFileRemotely = (callback) =>
            fs.writeFile filePath, 'hello', (err) ->
                should.not.exist err
                binary.createEmptyRemoteDoc (err, doc) =>
                    should.not.exist err
                    binary.uploadAsAttachment doc.id, doc.rev, filePath, (err, body) ->
                        @rev = body.rev
                        should.not.exist err
                        fs.remove filePath, callback

        createFileDocument = (callback) =>
            pouch.db.put
                _id: "test-file-to-fetch"
                path: ""
                name: "test_file_to_fetch"
                docType: "file"
                class: "document"
                mime: "application/octet-stream"
                tags: []
                checksum: "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d"
                size: 4
                creationDate: new Date
                lastModification: new Date
                binary:
                    file:
                        id: "test-binary-to-fetch"
                        rev: @rev
            , callback

        createFolderDocument = (callback) ->
            pouch.db.put
                _id: "test-dir-to-keep"
                path: ""
                name: "test_dir_to_keep"
                docType: "folder"
                tags: []
                creationDate: new Date
                lastModification: new Date
            , callback

        it "fetch binary if doc is present", (done) ->
            createFileRemotely (err) ->
                should.not.exist err
                createFileDocument (err, res) ->
                    should.not.exist err

                    filesystem.applyFileDBChanges false, (err, res) ->
                        should.not.exist err
                        fs.existsSync(filePath).should.be.true
                        done()

        it "deletes file document if we want to keep local changes", (done) ->
            fs.remove filePath, (err) ->
                should.not.exist err

                filesystem.applyFileDBChanges true, (err, res) ->
                    should.not.exist err
                    fs.existsSync(filePath).should.be.false
                    pouch.db.get 'test-file-to-fetch', (err, res) ->
                        should.exist err
                        err.status.should.be.equal 404
                        done()

        it "deletes folder document if we want to keep local changes", (done) ->
            createFolderDocument (err) ->
                should.not.exist err
                filesystem.applyFileDBChanges true, (err, res) ->
                    fs.existsSync("#{syncDir}/test_dir_to_keep").should.be.false
                    pouch.db.get 'test-dir-to-keep', (err, res) ->
                        should.exist err
                        err.status.should.be.equal 404
                        done()
