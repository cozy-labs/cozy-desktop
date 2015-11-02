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


describe "Creating a DB document from a local file's information", ->
    @timeout 8000

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    fixturesPath = path.resolve(__dirname, path.join '..', 'fixtures')
    fixturePath  = path.join fixturesPath, 'chat-mignon.jpg'
    fixturePath2 = path.join fixturesPath, 'chat-mignon-mod.jpg'
    fixturePath3 = path.join fixturesPath, 'cool-pillow.jpg'

    it 'returns an error when the file is not located in the synchronized directory', (done) ->
        tmpPath = path.join('tmp', 'chat-mignon.jpg')
        fs.mkdirsSync 'tmp'
        fs.copySync fixturePath, tmpPath
        operationQueue.createFileRemotely tmpPath, (err) ->
            should.exist err
            done()


    describe 'when the DB document does not exist yet', ->
        filePath  = path.join syncPath, 'chat-mignon.jpg'
        creationDate     = moment().days(-6).millisecond(0)
        lastModification = moment().days(-4).millisecond(0)
        doc = {}

        before (done) ->
            fs.copySync fixturePath, filePath
            fs.utimesSync filePath, new Date(creationDate), new Date(lastModification)

            operationQueue.createFileRemotely filePath, (err) ->
                should.not.exist err
                pouch.files.get '/chat-mignon.jpg', (err, res) ->
                    should.not.exist err
                    doc = res
                    done()


        it 'creates a DB document', ->
            should.exist doc.name

        it "saves the right file's information", ->
            doc.docType.toLowerCase().should.be.equal 'file'
            doc.class.should.be.equal 'image'
            doc.name.should.be.equal 'chat-mignon.jpg'
            doc.path.should.be.equal ''
            doc.mime.should.be.equal 'image/jpeg'
            doc.size.should.be.equal fs.statSync(filePath).size
            should.exist doc.binary?.file?.id


        it "saves the right file's modification date", ->
            lastModification.format().should.be.equal moment(doc.lastModification).format()

