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


    describe "createFileLocally", ->
        fixturePath  = path.join  __dirname, 'fixtures', 'chat-mignon.jpg'
        fileName = path.join syncPath, 'localfile-05'

        it "downloads a binary from a remote document", (done) ->
            # Create remote document
            fileHelpers.uploadFile 'localfile-05', fixturePath, '', (err, doc) ->
                should.not.exist err
                fileDoc = doc
                operationQueue.createFileLocally doc, (err, res) ->
                    should.not.exist err

                    # Check that file exists
                    fs.existsSync(fileName).should.be.ok

                    # Check size and modification date
                    stats = fs.statSync fileName
                    originalStats = fs.statSync fixturePath
                    stats.size.should.be.equal originalStats.size
                    #stats.mtime.should.be.equal originalStats.mtime

                    done()

    describe "createFolderLocally", ->
        folderName = path.join syncPath, 'localfolder-02'

        it "creates a folder from a remote document", (done) ->
            # Create remote document
            folderHelpers.createFolder 'localfolder-02', '', (err, doc) ->
                should.not.exist err
                folderDoc = doc
                operationQueue.createFolderLocally doc, (err, res) ->
                    should.not.exist err
                    fs.existsSync(folderName).should.be.ok
                    done()


    describe "moveFileLocally", ->
        fileName = path.join syncPath, 'localfile-05'
        newFileName = path.join syncPath, 'localfile-06'

        it "moves a file when its document path changed", (done) ->

            # Create a binary document
            binaryDoc =
                path: fileName
                _id: 'my-binary-1'
            pouch.db.put binaryDoc, (err, res) ->

                # Create and update a file document
                doc =
                    _id: 'my-file-1'
                    path: ''
                    name: 'localfile-05'
                    docType: 'File'
                    class: 'image'
                    tags: []
                    binary:
                        file:
                            id: 'my-binary-1',
                            rev: res.rev

                pouch.db.put doc, (err, res) ->
                    should.not.exist err
                    doc._rev = res.rev
                    doc.name = 'localfile-06'
                    pouch.db.put doc, (err, res) ->
                        should.not.exist err

                        # Execute tested operation
                        operationQueue.moveFileLocally doc, (err, res) ->
                            should.not.exist err
                            fs.existsSync(fileName).should.not.be.ok
                            fs.existsSync(newFileName).should.be.ok
                            done()


    describe "moveFolderLocally", ->
        folderName = path.join syncPath, 'localfolder-02'
        newFolderName = path.join syncPath, 'localfolder-03'

        it "moves a folder when its document path changed", (done) ->
            # Create and update a folder document
            doc =
                _id: 'my-folder-1'
                path: ''
                name: 'localfolder-02'
                docType: 'Folder'
                tags: []

            pouch.db.put doc, (err, res) ->
                should.not.exist err
                doc._rev = res.rev
                doc.name = 'localfolder-03'
                pouch.db.put doc, (err, res) ->
                    should.not.exist err

                    # Execute tested operation
                    operationQueue.moveFolderLocally doc, (err, res) ->
                        should.not.exist err
                        fs.existsSync(folderName).should.not.be.ok
                        fs.existsSync(newFolderName).should.be.ok
                        done()


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

