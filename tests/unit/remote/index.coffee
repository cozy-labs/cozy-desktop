fs       = require 'fs'
sinon    = require 'sinon'
should   = require 'should'

Remote = require '../../../backend/remote'


configHelpers = require '../../helpers/config'
pouchHelpers  = require '../../helpers/pouch'
couchHelpers  = require '../../helpers/couch'


describe 'Remote', ->

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    before 'start couch server', couchHelpers.startServer
    before 'instanciate couch', couchHelpers.createCouchClient
    before 'instanciate remote', ->
        @merge = {}
        @remote = new Remote @config, @merge, @pouch
    after 'stop couch server', couchHelpers.stopServer
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig


    describe 'constructor', ->
        it 'has a couch and a watcher', ->
            should.exist @remote.couch
            should.exist @remote.watcher


    describe 'start', ->
        it 'TODO'


    describe 'createReadStream', ->
        it 'TODO'


    describe 'uploadBinary', ->
        @timeout 5000

        it 'creates a remote binary document', (done) ->
            checksum = 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
            fixture = 'tests/fixtures/chat-mignon.jpg'
            doc =
                _id: 'chat.jpg'
                checksum: checksum
            @remote.other =
                createReadStream: (localDoc, callback) ->
                    localDoc.should.equal doc
                    stream = fs.createReadStream fixture
                    callback null, stream
            @remote.uploadBinary doc, (err, binary) =>
                should.not.exist err
                binary._id.should.equal checksum
                @remote.couch.get binary._id, (err, binaryDoc) ->
                    should.not.exist err
                    console.log binaryDoc
                    done()


    describe 'addFile', ->
        it 'TODO'


    describe 'addFolder', ->
        it 'adds a folder to couchdb', (done) ->
            doc =
                _id: 'couchdb-folder/folder-1'
                docType: 'folder'
                creationDate: new Date()
                lastModification: new Date()
            @remote.addFolder doc, (err, created) =>
                should.not.exist err
                @couch.get created.id, (err, folder) ->
                    should.not.exist err
                    folder.should.have.properties
                        path: 'couchdb-folder'
                        name: 'folder-1'
                        docType: 'folder'
                        creationDate: doc.creationDate.toISOString()
                        lastModification: doc.lastModification.toISOString()
                    done()


    describe 'updateFile', ->
        it 'TODO'


    describe 'updateFolder', ->
        it 'updates the metadata of a folder in couchdb', (done) ->
            couchHelpers.createFolder @couch, 2, (err, created) =>
                doc =
                    _id: 'couchdb-folder/folder-2'
                    docType: 'folder'
                    creationDate: new Date()
                    lastModification: new Date()
                    remote:
                        _id: created.id
                        _rev: created.rev
                @remote.updateFolder doc, (err, created) =>
                    should.not.exist err
                    @couch.get created.id, (err, folder) ->
                        should.not.exist err
                        folder.should.have.properties
                            path: 'couchdb-folder'
                            name: 'folder-2'
                            docType: 'folder'
                            lastModification: doc.lastModification.toISOString()
                        done()

        it 'adds a folder to couchdb if the folder does not exist', (done) ->
            doc =
                _id: 'couchdb-folder/folder-3'
                docType: 'folder'
                creationDate: new Date()
                lastModification: new Date()
            @remote.updateFolder doc, (err, created) =>
                should.not.exist err
                @couch.get created.id, (err, folder) ->
                    should.not.exist err
                    folder.should.have.properties
                        path: 'couchdb-folder'
                        name: 'folder-3'
                        docType: 'folder'
                        creationDate: doc.creationDate.toISOString()
                        lastModification: doc.lastModification.toISOString()
                    done()


    describe 'moveFile', ->
        it 'TODO'


    describe 'moveFolder', ->
        it 'moves the folder in couchdb', (done) ->
            couchHelpers.createFolder @couch, 4, (err, created) =>
                doc =
                    _id: 'couchdb-folder/folder-5'
                    docType: 'folder'
                    creationDate: new Date()
                    lastModification: new Date()
                    remote:
                        _id: created.id
                        _rev: created.rev
                old =
                    _id: 'couchdb-folder/folder-4'
                    docType: 'folder'
                    remote:
                        _id: created.id
                        _rev: created.rev
                @remote.moveFolder doc, old, (err, created) =>
                    should.not.exist err
                    @couch.get created.id, (err, folder) ->
                        should.not.exist err
                        folder.should.have.properties
                            path: 'couchdb-folder'
                            name: 'folder-5'
                            docType: 'folder'
                            lastModification: doc.lastModification.toISOString()
                        done()

        it 'adds a folder to couchdb if the folder does not exist', (done) ->
            doc =
                _id: 'couchdb-folder/folder-7'
                docType: 'folder'
                creationDate: new Date()
                lastModification: new Date()
            old =
                _id: 'couchdb-folder/folder-6'
                docType: 'folder'
            @remote.moveFolder doc, old, (err, created) =>
                should.not.exist err
                @couch.get created.id, (err, folder) ->
                    should.not.exist err
                    folder.should.have.properties
                        path: 'couchdb-folder'
                        name: 'folder-7'
                        docType: 'folder'
                        creationDate: doc.creationDate.toISOString()
                        lastModification: doc.lastModification.toISOString()
                    done()


    describe 'deleteFile', ->
        it 'deletes a file in couchdb', (done) ->
            couchHelpers.createFile @couch, 9, (err, file) =>
                should.not.exist err
                doc =
                    _id: 'couchdb-folder/file-9'
                    _deleted: true
                    docType: 'file'
                    checksum: "1111111111111111111111111111111111111129"
                    remote:
                        _id: file.id
                        _rev: file.rev
                @couch.get doc.remote._id, (err) =>
                    should.not.exist err
                    @remote.deleteFile doc, (err) =>
                        should.not.exist err
                        @couch.get doc.remote._id, (err) ->
                            err.status.should.equal 404
                            done()


    describe 'deleteFolder', ->
        it 'deletes a folder in couchdb', (done) ->
            couchHelpers.createFolder @couch, 9, (err, folder) =>
                should.not.exist err
                doc =
                    _id: 'couchdb-folder/folder-9'
                    _deleted: true
                    docType: 'folder'
                    remote:
                        _id: folder.id
                        _rev: folder.rev
                @couch.get doc.remote._id, (err) =>
                    should.not.exist err
                    @remote.deleteFolder doc, (err) =>
                        should.not.exist err
                        @couch.get doc.remote._id, (err) ->
                            err.status.should.equal 404
                            done()
