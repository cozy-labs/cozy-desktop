fs = require 'fs-extra'
touch = require 'touch'
date = require 'date-utils'
mkdirp = require 'mkdirp'
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

        describe 'Similar File exists locally', ->

            before (done) ->
                fileRelativePath = '../fixtures/chat-mignon.jpg'
                fixturePath = path.resolve __dirname, fileRelativePath
                fs.copySync fixturePath, path.join(syncPath, 'chat-mignon.jpg')
                filesystem.checksum fixturePath, (err, sum) ->
                    should.not.exist err

                    doc =
                        path: "dossier-1"
                        name: "chat-mignon.jpg"
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
                        pouch.binaries.get sum, (err, binaryDoc) ->
                            should.not.exist err

                            operationQueue.createFileLocally doc, (err) ->
                                should.not.exist err
                                done()

            it 'creates parent Folder', ->

            it 'copy the local file', ->
            it 'update creation and last modification dates', ->

        describe 'Similar File exists remotely', ->

            it 'creates parent Folder', ->
            it 'copy the local file', ->
            it 'update creation and last modification dates', ->
