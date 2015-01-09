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


describe "Moving a file locally from DB document's information", ->
    @timeout 8000

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    it 'returns an error when the document is invalid', (done) ->
        operationQueue.moveFileLocally { invalid: 'document' }, (err) ->
            should.exist err
            done()

    describe 'when a file exists at the moving location', ->
        fixturesPath = path.resolve(__dirname, path.join '..', 'fixtures')
        fixturePath  = path.join fixturesPath, 'chat-mignon.jpg'
        fixturePath2 = path.join fixturesPath, 'chat-mignon-mod.jpg'
        folderPath = path.join syncPath, 'folder-1'
        filePath  = path.join syncPath, 'chat-mignon.jpg'
        filePath2 = path.join folderPath, 'chat-mignon.jpg'
        creationDate = moment().days(-6)
        lastModification = moment().days(-4)

        before (done) ->
            fs.mkdirsSync folderPath
            fs.copySync fixturePath, filePath
            fs.copySync fixturePath2, filePath2
            doc =
                docType: 'File'
                path: ''
                name: 'chat-mignon.jpg'
                creationDate: creationDate
                lastModification: lastModification

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
                    doc.path = 'folder-1'
                    pouch.db.put doc, res.id, res.rev, next
                (res, next) ->
                    operationQueue.moveFileLocally doc, next
            ], (err, res) ->
                should.not.exist err
                done()

        it 'creates the parent folder', ->
            fs.existsSync(folderPath).should.be.ok

        it 'removes the old file', ->
            fs.existsSync(filePath).should.not.be.ok

        it 'renames the moved file to avoid conflicts', ->
            fs.existsSync("#{filePath2}.new").should.be.ok

        it 'updates the last modification date', ->
            stat = fs.statSync "#{filePath2}.new"
            mtime = moment stat.mtime
            expected = lastModification.millisecond(0)
            mtime.format().should.equal lastModification.format()


    describe 'when the file has not been moved yet', ->
        fixturesPath = path.resolve(__dirname, path.join '..', 'fixtures')
        fixturePath  = path.join fixturesPath, 'cool-pillow.jpg'
        folderPath = path.join syncPath, 'folder-2'
        filePath  = path.join syncPath, 'cool-pillow.jpg'
        filePath2 = path.join folderPath, 'cool-pillow.jpg'
        creationDate = moment().days(-6)
        lastModification = moment().days(-4)

        before (done) ->
            fs.mkdirsSync folderPath
            fs.copySync fixturePath, filePath
            doc =
                docType: 'File'
                path: ''
                name: 'cool-pillow.jpg'
                creationDate: creationDate
                lastModification: lastModification

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
                    doc.path = 'folder-2'
                    pouch.db.put doc, res.id, res.rev, next
                (res, next) ->
                    operationQueue.moveFileLocally doc, next
            ], (err, res) ->
                should.not.exist err
                done()

        it 'creates the parent folder', ->
            fs.existsSync(folderPath).should.be.ok

        it 'moves the file to the right place', ->
            fs.existsSync(filePath).should.not.be.ok
            fs.existsSync(filePath2).should.be.ok

        it 'updates the last modification date', ->
            stat = fs.statSync filePath2
            mtime = moment stat.mtime
            expected = lastModification.millisecond(0)
            mtime.format().should.equal lastModification.format()

