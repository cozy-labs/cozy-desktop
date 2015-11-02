fs = require 'fs-extra'
touch = require 'touch'
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


describe "Deleting a folder locally from DB document's information", ->
    @timeout 8000

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    it 'returns an error when the document is invalid', (done) ->
        operationQueue.deleteFolderLocally { invalid: 'document' }, (err) ->
            should.exist err
            done()

    it 'returns an error when the DB document has no previous revision available', (done) ->
        doc =
            docType: 'Folder'
            path: ''
            name: 'folder-1'
        operationQueue.deleteFolderLocally doc, (err) ->
            should.exist err
            done()

    describe 'when the folder exists locally', ->
        folderPath  = path.join syncPath, 'folder-1'

        before (done) ->
            fs.mkdirsSync folderPath
            doc =
                docType: 'Folder'
                path: ''
                name: 'folder-1'

            # Create and modify the DB document with a changed path
            async.waterfall [
                (next) ->
                    pouch.db.post doc, next
                (res, next) ->
                    doc._id = res.id
                    doc._rev = res.rev
                    pouch.db.remove doc, next
                (res, next) ->
                    operationQueue.deleteFolderLocally doc, next
            ], (err, res) ->
                should.not.exist err
                done()

        it 'removes the folder', ->
            fs.existsSync(folderPath).should.not.be.ok()


    describe 'when the folder has already been deleted', ->
        folderPath  = path.join syncPath, 'folder-2'

        before (done) ->
            doc =
                _id: 'my-folder-2'
                docType: 'Folder'
                path: ''
                name: 'folder-2'

            # Create and modify the DB document with a changed path
            async.waterfall [
                (next) ->
                    pouch.db.post doc, next
                (res, next) ->
                    operationQueue.deleteFolderLocally doc, next
            ], (err, res) ->
                should.not.exist err
                done()

        it 'does not raise any error', ->
            fs.existsSync(folderPath).should.not.be.ok()
