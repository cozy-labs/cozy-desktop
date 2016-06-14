async  = require 'async'
fs     = require 'fs-extra'
path   = require 'path'
sinon  = require 'sinon'
should = require 'should'

Watcher = require '../../../src/local/watcher'

configHelpers = require '../../helpers/config'
pouchHelpers  = require '../../helpers/pouch'


describe "LocalWatcher Tests", ->
    @timeout 10000

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    beforeEach 'instanciate local watcher', ->
        @prep = {}
        @watcher = new Watcher @syncPath, @prep, @pouch
    afterEach 'stop watcher and clean path', (done) ->
        @watcher.watcher?.close()
        fs.emptyDir @syncPath, done
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig


    describe 'start', ->
        it 'calls the callback when initial scan is done', (done) ->
            @watcher.start done

        it 'calls addFile/putFolder for files that are aleady here', (done) ->
            fs.ensureDirSync path.join @syncPath, 'aa'
            fs.ensureFileSync path.join @syncPath, 'aa/ab'
            @prep.putFolder = sinon.spy()
            @prep.addFile = sinon.spy()
            setTimeout =>
                @prep.putFolder.called.should.be.true()
                @prep.putFolder.args[0][0].should.equal 'local'
                @prep.putFolder.args[0][1].path.should.equal 'aa'
                @prep.addFile.called.should.be.true()
                @prep.addFile.args[0][0].should.equal 'local'
                @prep.addFile.args[0][1].path.should.equal 'aa/ab'
                done()
            , 1100
            @watcher.start ->

        it 'ignores .cozy-desktop', (done) ->
            fs.ensureDirSync path.join @syncPath, '.cozy-desktop'
            fs.ensureFileSync path.join @syncPath, '.cozy-desktop/ac'
            @prep.putFolder = sinon.spy()
            @prep.addFile = sinon.spy()
            @prep.updateFile = sinon.spy()
            setTimeout =>
                @prep.putFolder.called.should.be.false()
                @prep.addFile.called.should.be.false()
                @prep.updateFile.called.should.be.false()
                done()
            , 1000
            @watcher.start ->


    describe 'createDoc', ->
        it 'creates a document for an existing file', (done) ->
            src = path.join __dirname, '../../fixtures/chat-mignon.jpg'
            dst = path.join @syncPath, 'chat-mignon.jpg'
            fs.copySync src, dst
            fs.stat dst, (err, stats) =>
                should.not.exist err
                should.exist stats
                @watcher.createDoc 'chat-mignon.jpg', stats, (err, doc) ->
                    should.not.exist err
                    doc.should.have.properties
                        path: 'chat-mignon.jpg'
                        docType: 'file'
                        checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
                        size: 29865
                        class: 'image'
                        mime: 'image/jpeg'
                    doc.should.have.properties [
                        'creationDate'
                        'lastModification'
                    ]
                    should.not.exist doc.executable
                    done()

        it 'sets the executable bit', (done) ->
            filePath = path.join @syncPath, 'executable'
            fs.ensureFileSync filePath
            fs.chmodSync filePath, '755'
            fs.stat filePath, (err, stats) =>
                should.not.exist err
                should.exist stats
                @watcher.createDoc 'executable', stats, (err, doc) ->
                    should.not.exist err
                    doc.executable.should.be.true()
                    done()

        it 'calls back with an error if the file is missing', (done) ->
            @watcher.createDoc 'no/such/file', {}, (err, doc) ->
                should.exist err
                err.code.should.equal 'ENOENT'
                done()


    describe 'getFileClass', ->
        it 'returns proper class for given file', ->
            [mimeType, fileClass] = @watcher.getFileClass 'image.png'
            mimeType.should.equal 'image/png'
            fileClass.should.equal 'image'
            [mimeType, fileClass] = @watcher.getFileClass 'doc.txt'
            mimeType.should.equal 'text/plain'
            fileClass.should.equal 'document'


    describe 'checksum', ->
        it 'returns the checksum of an existing file', (done) ->
            filePath = 'test/fixtures/chat-mignon.jpg'
            @watcher.checksum filePath, (err, sum) ->
                should.not.exist err
                sum.should.equal "bf268fcb32d2fd7243780ad27af8ae242a6f0d30"
                done()

        it 'returns an error for a missing file', (done) ->
            filePath = 'no/such/file'
            @watcher.checksum filePath, (err, sum) ->
                should.exist err
                err.code.should.equal 'ENOENT'
                done()

    describe 'hasPending', ->
        it 'returns true if a sub-folder is pending', ->
            @watcher.pending = Object.create null
            @watcher.pending['bar'] = {}
            @watcher.pending['foo/bar'] = {}
            @watcher.pending['zoo'] = {}
            @watcher.hasPending('foo').should.be.true()
            @watcher.pending['foo/baz/bim'] = {}
            @watcher.hasPending('foo/baz').should.be.true()

        it 'returns false else', ->
            @watcher.pending = Object.create null
            @watcher.hasPending('foo').should.be.false()
            @watcher.pending['foo'] = {}
            @watcher.pending['bar/baz'] = {}
            @watcher.hasPending('foo').should.be.false()


    describe 'onAdd', ->
        it 'detects when a file is created', (done) ->
            @watcher.start =>
                @prep.addFile = (side, doc) ->
                    side.should.equal 'local'
                    doc.should.have.properties
                        path: 'aaa.jpg'
                        docType: 'file'
                        checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
                        size: 29865
                        class: 'image'
                        mime: 'image/jpeg'
                    done()
                src = path.join __dirname, '../../fixtures/chat-mignon.jpg'
                dst = path.join @syncPath, 'aaa.jpg'
                fs.copySync src, dst


    describe 'onAddDir', ->
        it 'detects when a folder is created', (done) ->
            @watcher.start =>
                @prep.putFolder = (side, doc) ->
                    side.should.equal 'local'
                    doc.should.have.properties
                        path: 'aba'
                        docType: 'folder'
                    doc.should.have.properties [
                        'creationDate'
                        'lastModification'
                    ]
                    done()
                fs.mkdirSync path.join @syncPath, 'aba'

        it 'detects when a sub-folder is created', (done) ->
            fs.mkdirSync path.join @syncPath, 'abb'
            @prep.putFolder = =>  # For aba folder
                @prep.putFolder = (side, doc) ->
                    side.should.equal 'local'
                    doc.should.have.properties
                        path: 'abb/abc'
                        docType: 'folder'
                    doc.should.have.properties [
                        'creationDate'
                        'lastModification'
                    ]
                    done()
                fs.mkdirSync path.join @syncPath, 'abb/abc'
            @watcher.start ->


    describe 'onUnlink', ->
        it 'detects when a file is deleted', (done) ->
            fs.ensureFileSync path.join @syncPath, 'aca'
            @prep.addFile = =>  # For aca file
                @prep.deleteFile = (side, doc) ->
                    side.should.equal 'local'
                    doc.should.have.properties
                        path: 'aca'
                    done()
                fs.unlinkSync path.join @syncPath, 'aca'
            @watcher.start ->


    describe 'onUnlinkDir', ->
        it 'detects when a folder is deleted', (done) ->
            fs.mkdirSync path.join @syncPath, 'ada'
            @prep.putFolder = =>  # For ada folder
                @prep.deleteFolder = (side, doc) ->
                    side.should.equal 'local'
                    doc.should.have.properties
                        path: 'ada'
                    done()
                fs.rmdirSync path.join @syncPath, 'ada'
            @watcher.start ->


    describe 'onChange', ->
        it 'detects when a file is changed', (done) ->
            src = path.join __dirname, '../../fixtures/chat-mignon.jpg'
            dst = path.join @syncPath, 'aea.jpg'
            fs.copySync src, dst
            @prep.addFile = =>
                @prep.updateFile = (side, doc) ->
                    side.should.equal 'local'
                    doc.should.have.properties
                        path: 'aea.jpg'
                        docType: 'file'
                        checksum: 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
                        size: 36901
                        class: 'image'
                        mime: 'image/jpeg'
                    done()
                src = src.replace /\.jpg$/, '-mod.jpg'
                dst = path.join @syncPath, 'aea.jpg'
                fs.copySync src, dst
            @watcher.start ->


    describe 'when a file is moved', ->
        # This integration test is unstable on travis + OSX (too often red).
        # It's disabled for the moment, but we should find a way to make it
        # more stable on travis, and enable it again.
        if process.env.TRAVIS and process.platform is 'darwin'
            it 'is unstable on travis'
            return

        before 'reset pouchdb', (done) ->
            @pouch.resetDatabase done

        it 'deletes the source and adds the destination', (done) ->
            src = path.join __dirname, '../../fixtures/chat-mignon.jpg'
            dst = path.join @syncPath, 'afa.jpg'
            fs.copySync src, dst
            @prep.addFile = (side, doc) =>
                doc._id = doc.path
                @pouch.db.put doc
            @watcher.start =>
                setTimeout =>
                    @prep.deleteFile = sinon.spy()
                    @prep.addFile = sinon.spy()
                    @prep.moveFile = (side, doc, was) =>
                        @prep.deleteFile.called.should.be.false()
                        @prep.addFile.called.should.be.false()
                        side.should.equal 'local'
                        doc.should.have.properties
                            path: 'afb.jpg'
                            docType: 'file'
                            checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
                            size: 29865
                            class: 'image'
                            mime: 'image/jpeg'
                        was.should.have.properties
                            path: 'afa.jpg'
                            docType: 'file'
                            checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
                            size: 29865
                        done()
                    fs.renameSync dst, path.join @syncPath, 'afb.jpg'
                , 2000


    describe 'when a directory is moved', ->
        # This integration test is unstable on travis + OSX (too often red).
        # It's disabled for the moment, but we should find a way to make it
        # more stable on travis, and enable it again.
        if process.env.TRAVIS and process.platform is 'darwin'
            it 'is unstable on travis'
            return

        before 'reset pouchdb', (done) ->
            @pouch.resetDatabase done

        it 'deletes the source and adds the destination', (done) ->
            src = path.join @syncPath, 'aga'
            dst = path.join @syncPath, 'agb'
            fs.ensureDirSync src
            fs.writeFileSync "#{src}/agc", 'agc'
            @prep.addFile = @prep.putFolder = (side, doc) =>
                doc._id = doc.path
                @pouch.db.put doc
            @watcher.start =>
                setTimeout =>
                    @prep.updateFile = sinon.spy()
                    @prep.addFile = sinon.spy()
                    @prep.deleteFile = sinon.spy()
                    @prep.moveFile = sinon.spy()
                    @prep.deleteFolder = sinon.spy()
                    @prep.putFolder = (side, doc) =>
                        side.should.equal 'local'
                        doc.should.have.properties
                            path: 'agb'
                            docType: 'folder'
                        setTimeout =>
                            @prep.addFile.called.should.be.false()
                            @prep.deleteFile.called.should.be.false()
                            @prep.moveFile.called.should.be.true()
                            src = @prep.moveFile.args[0][2]
                            src.should.have.properties path: 'aga/agc'
                            dst = @prep.moveFile.args[0][1]
                            dst.should.have.properties path: 'agb/agc'
                            @prep.deleteFolder.called.should.be.true()
                            args = @prep.deleteFolder.args[0][1]
                            args.should.have.properties path: 'aga'
                            done()
                        , 4000
                    fs.renameSync src, dst
                , 1800

    describe 'onReady', ->
        before 'reset pouchdb', (done) ->
            @pouch.resetDatabase done

        it 'detects deleted files and folders', (done) ->
            dd = @prep.deleteDoc = sinon.stub().yields()
            folder1 =
                _id: 'folder1'
                path: 'folder1'
                docType: 'folder'
            folder2 =
                _id: 'folder2'
                path: 'folder2'
                docType: 'folder'
            file1 =
                _id: 'file1'
                path: 'file1'
                docType: 'folder'
            file2 =
                _id: 'file2'
                path: 'file2'
                docType: 'folder'
            async.each [folder1, folder2, file1, file2], (doc, next) =>
                @pouch.db.put doc, next
            , =>
                @watcher.paths = ['folder1', 'file1']
                cb = @watcher.onReady ->
                    dd.calledTwice.should.be.true()
                    dd.calledWithMatch('local', folder1).should.be.false()
                    dd.calledWithMatch('local', folder2).should.be.true()
                    dd.calledWithMatch('local', file1).should.be.false()
                    dd.calledWithMatch('local', file2).should.be.true()
                    done()
                cb()
