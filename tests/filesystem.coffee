fs = require 'fs-extra'
touch = require 'touch'
date = require 'date-utils'
mkdirp = require 'mkdirp'

path = require 'path'
should = require 'should'
helpers = require './helpers/helpers'
cliHelpers = require './helpers/cli'
fileHelpers = require './helpers/files'
folderHelpers = require './helpers/folders'
client = helpers.getClient()

config = require '../backend/config'
pouch = require '../backend/db'
filesystem = require '../backend/filesystem'
{syncPath} = helpers.options

describe "Filesystem Tests", ->
    @timeout 4000

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    describe "getPaths", ->
        it "returns a hash of useful paths related to a given filepath", ->
            filesystem.getPaths '/tmp/cozy/testfile', (paths) ->
                paths.absolute.should.be.equal '/tmp/cozy/testfile'
                paths.relative.should.be.equal 'testfile'
                paths.name.should.be.equal 'testfile'
                paths.parent.should.be.equal '/'
                paths.absParent.should.be.equal '/tmp/cozy'

    describe "getFileClass", ->
        it "returns proper class for given file", (done) ->
            filesystem.getFileClass 'image.png', (err, infos) ->
                infos.fileClass.should.equal 'image'
                filesystem.getFileClass 'doc.txt', (err, infos) ->
                    infos.fileClass.should.equal 'document'
                    done()

    describe "getSize", ->
        it "returns the size of given file", (done) ->
            filePath = './tests/fixtures/chat-mignon.jpg'
            filesystem.getSize filePath, (err, size) ->
                should.not.exist err
                size.should.equal fs.statSync(filePath).size
                done()

    describe "checksum", ->
        it "returns the checksum of givenfile", (done) ->
            filePath = './tests/fixtures/chat-mignon.jpg'
            filesystem.checksum filePath, (err, sum) ->
                should.not.exist err
                sum.should.equal "bf268fcb32d2fd7243780ad27af8ae242a6f0d30"
                done()

    describe "checkLocation", ->
        it "checks if given file is in sync dir", (done) ->
            filePath = '/tmp/cozy/testfile'
            filesystem.checkLocation filePath, (err, isThere) ->
                should.exist err
                mkdirp.sync '/tmp/cozy'
                touch filePath, {}, (err) ->
                    should.not.exist err
                    filesystem.checkLocation filePath, (err, isThere) ->
                        should.not.exist err
                        isThere.should.be.ok
                        filesystem.checkLocation '/tmp/test', (err, isThere) ->
                            should.exist err
                            done()

    describe "fileExistsLocally", ->
        it "checks file existence as a binary in the db and on disk", (done) ->
            filePath = '/tmp/cozy/testfile'
            filesystem.checksum filePath, (err, sum) ->
                should.not.exist err
                filesystem.fileExistsLocally sum, (err, exist) ->
                    should.not.exist err
                    exist.should.not.be.ok

                    doc =
                        _id: 'test_exist_locally'
                        docType: 'Binary'
                        checksum: sum
                        path: '/tmp/cozy/testfile'
                    pouch.db.put doc, (err, info) ->
                        filesystem.fileExistsLocally sum, (err, exist) ->
                            should.not.exist err
                            exist.should.be.equal filePath
                            done()

    describe "walkDirSync", ->
        before ->
            mkdirp.sync '/tmp/cozy/folder-1'
            mkdirp.sync '/tmp/cozy/folder-2'
            mkdirp.sync '/tmp/cozy/folder-1/subfolder-1'
            touch.sync '/tmp/cozy/folder-1/subfolder-1/file-1'
            touch.sync '/tmp/cozy/folder-2/file-2'

        it "returns the list of dir for a given directory", ->
            folderList = filesystem.walkDirSync '/tmp/cozy/'
            folderList[0].parent.should.equal ''
            folderList[0].filename.should.equal 'folder-1'
            folderList[0].filePath.should.equal '/tmp/cozy/folder-1'

            folderList[1].parent.should.equal '/folder-1'
            folderList[1].filename.should.equal 'subfolder-1'
            folderList[1].filePath.should.equal '/tmp/cozy/folder-1/subfolder-1'

            folderList[2].parent.should.equal ''
            folderList[2].filename.should.equal 'folder-2'
            folderList[2].filePath.should.equal '/tmp/cozy/folder-2'

    describe "walkFileSync", ->
        it "returns the list of file for a given directory", ->
            fileList = filesystem.walkFileSync '/tmp/cozy/'
            fileList[0].parent.should.equal '/folder-1/subfolder-1'
            fileList[0].filename.should.equal 'file-1'
            fileList[0].filePath.should.equal '/tmp/cozy/folder-1/subfolder-1/file-1'

            fileList[1].parent.should.equal '/folder-2'
            fileList[1].filename.should.equal 'file-2'
            fileList[1].filePath.should.equal '/tmp/cozy/folder-2/file-2'

            fileList[2].parent.should.equal ''
            fileList[2].filename.should.equal 'testfile'
            fileList[2].filePath.should.equal '/tmp/cozy/testfile'

    describe "download", ->

        fileDoc = null
        fixturePath = path.resolve __dirname, './fixtures/chat-mignon.jpg'
        fileName = 'chat-mignon.jpg'
        filePath = "#{syncPath}/#{fileName}"

        before (done) ->
            fileHelpers.uploadFile fileName, fixturePath, (err, doc) =>
                fileDoc = doc
                done()

        describe "downloadAttachment", ->
            it "download given attachment to current dir", (done) ->
                id = fileDoc.binary.file.id
                filesystem.downloadAttachment id, filePath, null, (err) ->
                    filesystem.checkLocation filePath, (err, isThere) ->
                        should.not.exist err
                        isThere.should.be.ok
                        done()

        describe "downloadBinary", ->
            it "download given binary to current dir", (done) ->
                fs.unlinkSync filePath
                id = fileDoc.binary.file.id
                filesystem.downloadBinary id, filePath, null, (err) ->
                    filesystem.checkLocation filePath, (err, isThere) ->
                        should.not.exist err
                        isThere.should.be.ok
                        done()

            it "and data should be updated", (done) ->
                id = fileDoc.binary.file.id
                pouch.db.get id, (err, doc) ->
                    filesystem.checksum fixturePath, (err, checksum) ->
                        checksum.should.be.equal doc.checksum
                        filePath.should.be.equal doc.path
                        done()

    describe "isBeingCopied", ->
        it('TODO')
