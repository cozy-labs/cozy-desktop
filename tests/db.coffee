async = require 'async'
request = require 'request-json-light'
should = require 'should'
date = require 'date-utils'

config      = require '../backend/config'
pouch       = require '../backend/db'

helpers = require './helpers/helpers'
cliHelpers = require './helpers/cli'
fileHelpers = require './helpers/files'

params =
    url: 'http://localhost:9104/'


describe "DB Tests", ->

    before cliHelpers.resetDatabase
    after cliHelpers.resetDatabase

    createBinary = (i, callback) ->
        pouch.db.put
            _id: "binary-#{i}"
            docType: 'Binary'
            binary:
                file:
                    id: "binary-#{i}"
        , callback

    createFile = (i, callback) ->
        pouch.db.put
            _id: "file-#{i}"
            docType: 'File'
            path: 'myfolder'
            name: "filename-#{i}"
        , callback

    createFolder = (i, callback) ->
        pouch.db.put
            _id: "folder-#{i}"
            docType: 'Folder'
            path: 'myfolder'
            name: "folder-#{i}"
        , callback

    before (done) ->
        async.eachSeries [1..3], createBinary, ->
            async.eachSeries [1..3], createFile, ->
                async.eachSeries [1..3], createFolder, done


    describe 'views', ->
        describe 'removeFilter', ->
            it 'removes given view', (done) ->
                id = "folder"
                pouch.folders.all (err, res) ->
                    should.not.exist err
                    pouch.removeFilter id, (err) ->
                        should.not.exist err
                        pouch.folders.all (err, res) ->
                            console.log res
                            should.exist err
                            done()


        describe 'createDesignDoc', ->
            it "creates a new design doc", (done) ->
                id = "_design/folder"
                queries =
                    all: """
                function (doc) {
                    if (doc.docType !== undefined
                        && doc.docType.toLowerCase() === "folder") {
                        emit(doc._id, doc);
                    }
                }
                """
                pouch.createDesignDoc id, queries, ->
                    pouch.folders.all (err, res) ->
                        should.not.exist err
                        res.rows.length.should.be.equal 3
                        done()


        describe 'addFilter', ->
            # Add filter is run at init, we suppose here it is already launched.
            it "creates all views", (done) ->
                pouch.folders.all (err, res) ->
                    should.not.exist err
                    pouch.files.all (err, res) ->
                        should.not.exist err
                        pouch.binaries.all (err, res) ->
                            should.not.exist err
                            done()


        describe 'removeIfExists', ->
            it 'removes element with given id', (done) ->
                pouch.db.get 'folder-3', (err) ->
                    should.not.exist err
                    pouch.removeIfExists 'folder-3', (err) ->
                        should.not.exist err
                        pouch.db.get 'folder-3', (err) ->
                            should.exist err
                            done()

            it 'doesnt return an error when the doc is not there', (done) ->
                pouch.removeIfExists 'folder-3', (err) ->
                    should.not.exist err
                    pouch.db.get 'folder-3', (err) ->
                        should.exist err
                        done()

    describe 'odm', ->
        describe 'newId', ->
            it "returns a complex alpha-numeric chain", ->
                pouch.odm.newId().length.should.equal 32

        describe 'getByKey', ->
            it 'returns document corresponding to key for given view'

        describe 'createNewDoc', ->

        describe 'files', ->
            describe 'all', ->
            describe 'get', ->
            describe 'createNew', ->

        describe 'folders', ->
            describe 'all', ->
            describe 'get', ->
            describe 'createNew', ->
            describe 'upsert', ->

        describe 'binaries', ->
            describe 'all', ->
            describe 'get', ->

    describe 'helpers', ->
        describe 'getPreviousRev', ->
        describe 'getKnownPath', ->
        describe 'markAsDeleted', ->
        describe 'storeLocalRev', ->

    describe 'remote', ->
        describe 'getLastRemoteChangeSeq', ->
        describe 'copyViewFromRemote', ->
        describe 'replicateToRemote', ->
        describe 'makeFileDoc', ->
        describe 'makeFileDocFrom', ->
        describe 'makeFolderDoc', ->
        describe 'getDocForFile', ->
        describe 'uploadBinary', ->
        describe 'getRemoteDoc', ->
        describe 'createEmptyRemoteDoc', ->
        describe 'uploadAsAttachment', ->
