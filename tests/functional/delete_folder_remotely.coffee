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


describe "Deleting a DB document from a local folder's name", ->
    @timeout 8000

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    fixturesPath = path.resolve(__dirname, path.join '..', 'fixtures')
    fixturePath  = path.join fixturesPath, 'chat-mignon.jpg'

    it 'does nothing when the DB document does not exists', (done) ->
        operationQueue.deleteFolderRemotely 'wrong-path', (err) ->
            should.not.exist err
            done()


    it 'deletes the DB document when it actually exists', (done) ->
        folderPath  = path.join syncPath, 'test-folder-3'

        fs.mkdirsSync folderPath

        operationQueue.createFolderRemotely folderPath, (err) ->
            should.not.exist err
            operationQueue.deleteFolderRemotely folderPath, (err) ->
                 pouch.folders.get '/test-folder-3', (err, res) ->
                     should.not.exist err
                     should.not.exist res
                     done()

