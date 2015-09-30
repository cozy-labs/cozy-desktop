fs = require 'fs-extra'
touch = require 'touch'
date = require 'date-utils'
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


describe "Creating a folder from a remote document", ->
    @timeout 4000

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    describe 'when the folder already exists locally', ->
        folderName = 'folder-1'
        folderPath = path.join syncPath, folderName
        lastModification = null

        before (done) ->
            fs.mkdirsSync folderPath
            folderHelpers.createFolder folderName, (err, doc) ->
                lastModification = moment doc.lastModification
                operationQueue.createFolderLocally doc, (err) ->
                    should.not.exist err
                    done()

        it 'updates the last modification date', ->
            stat = fs.statSync folderPath
            mtime = moment stat.mtime
            expected = lastModification.millisecond(0)
            mtime.format().should.equal lastModification.format()


    describe 'when folder does not exist locally', ->
        parentName = 'parent-1'
        folderName = 'folder-2'
        parentPath = path.join syncPath, parentName
        folderPath = path.join syncPath, parentName, folderName
        lastModification = null

        before (done) ->
            folderHelpers.createFolder parentName, (err, doc) ->
                folderHelpers.createFolder folderName, parentName, (err, doc) ->
                    lastModification = moment doc.lastModification
                    operationQueue.createFolderLocally doc, (err) ->
                        should.not.exist err
                        done()

        it 'creates the parent folder', ->
            fs.existsSync(parentPath).should.be.ok()

        it 'creates the local folder', ->
            fs.existsSync(folderPath).should.be.ok()

        it 'updates the last modification date', ->
            stat = fs.statSync folderPath
            mtime = moment stat.mtime
            expected = lastModification.millisecond(0)
            mtime.format().should.equal lastModification.format()

