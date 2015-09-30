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


describe "Updating a DB document from a local file's information", ->
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


    describe 'when the filename changes', ->
        filePath   = path.join syncPath, 'chat-mignon.jpg'
        filePath2  = path.join syncPath, 'chat-mignon2.jpg'
        creationDate     = moment().days(-6).millisecond(0)
        lastModification = moment().days(-4).millisecond(0)
        doc = {}

        before (done) ->
            fs.copySync fixturePath, filePath

            operationQueue.createFileRemotely filePath, (err) ->
                should.not.exist err
                fs.move filePath, filePath2, (err) ->
                    should.not.exist err
                    fs.utimesSync filePath2, new Date(creationDate), new Date(lastModification)
                    operationQueue.updateFileRemotely filePath2, (err) ->
                        pouch.files.get '/chat-mignon2.jpg', (err, res) ->
                            should.not.exist err
                            doc = res
                            done()


        it "updates DB document's information", ->
            doc.docType.toLowerCase().should.be.equal 'file'
            doc.class.should.be.equal 'image'
            doc.name.should.be.equal 'chat-mignon2.jpg'
            doc.path.should.be.equal ''
            doc.mime.should.be.equal 'image/jpeg'
            doc.size.should.be.equal fs.statSync(filePath2).size
            doc.binary?.file?.id?.should.exist()


        it "saves the right file's modification date", ->
            lastModification.format().should.be.equal moment(doc.lastModification).format()


    describe 'when the file is updated', ->
        filePath            = path.join syncPath, 'cool-pillow.jpg'
        creationDate        = moment().days(-6).millisecond(0)
        lastModification    = moment().days(-4).millisecond(0)
        newLastModification = moment().days(-3).millisecond(0)
        doc = {}

        before (done) ->
            fs.copySync fixturePath3, filePath

            fs.utimesSync filePath, new Date(creationDate), new Date(lastModification)
            operationQueue.createFileRemotely filePath, (err) ->
                should.not.exist err
                fs.copySync fixturePath2, filePath
                fs.utimesSync filePath, new Date(creationDate), new Date(newLastModification)
                operationQueue.updateFileRemotely filePath, (err) ->
                    pouch.files.get '/cool-pillow.jpg', (err, res) ->
                        should.not.exist err
                        doc = res
                        done()


        it "updates DB document's information", ->
            doc.docType.toLowerCase().should.be.equal 'file'
            doc.class.should.be.equal 'image'
            doc.name.should.be.equal 'cool-pillow.jpg'
            doc.path.should.be.equal ''
            doc.mime.should.be.equal 'image/jpeg'
            doc.size.should.be.equal fs.statSync(filePath).size
            doc.binary?.file?.id?.should.exist()


        it "saves the right file's modification date", ->
            moment(doc.lastModification).format().should.be.equal newLastModification.format()
