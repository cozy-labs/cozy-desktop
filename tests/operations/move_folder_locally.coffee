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


describe "Moving a folder locally from DB document's information", ->
    @timeout 8000

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    it 'returns an error when the document is invalid', (done) ->
        operationQueue.moveFolderLocally { invalid: 'document' }, (err) ->
            should.exist err
            done()

    describe 'when the folder already exists at the moving location', ->
        parentPath  = path.join syncPath, 'parent-1'
        folderPath  = path.join syncPath, 'folder-1'
        folderPath2 = path.join parentPath, 'folder-1'
        filePath = path.join folderPath, 'file-1'
        creationDate = moment().days(-6)
        lastModification = moment().days(-4)

        before (done) ->
            fs.mkdirsSync parentPath
            fs.mkdirsSync folderPath
            fs.mkdirsSync folderPath2
            touch.sync filePath
            doc =
                docType: 'Folder'
                path: ''
                name: 'folder-1'
                creationDate: creationDate
                lastModification: lastModification

            # Create and modify the DB document with a changed path
            async.waterfall [
                (next) ->
                    pouch.db.post doc, next
                (res, next) ->
                    doc.path = '/parent-1'
                    doc._id = res.id
                    doc._rev = res.rev
                    pouch.db.put doc, next
                (res, next) ->
                    operationQueue.moveFolderLocally doc, next
            ], (err, res) ->
                should.not.exist err
                done()

        it 'creates the parent folder', ->
            fs.existsSync(parentPath).should.be.ok

        it 'removes the old folder', ->
            fs.existsSync(folderPath).should.not.be.ok

        it 'ensures that the new folder exists', ->
            fs.existsSync(folderPath2).should.be.ok

        it 'does not ensure of the content of the new folder', ->
            fs.existsSync(path.join folderPath2, 'file-1').should.not.be.ok

        it 'updates the last modification date', ->
            stat = fs.statSync folderPath2
            mtime = moment stat.mtime
            expected = lastModification.millisecond(0)
            mtime.format().should.equal lastModification.format()


    describe 'when the folder has not been moved yet', ->
        parentPath  = path.join syncPath, 'parent-1'
        folderPath  = path.join syncPath, 'folder-2'
        folderPath2 = path.join parentPath, 'folder-2'
        filePath = path.join folderPath, 'file-2'
        creationDate = moment().days(-6)
        lastModification = moment().days(-4)

        before (done) ->
            fs.mkdirsSync parentPath
            fs.mkdirsSync folderPath
            touch.sync filePath
            doc =
                docType: 'Folder'
                path: ''
                name: 'folder-2'
                creationDate: creationDate
                lastModification: lastModification

            # Create and modify the DB document with a changed path
            async.waterfall [
                (next) ->
                    pouch.db.post doc, next
                (res, next) ->
                    doc.path = '/parent-1'
                    doc._id = res.id
                    doc._rev = res.rev
                    pouch.db.put doc, next
                (res, next) ->
                    operationQueue.moveFolderLocally doc, next
            ], (err, res) ->
                should.not.exist err
                done()

        it 'creates the parent folder', ->
            fs.existsSync(parentPath).should.be.ok

        it 'moves the folder properly', ->
            fs.existsSync(folderPath).should.not.be.ok
            fs.existsSync(folderPath2).should.be.ok

        it 'ensures that the content of the folder has been kept', ->
            fs.existsSync(path.join folderPath2, 'file-2').should.be.ok

        it 'updates the last modification date', ->
            stat = fs.statSync folderPath2
            mtime = moment stat.mtime
            expected = lastModification.millisecond(0)
            mtime.format().should.equal lastModification.format()

