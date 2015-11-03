fs     = require 'fs-extra'
path   = require 'path'
sinon  = require 'sinon'
should = require 'should'

Watcher = require '../../../backend/local/watcher'

configHelpers = require '../../helpers/config'
pouchHelpers  = require '../../helpers/pouch'


describe "LocalWatcher Tests", ->
    @timeout 5000

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    beforeEach 'instanciate local watcher', ->
        @merge = {}
        @watcher = new Watcher @basePath, @merge, @pouch
    afterEach 'stop watcher and clean path', (done) ->
        @watcher.watcher.close()
        fs.emptyDir @basePath, done
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig


    describe 'start', ->
        it 'calls the callback when initial scan is done', (done) ->
            @watcher.start done

        it 'calls addFile/addFolder for files that are aleady here', (done) ->
            fs.ensureDirSync path.join @basePath, 'aa'
            fs.ensureFileSync path.join @basePath, 'aa/ab'
            @merge.putFolder = sinon.spy()
            @merge.putFile = sinon.spy()
            setTimeout =>
                @merge.putFolder.called.should.be.true()
                @merge.putFolder.args[0][0]._id.should.equal 'aa'
                @merge.putFile.called.should.be.true()
                @merge.putFile.args[0][0]._id.should.equal 'aa/ab'
                done()
            , 100
            @watcher.start ->

        it 'ignores .cozy-desktop', (done) ->
            fs.ensureDirSync path.join @basePath, '.cozy-desktop'
            fs.ensureFileSync path.join @basePath, '.cozy-desktop/ac'
            @merge.putFolder = sinon.spy()
            @merge.putFile = sinon.spy()
            setTimeout =>
                @merge.putFolder.called.should.be.false()
                @merge.putFile.called.should.be.false()
                done()
            , 1000
            @watcher.start ->


    describe 'onAdd', ->
        it 'detects when a file is created', (done) ->
            @watcher.start =>
                @merge.putFile = (doc) ->
                    doc.should.have.properties
                        _id: 'aaa.jpg'
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
                src = path.join __dirname, '../../fixtures/chat-mignon.jpg'
                dst = path.join @basePath, 'aaa.jpg'
                fs.copySync src, dst


    describe 'onAddDir', ->
        it 'detects when a folder is created', (done) ->
            @watcher.start =>
                @merge.putFolder = (doc) ->
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
                @merge.putFolder = (doc) ->
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
            @merge.putFile = =>  # For aca file
                @merge.deleteFile = (doc) ->
                    doc.should.have.properties
                        _id: 'aca'
                    done()
                fs.unlinkSync path.join @basePath, 'aca'
            @watcher.start ->


    describe 'onUnlinkDir', ->
        it 'detects when a folder is deleted', (done) ->
            fs.mkdirSync path.join @basePath, 'ada'
            @merge.putFolder = =>  # For ada folder
                @merge.deleteFolder = (doc) ->
                    doc.should.have.properties
                        _id: 'ada'
                    done()
                fs.rmdirSync path.join @basePath, 'ada'
            @watcher.start ->


    describe 'onChange', ->
        it 'TODO'


    describe 'when a directory is file', ->
        it 'deletes the source and adds the destination', (done) ->
            src = path.join __dirname, '../../fixtures/chat-mignon.jpg'
            dst = path.join @basePath, 'afa.jpg'
            fs.copySync src, dst
            @merge.putFile = ->
            @watcher.start =>
                setTimeout =>
                    @merge.deleteFile = sinon.spy()
                    @merge.putFile = (doc) =>
                        doc.should.have.properties
                            _id: 'afb.jpg'
                            docType: 'file'
                            checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
                            size: 29865
                            class: 'image'
                            mime: 'image/jpeg'
                        setTimeout =>
                            @merge.deleteFile.called.should.be.true()
                            @merge.deleteFile.args[0][0].should.have.properties
                                _id: 'afa.jpg'
                            done()
                        , 1000
                    fs.renameSync dst, path.join @basePath, 'afb.jpg'
                , 10


    describe 'when a directory is moved', ->
        it 'deletes the source and adds the destination', (done) ->
            src = path.join @basePath, 'aga'
            dst = path.join @basePath, 'agb'
            fs.ensureDirSync src
            fs.ensureFileSync "#{src}/agc"
            @merge.putFile = ->
            @merge.putFolder = ->
            @watcher.start =>
                setTimeout =>
                    @merge.putFile = sinon.spy()
                    @merge.deleteFile = sinon.spy()
                    @merge.deleteFolder = sinon.spy()
                    @merge.putFolder = (doc) =>
                        doc.should.have.properties
                            _id: 'agb'
                            docType: 'folder'
                        setTimeout =>
                            @merge.putFile.called.should.be.true()
                            args = @merge.putFile.args[0][0]
                            args.should.have.properties _id: 'agb/agc'
                            @merge.deleteFile.called.should.be.true()
                            args = @merge.deleteFile.args[0][0]
                            args.should.have.properties _id: 'aga/agc'
                            @merge.deleteFolder.called.should.be.true()
                            args = @merge.deleteFolder.args[0][0]
                            args.should.have.properties _id: 'aga'
                            done()
                        , 1000
                    fs.renameSync src, dst
                , 10
