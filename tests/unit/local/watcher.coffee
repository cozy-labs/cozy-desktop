fs     = require 'fs-extra'
path   = require 'path'
sinon  = require 'sinon'
should = require 'should'

Watcher = require '../../../backend/local/watcher'

configHelpers = require '../../helpers/config'
pouchHelpers  = require '../../helpers/pouch'


describe "LocalWatcher Tests", ->

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

        it 'TODO more tests on initial scan'

        it 'TODO ignore .cozy-desktop'


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


    describe 'when a directory is moved', ->
        it 'TODO'
