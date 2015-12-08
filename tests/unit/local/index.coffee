crypto   = require 'crypto'
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
        @prep = {}
        @local = new Local @config, @prep, @pouch
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig


    describe 'constructor', ->
        it 'has a base path', ->
            @local.basePath.should.equal @basePath

        it 'has a tmp path', ->
            tmpPath = path.join @basePath, ".cozy-desktop"
            @local.tmpPath.should.equal tmpPath


    describe 'createReadStream', ->
        it 'throws an error if no file for this document', (done) ->
            doc = path: 'no-such-file'
            @local.createReadStream doc, (err, stream) ->
                should.exist err
                err.message.should.equal 'Cannot read the file'
                done()

        it 'creates a readable stream for the document', (done) ->
            src = path.join __dirname, '../../fixtures/chat-mignon.jpg'
            dst = path.join @basePath, 'read-stream.jpg'
            fs.copySync src, dst
            doc =
                path: 'read-stream.jpg'
                checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
            @local.createReadStream doc, (err, stream) ->
                should.not.exist err
                should.exist stream
                checksum = crypto.createHash 'sha1'
                checksum.setEncoding 'hex'
                stream.pipe checksum
                stream.on 'end', ->
                    checksum.end()
                    checksum.read().should.equal doc.checksum
                    done()


    describe 'utimesUpdater', ->
        it 'updates mtime for a file', (done) ->
            date = new Date '2015-10-09T05:06:07Z'
            filePath = path.join @basePath, "utimes-file"
            fs.ensureFileSync filePath
            updater = @local.utimesUpdater
                path: 'utimes-file'
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
                path: 'utimes-folder'
                lastModification: date
            updater (err) ->
                should.not.exist err
                mtime = +fs.statSync(folderPath).mtime
                mtime.should.equal +date
                done()


    describe 'isUpToDate', ->
        it 'says if the local file is up to date', ->
            doc =
                _id: 'foo/bar'
                _rev: '1-0123456'
                path: 'foo/bar'
                docType: 'file'
                checksum: '22f7aca0d717eb322d5ae1c97d8aa26eb440287b'
                sides:
                    remote: 1
            @local.isUpToDate(doc).should.be.false()
            doc.sides.local = 2
            doc._rev = '2-0123456'
            @local.isUpToDate(doc).should.be.true()
            doc.sides.remote = 3
            doc._rev = '3-0123456'
            @local.isUpToDate(doc).should.be.false()


    describe 'fileExistsLocally', ->
        it 'checks file existence as a binary in the db and on disk', (done) ->
            filePath = path.resolve @basePath, 'folder', 'testfile'
            @local.fileExistsLocally 'deadcafe', (err, exist) =>
                should.not.exist err
                exist.should.not.be.ok()
                fs.ensureFileSync filePath
                doc =
                    _id: 'folder/testfile'
                    path: 'folder/testfile'
                    docType: 'file'
                    checksum: 'deadcafe'
                    sides:
                        local:  1
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @local.fileExistsLocally 'deadcafe', (err, exist) ->
                        should.not.exist err
                        exist.should.be.equal filePath
                        done()


    describe 'addFile', ->
        it 'creates the file by downloading it', (done) ->
            doc =
                path: 'files/file-from-remote'
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
            filePath = path.join @basePath, doc.path
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
                path: 'files/file-with-same-checksum'
                lastModification: new Date '2015-10-09T04:05:07Z'
                checksum: '456'
            alt = path.join @basePath, 'files', 'my-checkum-is-456'
            fs.writeFileSync alt, 'foo bar baz'
            stub = sinon.stub(@local, "fileExistsLocally").yields null, alt
            filePath = path.join @basePath, doc.path
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

        it 'can create a file in the root', (done) ->
            doc =
                path: 'file-in-root'
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
            filePath = path.join @basePath, doc.path
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
                path: 'parent/folder-to-create'
                lastModification: new Date '2015-10-09T05:06:08Z'
            folderPath = path.join @basePath, doc.path
            @local.addFolder doc, (err) ->
                should.not.exist err
                fs.statSync(folderPath).isDirectory().should.be.true()
                mtime = +fs.statSync(folderPath).mtime
                mtime.should.equal +doc.lastModification
                done()

        it 'updates mtime if the folder already exists', (done) ->
            doc =
                path: 'parent/folder-to-create'
                lastModification: new Date '2015-10-09T05:06:08Z'
            folderPath = path.join @basePath, doc.path
            fs.ensureDirSync folderPath
            @local.addFolder doc, (err) ->
                should.not.exist err
                fs.statSync(folderPath).isDirectory().should.be.true()
                mtime = +fs.statSync(folderPath).mtime
                mtime.should.equal +doc.lastModification
                done()


    describe 'overwriteFile', ->
        it 'writes the new content of a file', (done) ->
            doc =
                path: 'a-file-to-overwrite'
                docType: 'file'
                lastModification: new Date '2015-10-09T05:06:07Z'
                checksum: '98765'
            @local.other =
                createReadStream: (docToStream, callback) ->
                    docToStream.should.equal doc
                    stream = new Readable
                    stream._read = ->
                    setTimeout ->
                        stream.push 'Hello world'
                        stream.push null
                    , 100
                    callback null, stream
            filePath = path.join @basePath, doc.path
            fs.writeFileSync filePath, 'old content'
            @local.overwriteFile doc, {}, (err) =>
                @local.other = null
                should.not.exist err
                fs.statSync(filePath).isFile().should.be.true()
                content = fs.readFileSync(filePath, encoding: 'utf-8')
                content.should.equal 'Hello world'
                mtime = +fs.statSync(filePath).mtime
                mtime.should.equal +doc.lastModification
                done()


    describe 'updateFileMetadata', ->
        it 'updates metadata', (done) ->
            doc =
                path: 'file-to-update'
                docType: 'file'
                lastModification: new Date '2015-11-10T05:06:07Z'
            filePath = path.join @basePath, doc.path
            fs.ensureFileSync filePath
            @local.updateFileMetadata doc, {}, (err) ->
                should.not.exist err
                fs.existsSync(filePath).should.be.true()
                mtime = +fs.statSync(filePath).mtime
                mtime.should.equal +doc.lastModification
                done()


    describe 'updateFolder', ->
        it 'calls addFolder', (done) ->
            doc =
                path: 'a-folder-to-update'
                docType: 'folder'
                lastModification: new Date
            sinon.stub(@local, 'addFolder').yields()
            @local.updateFolder doc, {}, (err) =>
                should.not.exist err
                @local.addFolder.calledWith(doc).should.be.true()
                @local.addFolder.restore()
                done()


    describe 'moveFile', ->
        it 'moves the file', (done) ->
            old =
                path: 'old-parent/file-to-move'
                lastModification: new Date '2016-10-08T05:05:09Z'
            doc =
                path: 'new-parent/file-moved'
                lastModification: new Date '2015-10-09T05:05:10Z'
            oldPath = path.join @basePath, old.path
            newPath = path.join @basePath, doc.path
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
                path: 'old-parent/missing-file'
                lastModification: new Date '2016-10-08T05:05:11Z'
            doc =
                path: 'new-parent/recreated-file'
                lastModification: new Date '2015-10-09T05:05:12Z'
            stub = sinon.stub(@local, "addFile").yields()
            @local.moveFile doc, old, (err) ->
                stub.restore()
                stub.calledWith(doc).should.be.true()
                should.not.exist err
                done()

        it 'does nothing if the file has already been moved', (done) ->
            old =
                path: 'old-parent/already-moved'
                lastModification: new Date '2016-10-08T05:05:11Z'
            doc =
                path: 'new-parent/already-here'
                lastModification: new Date '2015-10-09T05:05:12Z'
            newPath = path.join @basePath, doc.path
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
                path: 'old-parent/folder-to-move'
                docType: 'folder'
                lastModification: new Date '2016-10-08T05:06:09Z'
            doc =
                path: 'new-parent/folder-moved'
                docType: 'folder'
                lastModification: new Date '2015-10-09T05:06:10Z'
            oldPath = path.join @basePath, old.path
            folderPath = path.join @basePath, doc.path
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
                path: 'old-parent/missing-folder'
                docType: 'folder'
                lastModification: new Date '2016-10-08T05:06:09Z'
            doc =
                path: 'new-parent/recreated-folder'
                docType: 'folder'
                lastModification: new Date '2015-10-09T05:06:10Z'
            folderPath = path.join @basePath, doc.path
            @local.moveFolder doc, old, (err) ->
                should.not.exist err
                fs.statSync(folderPath).isDirectory().should.be.true()
                mtime = +fs.statSync(folderPath).mtime
                mtime.should.equal +doc.lastModification
                done()

        it 'does nothing if the folder has already been moved', (done) ->
            old =
                path: 'old-parent/folder-already-moved'
                lastModification: new Date '2016-10-08T05:05:11Z'
            doc =
                path: 'new-parent/folder-already-here'
                lastModification: new Date '2015-10-09T05:05:12Z'
            newPath = path.join @basePath, doc.path
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
                path: 'old-parent/folder-already-moved'
                lastModification: new Date '2016-10-08T05:05:11Z'
            doc =
                path: 'new-parent/folder-already-here'
                lastModification: new Date '2015-10-09T05:05:12Z'
            oldPath = path.join @basePath, old.path
            newPath = path.join @basePath, doc.path
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
                _id: 'FILE-TO-DELETE'
                path: 'FILE-TO-DELETE'
                docType: 'file'
            filePath = path.join @basePath, doc.path
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
                _id: 'FOLDER-TO-DELETE'
                path: 'FOLDER-TO-DELETE'
                docType: 'folder'
            folderPath = path.join @basePath, doc.path
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


    describe 'resolveConflict', ->
        it 'renames the file', (done) ->
            src =
                path: 'conflict/file'
                lastModification: new Date '2015-10-08T05:05:09Z'
            dst =
                path: 'conflict/file-conflict-2015-10-09T05:05:10Z'
                lastModification: new Date '2015-10-09T05:05:10Z'
            srcPath = path.join @basePath, src.path
            dstPath = path.join @basePath, dst.path
            fs.ensureDirSync path.dirname srcPath
            fs.writeFileSync srcPath, 'foobar'
            @local.resolveConflict dst, src, (err) ->
                should.not.exist err
                fs.existsSync(srcPath).should.be.false()
                fs.statSync(dstPath).isFile().should.be.true()
                enc = encoding: 'utf-8'
                fs.readFileSync(dstPath, enc).should.equal 'foobar'
                done()
