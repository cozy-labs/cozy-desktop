fs       = require 'fs-extra'
path     = require 'path'
sinon    = require 'sinon'
should   = require 'should'
Readable = require('stream').Readable

Local = require '../../../backend/local'


configHelpers = require '../../helpers/config'


describe 'Local', ->

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate local', ->
        @pouch = {}
        @local = new Local @config, @pouch
        @basePath = @config.getDevice().path
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
            updater = @local.utimesUpdater lastModification: date, filePath
            updater (err) ->
                should.not.exist err
                mtime = +fs.statSync(filePath).mtime
                mtime.should.equal +date
                done()

        it 'updates mtime for a directory', (done) ->
            date = new Date '2015-10-09T05:06:07Z'
            folderPath = path.join @basePath, "utimes-folder"
            fs.ensureDirSync folderPath
            updater = @local.utimesUpdater lastModification: date, folderPath
            updater (err) ->
                should.not.exist err
                mtime = +fs.statSync(folderPath).mtime
                mtime.should.equal +date
                done()


    describe 'fileExistsLocally', ->
        it "checks file existence as a binary in the db and on disk", (done) ->
            filePath = path.resolve @basePath, 'testfile'
            @pouch.binaries = ->
                get: sinon.stub().yields(null, false)
            @local.fileExistsLocally 'deadcafe', (err, exist) =>
                should.not.exist err
                exist.should.not.be.ok()
                @pouch.binaries = ->
                    get: sinon.stub().yields(null, path: 'testfile')
                fs.ensureFileSync filePath
                @local.fileExistsLocally 'deadcafe', (err, exist) ->
                    should.not.exist err
                    exist.should.be.equal filePath
                    done()


    describe 'createFile', ->
        it 'creates the file by downloading it', (done) ->
            doc =
                path: 'files'
                name: 'file-from-remote'
                lastModification: new Date '2015-10-09T04:05:06Z'
                binary:
                    file:
                        id: '123'
                        checksum: ''
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
            filePath = path.join @basePath, doc.path, doc.name
            @local.createFile doc, (err) ->
                should.not.exist err
                fs.statSync(filePath).isFile().should.be.true()
                content = fs.readFileSync(filePath, encoding: 'utf-8')
                content.should.equal 'foobar'
                mtime = +fs.statSync(filePath).mtime
                mtime.should.equal +doc.lastModification
                done()

        it 'creates the file from another file with same checksum', (done) ->
            doc =
                path: 'files'
                name: 'file-with-same-checksum'
                lastModification: new Date '2015-10-09T04:05:07Z'
                binary:
                    file:
                        id: '123'
                        checksum: '456'
            alt = path.join @basePath, 'files', 'my-checkum-is-456'
            fs.writeFileSync alt, 'foo bar baz'
            stub = sinon.stub(@local, "fileExistsLocally").yields null, alt
            filePath = path.join @basePath, doc.path, doc.name
            @local.createFile doc, (err) ->
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


    describe 'createFolder', ->
        it 'creates the folder', (done) ->
            doc =
                path: 'parent'
                name: 'folder-to-create'
                lastModification: new Date '2015-10-09T05:06:08Z'
            folderPath = path.join @basePath, doc.path, doc.name
            @local.createFolder doc, (err) ->
                should.not.exist err
                fs.statSync(folderPath).isDirectory().should.be.true()
                mtime = +fs.statSync(folderPath).mtime
                mtime.should.equal +doc.lastModification
                done()

        it 'updates mtime if the folder already exists', (done) ->
            doc =
                path: 'parent'
                name: 'folder-to-create'
                lastModification: new Date '2015-10-09T05:06:08Z'
            folderPath = path.join @basePath, doc.path, doc.name
            fs.ensureDirSync folderPath
            @local.createFolder doc, (err) ->
                should.not.exist err
                fs.statSync(folderPath).isDirectory().should.be.true()
                mtime = +fs.statSync(folderPath).mtime
                mtime.should.equal +doc.lastModification
                done()


    describe 'moveFile', ->
        it 'moves the file', (done) ->
            old =
                path: 'old-parent'
                name: 'file-to-move'
                lastModification: new Date '2016-10-08T05:05:09Z'
            doc =
                path: 'new-parent'
                name: 'file-moved'
                lastModification: new Date '2015-10-09T05:05:10Z'
            oldPath = path.join @basePath, old.path, old.name
            newPath = path.join @basePath, doc.path, doc.name
            fs.ensureDirSync path.join @basePath, old.path
            fs.writeFileSync oldPath, 'foobar'
            @local.moveFile doc, old, (err) ->
                should.not.exist err
                fs.existsSync(oldPath).should.be.false()
                fs.statSync(newPath).isFile().should.be.true()
                mtime = +fs.statSync(newPath).mtime
                mtime.should.equal +doc.lastModification
                done()

        it 'creates the file is the current file is missing', (done) ->
            old =
                path: 'old-parent'
                name: 'missing-file'
                lastModification: new Date '2016-10-08T05:05:11Z'
            doc =
                path: 'new-parent'
                name: 'file-moved-2'
                lastModification: new Date '2015-10-09T05:05:12Z'
            filePath = path.join @basePath, doc.path, doc.name
            stub = sinon.stub(@local, "createFile").yields()
            @local.moveFile doc, old, (err) ->
                stub.restore()
                stub.calledWith(doc).should.be.true()
                should.not.exist err
                done()


    describe 'moveFolder', ->
        it 'moves the folder', (done) ->
            old =
                path: 'old-parent'
                name: 'folder-to-move'
                lastModification: new Date '2016-10-08T05:06:09Z'
            doc =
                path: 'new-parent'
                name: 'folder-moved'
                lastModification: new Date '2015-10-09T05:06:10Z'
            oldPath = path.join @basePath, old.path, old.name
            folderPath = path.join @basePath, doc.path, doc.name
            fs.ensureDirSync oldPath
            @pouch.getPreviousRev = sinon.stub().yields null, old
            @local.moveFolder doc, (err) ->
                should.not.exist err
                fs.existsSync(oldPath).should.be.false()
                fs.statSync(folderPath).isDirectory().should.be.true()
                mtime = +fs.statSync(folderPath).mtime
                mtime.should.equal +doc.lastModification
                done()

        it 'creates the folder is the previous path is unknown', (done) ->
            doc =
                path: 'new-parent'
                name: 'folder-moved-2'
                lastModification: new Date '2015-10-09T05:06:11Z'
            folderPath = path.join @basePath, doc.path, doc.name
            @pouch.getPreviousRev = sinon.stub().yields 'folder not found'
            @local.moveFolder doc, (err) ->
                should.not.exist err
                fs.statSync(folderPath).isDirectory().should.be.true()
                mtime = +fs.statSync(folderPath).mtime
                mtime.should.equal +doc.lastModification
                done()

        it 'creates the folder is the current directory is missing', (done) ->
            old =
                path: 'old-parent'
                name: 'missing-folder'
                lastModification: new Date '2016-10-08T05:06:09Z'
            doc =
                path: 'new-parent'
                name: 'folder-moved-3'
                lastModification: new Date '2015-10-09T05:06:10Z'
            folderPath = path.join @basePath, doc.path, doc.name
            @pouch.getPreviousRev = sinon.stub().yields null, old
            @local.moveFolder doc, (err) ->
                should.not.exist err
                fs.statSync(folderPath).isDirectory().should.be.true()
                mtime = +fs.statSync(folderPath).mtime
                mtime.should.equal +doc.lastModification
                done()


    describe 'deleteFile', ->
        it 'deletes a file from the local filesystem', (done) ->
            doc = id: 123
            filePath = path.join @basePath, "file-to-delete"
            fs.ensureFileSync filePath
            @pouch.getKnownPath = sinon.stub().yields null, "file-to-delete"
            @local.deleteFile doc, (err) =>
                @pouch.getKnownPath.calledWith(doc).should.be.true()
                should.not.exist err
                fs.existsSync(filePath).should.be.false()
                done()

        it "yields an error if the path can't be found", (done) ->
            doc = id: 123
            @pouch.getKnownPath = sinon.stub().yields "no such file"
            @local.deleteFile doc, (err) =>
                @pouch.getKnownPath.calledWith(doc).should.be.true()
                should.exist err
                err.should.equal "no such file"
                done()


    describe 'deleteFolder', ->
        it 'deletes a folder from the local filesystem', (done) ->
            doc = id: 123
            folderPath = path.join @basePath, "folder-to-delete"
            fs.ensureDirSync folderPath
            fs.ensureFileSync path.join(folderPath, "file-inside-folder")
            @pouch.getKnownPath = sinon.stub().yields null, "folder-to-delete"
            @local.deleteFolder doc, (err) =>
                @pouch.getKnownPath.calledWith(doc).should.be.true()
                should.not.exist err
                fs.existsSync(folderPath).should.be.false()
                done()

        it "yields an error if the path can't be found", (done) ->
            doc = id: 123
            @pouch.getKnownPath = sinon.stub().yields "no such folder"
            @local.deleteFolder doc, (err) =>
                @pouch.getKnownPath.calledWith(doc).should.be.true()
                should.exist err
                err.should.equal "no such folder"
                done()
