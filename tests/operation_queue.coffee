fs = require 'fs-extra'
touch = require 'touch'
date = require 'date-utils'
mkdirp = require 'mkdirp'

path = require 'path'
should = require 'should'
helpers = require './helpers/helpers'
cliHelpers = require './helpers/cli'
fileHelpers = require './helpers/files'
folderHelpers = require './helpers/folders'
client = helpers.getClient()

config = require '../backend/config'
pouch = require '../backend/db'
operationQueue = require '../backend/operation_queue'
{syncPath} = helpers.options

describe "Operation Queue Tests", ->
    @timeout 8000

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    before ->
        mkdirp.sync syncPath

    after ->
        fs.remove syncPath

    # Cross-test documents
    fileDoc = {}
    folderDoc = {}

    describe "waitNetwork", ->
        it "proceed with the task when the network is up", (done) ->
            filePath = path.join syncPath, 'localfile-04'
            task =
                operation: 'createFileRemotely'
                file: filePath

            touch.sync filePath
            operationQueue.queue.push task, (err) ->
                should.not.exist err
                done()
            operationQueue.waitNetwork task


    describe "deleteFileLocally", ->
        fileName = path.join syncPath, 'localfile-05'

        it "removes a binary from a remote document", (done) ->
            operationQueue.deleteFileLocally fileDoc, (err, res) ->
                should.not.exist err
                fs.existsSync(fileName).should.not.be.ok
                done()


    describe "deleteFolderLocally", ->
        folderName = path.join syncPath, 'localfolder-02'

        it "removes a folder from a remote document", (done) ->
            operationQueue.deleteFolderLocally folderDoc, (err, res) ->
                should.not.exist err
                fs.existsSync(folderName).should.not.be.ok
                done()


    describe "createFileRemotely", ->
        fixturePath  = path.join  __dirname, 'fixtures', 'chat-mignon.jpg'
        fileName = path.join syncPath, 'localfile-06.jpg'

        it "creates a file document from a binary", (done) ->
            fs.copySync fixturePath, fileName
            operationQueue.createFileRemotely fileName, (err) ->
                should.not.exist err
                pouch.files.get '/localfile-06.jpg', (err, doc) ->
                    should.not.exist err
                    doc.docType.toLowerCase().should.be.equal 'file'
                    doc.class.should.be.equal 'image'
                    doc.name.should.be.equal 'localfile-06.jpg'
                    doc.path.should.be.equal ''
                    doc.mime.should.be.equal 'image/jpeg'
                    doc.size.should.be.equal 29865
                    doc.binary?.file?.id?.should.exist
                    done()


    describe "createFolderRemotely", ->
        folderName = path.join syncPath, 'localfolder-04'

        it "creates a folder document from an actual directory", (done) ->
            fs.mkdirsSync folderName
            operationQueue.createFolderRemotely folderName, (err) ->
                should.not.exist err
                pouch.folders.get '/localfolder-04', (err, doc) ->
                    should.not.exist err
                    doc.docType.toLowerCase().should.be.equal 'folder'
                    doc.name.should.be.equal 'localfolder-04'
                    doc.path.should.be.equal ''
                    done()


    describe "updateFileRemotely", ->
        fixturePath  = path.join  __dirname, 'fixtures', 'chat-mignon-mod.jpg'
        fileName = path.join syncPath, 'localfile-06.jpg'

        it "updates a file document from a binary", (done) ->
            fs.copySync fixturePath, fileName
            operationQueue.updateFileRemotely fileName, (err) ->
                should.not.exist err
                pouch.files.get '/localfile-06.jpg', (err, doc) ->
                    should.not.exist err
                    doc.docType.toLowerCase().should.be.equal 'file'
                    doc.class.should.be.equal 'image'
                    doc.name.should.be.equal 'localfile-06.jpg'
                    doc.path.should.be.equal ''
                    doc.mime.should.be.equal 'image/jpeg'
                    doc.size.should.be.equal 36901
                    doc.binary?.file?.id?.should.exist
                    done()


    describe "deleteFileRemotely", ->
        fileName = path.join syncPath, 'localfile-06.jpg'

        it "deletes a file document from a previous binary location", (done) ->
            fs.removeSync fileName
            operationQueue.forceDeleteFileRemotely fileName, (err, res) ->
                should.not.exist err
                pouch.files.get '/localfile-06.jpg', (err, doc) ->
                    should.not.exist doc
                    done()


    describe "deleteFolderRemotely", ->
        folderName = path.join syncPath, 'localfolder-04'

        it "deletes a folder document from an old directory location", (done) ->
            fs.removeSync folderName
            operationQueue.deleteFolderRemotely folderName, (err, res) ->
                should.not.exist err
                pouch.folders.get '/localfolder-04', (err, doc) ->
                    should.not.exist doc
                    done()

