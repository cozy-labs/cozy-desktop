fs = require 'fs-extra'
touch = require 'touch'
date = require 'date-utils'
mkdirp = require 'mkdirp'
moment = require 'moment'
log = require('printit')
    prefix: "Tests"

path = require 'path'
should = require 'should'
helpers = require '../helpers/helpers'
cliHelpers = require '../helpers/cli'
fileHelpers = require '../helpers/files'
folderHelpers = require '../helpers/folders'
client = helpers.getClient()

config = require '../../backend/config'
pouch = require '../../backend/db'
filesystem = require '../../backend/filesystem'
operationQueue = require '../../backend/operation_queue'
{syncPath} = helpers.options


describe "Operation Queue Tests", ->
    @timeout 4000

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    describe "createFileLocally", ->

        it 'Should return an error if the file doesnt exist', (done) ->
            doc =
                path: "dossier-1"
                name: "chat-mignon.jpg"
                binary:
                    file:
                        checksum: "123"
                        id: "123"

            operationQueue.createFileLocally doc, (err) ->
                should.exist err
                done()

        describe 'Similar file exists locally', ->
            fileRelativePath = '../fixtures/chat-mignon.jpg'
            fixturePath = path.resolve __dirname, fileRelativePath
            folderPath = path.join syncPath, 'dossier-1'
            filePath = path.join syncPath, 'dossier-1', 'chat-mignon.jpg'
            creationDate = moment().days(-6)
            lastModification = moment().days(-4)

            before (done) ->
                fs.copySync fixturePath, path.join(syncPath, 'chat-mignon.jpg')
                filesystem.checksum fixturePath, (err, sum) =>
                    @sum = sum
                    should.not.exist err

                    doc =
                        path: "dossier-1"
                        name: "chat-mignon.jpg"
                        creationDate: creationDate
                        lastModification: lastModification
                        binary:
                            file:
                                checksum: sum
                                id: "123"

                    binaryDoc =
                        _id: '123'
                        docType: 'Binary'
                        checksum: sum
                        path: 'chat-mignon.jpg'

                    pouch.db.put binaryDoc, (err) ->
                        operationQueue.createFileLocally doc, (err) ->
                            should.not.exist err
                            done()

            it 'creates parent Folder', ->
                fs.existsSync(folderPath).should.be.ok

            it 'copy the local file', (done) ->
                fs.existsSync(filePath).should.be.ok
                filesystem.checksum fixturePath, (err, baseSum) =>
                    filesystem.checksum filePath, (err, sum) ->
                        sum.should.equal baseSum
                        done()

            it 'update last modification date', ->
                stat = fs.statSync filePath
                mtime = moment stat.mtime
                expected = lastModification.millisecond(0)
                mtime.format().should.equal lastModification.format()

        describe 'File exists remotely', ->
            fileName = 'cool-pillow.jpg'
            folderName = 'dossier-2'
            fileRelativePath = path.join '..', 'fixtures', fileName
            fixturePath = path.resolve __dirname, fileRelativePath
            folderPath = path.join syncPath, folderName
            filePath = path.join syncPath, folderName, fileName
            lastModification = null

            before (done) ->
                binaryDoc =
                    _id: '124'
                    docType: 'Binary'
                    path: 'dossier-2/cool-pillow.jpg'

                folderHelpers.createFolder folderName, ->
                    fileHelpers.uploadFile fileName, fixturePath, folderName, (err, doc) ->
                        binaryDoc =
                            _id: doc.binary.file.id
                            docType: 'Binary'
                            path: 'dossier-2/cool-pillow.jpg'
                        lastModification = moment doc.lastModification
                        pouch.db.put binaryDoc, (err) ->

                            operationQueue.createFileLocally doc, (err) ->
                                should.not.exist err
                                done()

            it 'creates parent Folder', ->
                fs.existsSync(folderPath).should.be.ok

            it 'copy the local file', (done) ->
                fs.existsSync(filePath).should.be.ok
                filesystem.checksum fixturePath, (err, baseSum) =>
                    filesystem.checksum filePath, (err, sum) ->
                        sum.should.equal baseSum
                        done()

            it 'update last modification date', ->
                stat = fs.statSync filePath
                mtime = moment stat.mtime
                expected = lastModification.millisecond(0)
                mtime.format().should.equal lastModification.format()

