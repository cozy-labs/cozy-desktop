async  = require 'async'
fs     = require 'fs-extra'
path   = require 'path'
sinon  = require 'sinon'
should = require 'should'

Watcher = require '../../../backend/local/watcher'

configHelpers = require '../../helpers/config'
pouchHelpers  = require '../../helpers/pouch'


describe "LocalWatcher Tests", ->
    @timeout 10000

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    beforeEach 'instanciate local watcher', ->
        @merge = {}
        @watcher = new Watcher @basePath, @merge, @pouch
    afterEach 'stop watcher and clean path', (done) ->
        @watcher.watcher?.close()
        fs.emptyDir @basePath, done
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig


    describe 'start', ->
        it 'calls the callback when initial scan is done', (done) ->
            @watcher.start done

        it 'calls addFile/putFolder for files that are aleady here', (done) ->
            fs.ensureDirSync path.join @basePath, 'aa'
            fs.ensureFileSync path.join @basePath, 'aa/ab'
            @merge.putFolder = sinon.spy()
            @merge.addFile = sinon.spy()
            setTimeout =>
                @merge.putFolder.called.should.be.true()
                @merge.putFolder.args[0][0].should.equal 'local'
                @merge.putFolder.args[0][1]._id.should.equal 'aa'
                @merge.addFile.called.should.be.true()
                @merge.addFile.args[0][0].should.equal 'local'
                @merge.addFile.args[0][1]._id.should.equal 'aa/ab'
                done()
            , 1100
            @watcher.start ->

        it 'ignores .cozy-desktop', (done) ->
            fs.ensureDirSync path.join @basePath, '.cozy-desktop'
            fs.ensureFileSync path.join @basePath, '.cozy-desktop/ac'
            @merge.putFolder = sinon.spy()
            @merge.addFile = sinon.spy()
            @merge.updateFile = sinon.spy()
            setTimeout =>
                @merge.putFolder.called.should.be.false()
                @merge.addFile.called.should.be.false()
                @merge.updateFile.called.should.be.false()
                done()
            , 1000
            @watcher.start ->


    describe 'createDoc', ->
        it 'creates a document for an existing file', (done) ->
            src = path.join __dirname, '../../fixtures/chat-mignon.jpg'
            dst = path.join @basePath, 'chat-mignon.jpg'
            fs.copySync src, dst
            fs.stat dst, (err, stats) =>
                should.not.exist err
                should.exist stats
                @watcher.createDoc 'chat-mignon.jpg', stats, (err, doc) ->
                    should.not.exist err
                    doc.should.have.properties
                        _id: 'chat-mignon.jpg'
                        docType: 'file'
                        checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
                        size: 29865
                        class: 'image'
                        mime: 'image/jpeg'
                    doc.should.have.properties [
                        'creationDate'
                        'lastModification'
                    ]
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
            filePath = 'tests/fixtures/chat-mignon.jpg'
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


    describe 'onAdd', ->
        it 'detects when a file is created', (done) ->
            @watcher.start =>
                @merge.addFile = (side, doc) ->
                    side.should.equal 'local'
                    doc.should.have.properties
                        _id: 'aaa.jpg'
                        docType: 'file'
                        checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
                        size: 29865
                        class: 'image'
                        mime: 'image/jpeg'
                    done()
                src = path.join __dirname, '../../fixtures/chat-mignon.jpg'
                dst = path.join @basePath, 'aaa.jpg'
                fs.copySync src, dst


    describe 'onAddDir', ->
        it 'detects when a folder is created', (done) ->
            @watcher.start =>
                @merge.putFolder = (side, doc) ->
                    side.should.equal 'local'
                    doc.should.have.properties
                        _id: 'aba'
                        docType: 'folder'
                    doc.should.have.properties [
                        'creationDate'
                        'lastModification'
                    ]
                    done()
                fs.mkdirSync path.join @basePath, 'aba'

        it 'detects when a sub-folder is created', (done) ->
            fs.mkdirSync path.join @basePath, 'abb'
            @merge.putFolder = =>  # For aba folder
                @merge.putFolder = (side, doc) ->
                    side.should.equal 'local'
                    doc.should.have.properties
                        _id: 'abb/abc'
                        docType: 'folder'
                    doc.should.have.properties [
                        'creationDate'
                        'lastModification'
                    ]
                    done()
                fs.mkdirSync path.join @basePath, 'abb/abc'
            @watcher.start ->


    describe 'onUnlink', ->
        it 'detects when a file is deleted', (done) ->
            fs.ensureFileSync path.join @basePath, 'aca'
            @merge.addFile = =>  # For aca file
                @merge.deleteFile = (side, doc) ->
                    side.should.equal 'local'
                    doc.should.have.properties
                        _id: 'aca'
                    done()
                fs.unlinkSync path.join @basePath, 'aca'
            @watcher.start ->


    describe 'onUnlinkDir', ->
        it 'detects when a folder is deleted', (done) ->
            fs.mkdirSync path.join @basePath, 'ada'
            @merge.putFolder = =>  # For ada folder
                @merge.deleteFolder = (side, doc) ->
                    side.should.equal 'local'
                    doc.should.have.properties
                        _id: 'ada'
                    done()
                fs.rmdirSync path.join @basePath, 'ada'
            @watcher.start ->


    describe 'onChange', ->
        it 'detects when a file is changed', (done) ->
            src = path.join __dirname, '../../fixtures/chat-mignon.jpg'
            dst = path.join @basePath, 'aea.jpg'
            fs.copySync src, dst
            @merge.addFile = =>
                @merge.updateFile = (side, doc) ->
                    side.should.equal 'local'
                    doc.should.have.properties
                        _id: 'aea.jpg'
                        docType: 'file'
                        checksum: 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
                        size: 36901
                        class: 'image'
                        mime: 'image/jpeg'
                    done()
                src = src.replace /\.jpg$/, '-mod.jpg'
                dst = path.join @basePath, 'aea.jpg'
                fs.copySync src, dst
            @watcher.start ->


    describe 'when a file is moved', ->
        it 'deletes the source and adds the destination', (done) ->
            src = path.join __dirname, '../../fixtures/chat-mignon.jpg'
            dst = path.join @basePath, 'afa.jpg'
            fs.copySync src, dst
            @merge.addFile = ->
            @watcher.start =>
                setTimeout =>
                    @merge.deleteFile = sinon.spy()
                    @merge.addFile = (side, doc) =>
                        side.should.equal 'local'
                        doc.should.have.properties
                            _id: 'afb.jpg'
                            docType: 'file'
                            checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
                            size: 29865
                            class: 'image'
                            mime: 'image/jpeg'
                        setTimeout =>
                            @merge.deleteFile.called.should.be.true()
                            @merge.deleteFile.args[0][1].should.have.properties
                                _id: 'afa.jpg'
                            done()
                        , 10
                    fs.renameSync dst, path.join @basePath, 'afb.jpg'
                , 1100


    describe 'when a directory is moved', ->
        it 'deletes the source and adds the destination', (done) ->
            src = path.join @basePath, 'aga'
            dst = path.join @basePath, 'agb'
            fs.ensureDirSync src
            fs.ensureFileSync "#{src}/agc"
            @merge.addFile = ->
            @merge.putFolder = ->
            @watcher.start =>
                setTimeout =>
                    @merge.addFile = sinon.spy()
                    @merge.deleteFile = sinon.spy()
                    @merge.deleteFolder = sinon.spy()
                    @merge.putFolder = (side, doc) =>
                        side.should.equal 'local'
                        doc.should.have.properties
                            _id: 'agb'
                            docType: 'folder'
                        setTimeout =>
                            @merge.addFile.called.should.be.true()
                            args = @merge.addFile.args[0][1]
                            args.should.have.properties _id: 'agb/agc'
                            @merge.deleteFile.called.should.be.true()
                            args = @merge.deleteFile.args[0][1]
                            args.should.have.properties _id: 'aga/agc'
                            @merge.deleteFolder.called.should.be.true()
                            args = @merge.deleteFolder.args[0][1]
                            args.should.have.properties _id: 'aga'
                            done()
                        , 1100
                    fs.renameSync src, dst
                , 1100

    describe 'onReady', ->
        it 'detects deleted files and folders', (done) ->
            dd = @merge.deleteDoc = sinon.stub().yields()
            folder1 =
                _id: 'folder1'
                docType: 'folder'
            folder2 =
                _id: 'folder2'
                docType: 'folder'
            file1 =
                _id: 'file1'
                docType: 'folder'
            file2 =
                _id: 'file2'
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
