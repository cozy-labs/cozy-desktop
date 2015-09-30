fs = require 'fs-extra'
touch = require 'touch'
date = require 'date-utils'
moment = require 'moment'
async = require 'async'
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


describe "Deleting a file locally from DB document's information", ->
    @timeout 8000

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    it 'returns an error when the document is invalid', (done) ->
        operationQueue.deleteFileLocally { invalid: 'document' }, (err) ->
            should.exist err
            done()

    it 'returns an error when the DB document has no previous revision available', (done) ->
        doc =
            docType: 'File'
            path: ''
            name: 'chat-mignon.jpg'
        operationQueue.deleteFileLocally doc, (err) ->
            should.exist err
            done()

    describe 'when the file exists locally', ->
        fixturesPath = path.resolve(__dirname, path.join '..', 'fixtures')
        fixturePath  = path.join fixturesPath, 'chat-mignon.jpg'
        filePath  = path.join syncPath, 'chat-mignon.jpg'

        before (done) ->
            fs.copySync fixturePath, filePath
            doc =
                docType: 'File'
                path: ''
                name: 'chat-mignon.jpg'

            # Create and modify the DB document with a changed path
            async.waterfall [
                (next) ->
                    pouch.db.post { path: filePath }, next
                (res, next) ->
                    doc.binary =
                        file:
                            id: res.id
                            rev: res.rev
                    pouch.db.post doc, next
                (res, next) ->
                    operationQueue.deleteFileLocally doc, next
            ], (err, res) ->
                should.not.exist err
                done()

        it 'removes the file', ->
            fs.existsSync(filePath).should.not.be.ok()


    describe 'when the file has already been deleted', ->
        filePath  = path.join syncPath, 'chat-mignon-mod.jpg'

        before (done) ->
            doc =
                docType: 'File'
                path: ''
                name: 'chat-mignon-mod.jpg'

            # Create and modify the DB document with a changed path
            async.waterfall [
                (next) ->
                    pouch.db.post { path: filePath }, next
                (res, next) ->
                    doc.binary =
                        file:
                            id: res.id
                            rev: res.rev
                    pouch.db.post doc, next
                (res, next) ->
                    operationQueue.deleteFileLocally doc, next
            ], (err, res) ->
                should.not.exist err
                done()

        it 'does not raise any error', ->
            fs.existsSync(filePath).should.not.be.ok()
