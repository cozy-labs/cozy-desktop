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


describe "Creating a DB document from a local folder's information", ->
    @timeout 8000

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    it 'returns an error when the folder is not located in the synchronized directory', (done) ->
        tmpPath = 'test-folder-1'
        fs.mkdirsSync tmpPath
        operationQueue.createFolderRemotely tmpPath, (err) ->
            should.exist err
            done()


    describe 'when the DB document does not exist yet', ->
        folderPath = path.join syncPath, 'test-folder-2'
        creationDate     = moment().days(-6).millisecond(0)
        lastModification = moment().days(-4).millisecond(0)
        doc = {}

        before (done) ->
            fs.mkdirsSync folderPath
            fs.utimesSync folderPath, new Date(creationDate), new Date(lastModification)

            operationQueue.createFolderRemotely folderPath, (err) ->
                should.not.exist err
                pouch.folders.get '/test-folder-2', (err, res) ->
                    should.not.exist err
                    doc = res
                    done()


        it 'creates a DB document', ->
            should.exist doc.name

        it "saves the right folder's information", ->
            doc.docType.toLowerCase().should.be.equal 'folder'
            doc.path.should.be.equal ''


        it "saves the right folder's modification date", ->
            moment(doc.lastModification).format().should.be.equal lastModification.format()

