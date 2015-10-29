fs       = require 'fs-extra'
path     = require 'path'
sinon    = require 'sinon'
should   = require 'should'
Readable = require('stream').Readable

Local = require '../../../backend/local'


configHelpers = require '../../helpers/config'
pouchHelpers  = require '../../helpers/pouch'


describe 'Local', ->

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    before 'instanciate local', ->
        @merge = {}
        @local = new Local @config, @merge, @pouch
        @basePath = @config.getDevice().path
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig


    describe 'constructor', ->
        it 'has a base path', ->
            @local.basePath.should.equal @basePath

        it 'has a tmp path', ->
            tmpPath = path.join @basePath, ".cozy-desktop"
            @local.tmpPath.should.equal tmpPath


    describe 'start', ->
        it 'TODO'


    describe 'createReadStream', ->
        it 'TODO'


    describe 'utimesUpdater', ->
        it 'updates mtime for a file', (done) ->
            date = new Date '2015-10-09T05:06:07Z'
            filePath = path.join @basePath, "utimes-file"
            fs.ensureFileSync filePath
            updater = @local.utimesUpdater
                _id: 'utimes-file'
                lastModification: date
            updater (err) ->
                should.not.exist err
                mtime = +fs.statSync(filePath).mtime
                mtime.should.equal +date
                done()

        it 'updates mtime for a directory', (done) ->
            date = new Date '2015-10-09T05:06:07Z'
            folderPath = path.join @basePath, "utimes-folder"
            fs.ensureDirSync folderPath
            updater = @local.utimesUpdater
                _id: 'utimes-folder'
                lastModification: date
            updater (err) ->
                should.not.exist err
                mtime = +fs.statSync(folderPath).mtime
                mtime.should.equal +date
                done()


    describe 'fileExistsLocally', ->
        it "checks file existence as a binary in the db and on disk", (done) ->
            filePath = path.resolve @basePath, 'folder', 'testfile'
            @local.fileExistsLocally 'deadcafe', (err, exist) =>
                should.not.exist err
                exist.should.not.be.ok()
                fs.ensureFileSync filePath
                doc =
                    _id: 'folder/testfile'
                    docType: 'file'
                    checksum: 'deadcafe'
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @local.fileExistsLocally 'deadcafe', (err, exist) ->
                        should.not.exist err
                        exist.should.be.equal filePath
                        done()


    describe 'addFile', ->
        it 'creates the file by downloading it', (done) ->
            doc =
                _id: 'files/file-from-remote'
                lastModification: new Date '2015-10-09T04:05:06Z'
                checksum: '9876'
            @local.other =
                createReadStream: (docToStream, callback) ->
                    docToStream.should.equal doc
                    stream = new Readable
                    stream._read = ->
                    setTimeout ->
                        stream.push 'foobar'
                        stream.push null
                    , 100
                    callback null, stream
            filePath = path.join @basePath, doc._id
            @local.addFile doc, (err) =>
                @local.other = null
                should.not.exist err
                fs.statSync(filePath).isFile().should.be.true()
                content = fs.readFileSync(filePath, encoding: 'utf-8')
                content.should.equal 'foobar'
                mtime = +fs.statSync(filePath).mtime
                mtime.should.equal +doc.lastModification
                done()

        it 'creates the file from another file with same checksum', (done) ->
            doc =
                _id: 'files/file-with-same-checksum'
                lastModification: new Date '2015-10-09T04:05:07Z'
                checksum: '456'
            alt = path.join @basePath, 'files', 'my-checkum-is-456'
            fs.writeFileSync alt, 'foo bar baz'
            stub = sinon.stub(@local, "fileExistsLocally").yields null, alt
            filePath = path.join @basePath, doc._id
            @local.addFile doc, (err) ->
                stub.restore()
                stub.calledWith('456').should.be.true()
                should.not.exist err
                fs.statSync(filePath).isFile().should.be.true()
                content = fs.readFileSync(filePath, encoding: 'utf-8')
                content.should.equal 'foo bar baz'
                mtime = +fs.statSync(filePath).mtime
                mtime.should.equal +doc.lastModification
                done()

        it 'preserves the existing file if the download fails'

        it 'can create a file in the root', (done) ->
            doc =
                _id: 'file-in-root'
                lastModification: new Date '2015-10-09T04:05:19Z'
                checksum: '987642'
            @local.other =
                createReadStream: (docToStream, callback) ->
                    docToStream.should.equal doc
                    stream = new Readable
                    stream._read = ->
                    setTimeout ->
                        stream.push 'foobaz'
                        stream.push null
                    , 100
                    callback null, stream
            filePath = path.join @basePath, doc._id
            @local.addFile doc, (err) =>
                @local.other = null
                should.not.exist err
                fs.statSync(filePath).isFile().should.be.true()
                content = fs.readFileSync(filePath, encoding: 'utf-8')
                content.should.equal 'foobaz'
                mtime = +fs.statSync(filePath).mtime
                mtime.should.equal +doc.lastModification
                done()


    describe 'addFolder', ->
        it 'creates the folder', (done) ->
            doc =
                _id: 'parent/folder-to-create'
                lastModification: new Date '2015-10-09T05:06:08Z'
            folderPath = path.join @basePath, doc._id
            @local.addFolder doc, (err) ->
                should.not.exist err
                fs.statSync(folderPath).isDirectory().should.be.true()
                mtime = +fs.statSync(folderPath).mtime
                mtime.should.equal +doc.lastModification
                done()

        it 'updates mtime if the folder already exists', (done) ->
            doc =
                _id: 'parent/folder-to-create'
                lastModification: new Date '2015-10-09T05:06:08Z'
            folderPath = path.join @basePath, doc._id
            fs.ensureDirSync folderPath
            @local.addFolder doc, (err) ->
                should.not.exist err
                fs.statSync(folderPath).isDirectory().should.be.true()
                mtime = +fs.statSync(folderPath).mtime
                mtime.should.equal +doc.lastModification
                done()


    describe 'updateFile', ->
        it 'calls addFile for an overwrite', (done) ->
            doc =
                _id: 'a-file-to-overwrite'
                docType: 'file'
                checksum: 'abfcfb0dfcfdb36deb1187b456e575472661f97a'
                lastModification: new Date
                overwrite: true
            sinon.stub(@local, 'addFile').yields()
            @local.updateFile doc, (err) =>
                should.not.exist err
                @local.addFile.calledWith(doc).should.be.true()
                @local.addFile.restore()
                done()

        it 'updates metadata'


    describe 'updateFolder', ->
        it 'calls addFolder', (done) ->
            doc =
                _id: 'a-folder-to-update'
                docType: 'folder'
                lastModification: new Date
            sinon.stub(@local, 'addFolder').yields()
            @local.updateFolder doc, (err) =>
                should.not.exist err
                @local.addFolder.calledWith(doc).should.be.true()
                @local.addFolder.restore()
                done()


    describe 'moveFile', ->
        it 'moves the file', (done) ->
            old =
                _id: 'old-parent/file-to-move'
                lastModification: new Date '2016-10-08T05:05:09Z'
            doc =
                _id: 'new-parent/file-moved'
                lastModification: new Date '2015-10-09T05:05:10Z'
            oldPath = path.join @basePath, old._id
            newPath = path.join @basePath, doc._id
            fs.ensureDirSync path.dirname oldPath
            fs.writeFileSync oldPath, 'foobar'
            @local.moveFile doc, old, (err) ->
                should.not.exist err
                fs.existsSync(oldPath).should.be.false()
                fs.statSync(newPath).isFile().should.be.true()
                mtime = +fs.statSync(newPath).mtime
                mtime.should.equal +doc.lastModification
                enc = encoding: 'utf-8'
                fs.readFileSync(newPath, enc).should.equal 'foobar'
                done()

        it 'creates the file is the current file is missing', (done) ->
            old =
                _id: 'old-parent/missing-file'
                lastModification: new Date '2016-10-08T05:05:11Z'
            doc =
                _id: 'new-parent/recreated-file'
                lastModification: new Date '2015-10-09T05:05:12Z'
            stub = sinon.stub(@local, "addFile").yields()
            @local.moveFile doc, old, (err) ->
                stub.restore()
                stub.calledWith(doc).should.be.true()
                should.not.exist err
                done()

        it 'does nothing if the file has already been moved', (done) ->
            old =
                _id: 'old-parent/already-moved'
                lastModification: new Date '2016-10-08T05:05:11Z'
            doc =
                _id: 'new-parent/already-here'
                lastModification: new Date '2015-10-09T05:05:12Z'
            newPath = path.join @basePath, doc._id
            fs.ensureDirSync path.dirname newPath
            fs.writeFileSync newPath, 'foobar'
            stub = sinon.stub(@local, "addFile").yields()
            @local.moveFile doc, old, (err) ->
                stub.restore()
                stub.calledWith(doc).should.be.false()
                should.not.exist err
                enc = encoding: 'utf-8'
                fs.readFileSync(newPath, enc).should.equal 'foobar'
                done()


    describe 'moveFolder', ->
        it 'moves the folder', (done) ->
            old =
                _id: 'old-parent/folder-to-move'
                docType: 'folder'
                lastModification: new Date '2016-10-08T05:06:09Z'
            doc =
                _id: 'new-parent/folder-moved'
                docType: 'folder'
                lastModification: new Date '2015-10-09T05:06:10Z'
            oldPath = path.join @basePath, old._id
            folderPath = path.join @basePath, doc._id
            fs.ensureDirSync oldPath
            @local.moveFolder doc, old, (err) ->
                should.not.exist err
                fs.existsSync(oldPath).should.be.false()
                fs.statSync(folderPath).isDirectory().should.be.true()
                mtime = +fs.statSync(folderPath).mtime
                mtime.should.equal +doc.lastModification
                done()

        it 'creates the folder is the current directory is missing', (done) ->
            old =
                _id: 'old-parent/missing-folder'
                docType: 'folder'
                lastModification: new Date '2016-10-08T05:06:09Z'
            doc =
                _id: 'new-parent/recreated-folder'
                docType: 'folder'
                lastModification: new Date '2015-10-09T05:06:10Z'
            folderPath = path.join @basePath, doc._id
            @local.moveFolder doc, old, (err) ->
                should.not.exist err
                fs.statSync(folderPath).isDirectory().should.be.true()
                mtime = +fs.statSync(folderPath).mtime
                mtime.should.equal +doc.lastModification
                done()

        it 'does nothing if the folder has already been moved', (done) ->
            old =
                _id: 'old-parent/folder-already-moved'
                lastModification: new Date '2016-10-08T05:05:11Z'
            doc =
                _id: 'new-parent/folder-already-here'
                lastModification: new Date '2015-10-09T05:05:12Z'
            newPath = path.join @basePath, doc._id
            fs.ensureDirSync newPath
            stub = sinon.stub(@local, "addFolder").yields()
            @local.moveFolder doc, old, (err) ->
                should.not.exist err
                stub.restore()
                stub.calledWith(doc).should.be.false()
                fs.statSync(newPath).isDirectory().should.be.true()
                done()

        it 'remove the old directory if everything has been moved', (done) ->
            old =
                _id: 'old-parent/folder-already-moved'
                lastModification: new Date '2016-10-08T05:05:11Z'
            doc =
                _id: 'new-parent/folder-already-here'
                lastModification: new Date '2015-10-09T05:05:12Z'
            oldPath = path.join @basePath, old._id
            newPath = path.join @basePath, doc._id
            fs.ensureDirSync oldPath
            fs.ensureDirSync newPath
            stub = sinon.stub(@local, "addFolder").yields()
            @local.moveFolder doc, old, (err) ->
                should.not.exist err
                stub.restore()
                stub.calledWith(doc).should.be.false()
                fs.existsSync(oldPath).should.be.false()
                fs.statSync(newPath).isDirectory().should.be.true()
                done()


    describe 'deleteFile', ->
        it 'deletes a file from the local filesystem', (done) ->
            doc =
                _id: 'file-to-delete'
                docType: 'file'
            filePath = path.join @basePath, "file-to-delete"
            fs.ensureFileSync filePath
            @pouch.db.put doc, (err, inserted) =>
                should.not.exist err
                doc._rev = inserted.rev
                @pouch.db.remove doc, (err) =>
                    should.not.exist err
                    @local.deleteFile doc, (err) ->
                        should.not.exist err
                        fs.existsSync(filePath).should.be.false()
                        done()


    describe 'deleteFolder', ->
        it 'deletes a folder from the local filesystem', (done) ->
            doc =
                _id: 'folder-to-delete'
                docType: 'folder'
            folderPath = path.join @basePath, "folder-to-delete"
            fs.ensureDirSync folderPath
            fs.ensureFileSync path.join(folderPath, "file-inside-folder")
            @pouch.db.put doc, (err, inserted) =>
                should.not.exist err
                doc._rev = inserted.rev
                @pouch.db.remove doc, (err) =>
                    should.not.exist err
                    @local.deleteFolder doc, (err) ->
                        should.not.exist err
                        fs.existsSync(folderPath).should.be.false()
                        done()
