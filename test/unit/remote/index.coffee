crypto   = require 'crypto'
fs       = require 'fs'
sinon    = require 'sinon'
should   = require 'should'

Remote = require '../../../src/remote'


configHelpers = require '../../helpers/config'
pouchHelpers  = require '../../helpers/pouch'
couchHelpers  = require '../../helpers/couch'


describe 'Remote', ->

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    before 'start couch server', couchHelpers.startServer
    before 'instanciate couch', couchHelpers.createCouchClient
    before 'instanciate remote', ->
        @prep = {}
        @remote = new Remote @config, @prep, @pouch
    after 'stop couch server', couchHelpers.stopServer
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig


    describe 'constructor', ->
        it 'has a couch and a watcher', ->
            should.exist @remote.couch
            should.exist @remote.watcher


    describe 'createReadStream', ->
        it 'create a readable stream from a remote binary', (done) ->
            checksum = '53a547469e98b667671803adc814d6d1376fae6b'
            fixture = 'test/fixtures/cool-pillow.jpg'
            doc =
                path: 'pillow.jpg'
                checksum: checksum
                mime: 'image/jpeg'
                remote:
                    binary:
                        _id: checksum
                        _rev: '1-01234'
            @remote.other =
                createReadStream: (localDoc, callback) ->
                    localDoc.should.equal doc
                    stream = fs.createReadStream fixture
                    callback null, stream
            @remote.uploadBinary doc, (err, binary) =>
                should.not.exist err
                binary._id.should.equal checksum
                @remote.createReadStream doc, (err, stream) ->
                    should.not.exist err
                    should.exist stream
                    checksum = crypto.createHash 'sha1'
                    checksum.setEncoding 'hex'
                    stream.pipe checksum
                    stream.on 'end', ->
                        checksum.end()
                        checksum.read().should.equal doc.checksum
                        done()


    describe 'uploadBinary', ->
        it 'creates a remote binary document', (done) ->
            checksum = 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
            fixture = 'test/fixtures/chat-mignon.jpg'
            doc =
                path: 'chat.jpg'
                mime: 'image/jpeg'
                checksum: checksum
            @remote.other =
                createReadStream: (localDoc, callback) ->
                    localDoc.should.equal doc
                    stream = fs.createReadStream fixture
                    callback null, stream
            @remote.uploadBinary doc, (err, binary) =>
                should.not.exist err
                binary._id.should.equal checksum
                @remote.couch.get checksum, (err, binaryDoc) ->
                    should.not.exist err
                    binaryDoc.should.have.properties
                        _id: checksum
                        checksum: checksum
                        docType: 'Binary'
                    should.exist binaryDoc._attachments
                    binaryDoc._attachments.file.length.should.equal 29865
                    done()

        it 'does not reupload an existing file', (done) ->
            checksum = 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
            doc =
                path: 'chat-bis.jpg'
                mime: 'image/jpeg'
                checksum: checksum
            @remote.uploadBinary doc, (err, binary) ->
                should.not.exist err
                binary._id.should.equal checksum
                done()


    describe 'extractDirAndName', ->
        it 'returns the remote path and name', ->
            [path, name] = @remote.extractDirAndName 'foo'
            path.should.equal ''
            name.should.equal 'foo'
            [path, name] = @remote.extractDirAndName 'foo/bar'
            path.should.equal '/foo'
            name.should.equal 'bar'
            [path, name] = @remote.extractDirAndName 'foo/bar/baz'
            path.should.equal '/foo/bar'
            name.should.equal 'baz'


    describe 'createRemoteDoc', ->
        it 'transforms a local file in remote file', ->
            local =
                _id: 'FOO/BAR/BAZ.JPG'
                path: 'foo/bar/baz.jpg'
                docType: 'file'
                lastModification: "2015-11-12T13:14:32.384Z"
                creationDate: "2015-11-12T13:14:32.384Z"
                tags: ['qux']
                checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
                size: 12345
                class: 'image'
                mime: 'image/jpeg'
            remote =
                binary:
                    _id: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
                    _rev: '2-0123456789'
            doc = @remote.createRemoteDoc local, remote
            doc.should.have.properties
                path: '/foo/bar'
                name: 'baz.jpg'
                docType: 'file'
                lastModification: "2015-11-12T13:14:32.384Z"
                creationDate: "2015-11-12T13:14:32.384Z"
                tags: ['qux']
                checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
                size: 12345
                class: 'image'
                mime: 'image/jpeg'
                binary:
                    file:
                        id: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
                        rev: '2-0123456789'

        it 'transforms a local folder in remote folder', ->
            local =
                path: 'foo/bar/baz'
                docType: 'folder'
                lastModification: "2015-11-12T13:14:33.384Z"
                creationDate: "2015-11-12T13:14:33.384Z"
                tags: ['courge']
            doc = @remote.createRemoteDoc local
            doc.should.have.properties
                path: '/foo/bar'
                name: 'baz'
                docType: 'folder'
                lastModification: "2015-11-12T13:14:33.384Z"
                creationDate: "2015-11-12T13:14:33.384Z"
                tags: ['courge']

        it 'has the good path when in root folder', ->
            local =
                path: 'in-root-folder'
                docType: 'folder'
            doc = @remote.createRemoteDoc local
            doc.should.have.properties
                path: ''  # not '/' or '.'
                name: 'in-root-folder'
                docType: 'folder'

        it 'transforms an existing local file in remote file', ->
            local =
                path: 'foo/bar/baz.jpg'
                docType: 'file'
                lastModification: "2015-11-12T13:14:32.384Z"
                creationDate: "2015-11-12T13:14:32.384Z"
                checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
            remote =
                _id: 'fc4de46b9b42aaeb23521ff42e23a18e7a812bda'
                _rev: '1-951357'
                binary:
                    _id: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
                    _rev: '1-456951'
            doc = @remote.createRemoteDoc local, remote
            doc.should.have.properties
                _id:  remote._id
                _rev: remote._rev
                path: '/foo/bar'
                name: 'baz.jpg'
                docType: 'file'
                lastModification: "2015-11-12T13:14:32.384Z"
                creationDate: "2015-11-12T13:14:32.384Z"
                binary:
                    file:
                        id:  remote.binary._id
                        rev: remote.binary._rev


    describe 'cleanBinary', ->
        it 'deletes the binary if no longer referenced', (done) ->
            binary =
                _id: 'binary-5b1b'
                checksum: '5b1baec8306885df52fdf341efb0087f1a8ac81e'
                docType: 'Binary'
            @couch.put binary, (err, created) =>
                should.not.exist err
                @remote.cleanBinary binary._id, (err) =>
                    should.not.exist err
                    @couch.get binary.id, (err) ->
                        err.status.should.equal 404
                        done()

        it 'keeps the binary if referenced by a file', (done) ->
            binary =
                _id: 'binary-b410'
                checksum: 'b410ffdd571d6e86bb8e8bdd054df91e16dfa75e'
                docType: 'Binary'
            file =
                _id: 'A-FILE-WITH-B410'
                path: 'A-FILE-WITH-B410'
                docType: 'file'
                checksum: 'b410ffdd571d6e86bb8e8bdd054df91e16dfa75e'
                remote:
                    id: 'remote-file-b410'
                    rev: '1-123456'
                    binary:
                        _id: 'binary-410'
                        _rev: '1-123456'
            @pouch.db.put file, (err) =>
                should.not.exist err
                @couch.put binary, (err) =>
                    should.not.exist err
                    @remote.cleanBinary binary._id, (err) =>
                        should.not.exist err
                        @couch.get binary._id, (err, doc) ->
                            should.not.exist err
                            doc._id.should.equal binary._id
                            doc.checksum.should.equal binary.checksum
                            done()


    describe 'isUpToDate', ->
        it 'says if the remote file is up to date', ->
            doc =
                _id: 'foo/bar'
                _rev: '1-0123456'
                path: 'foo/bar'
                docType: 'file'
                checksum: '22f7aca0d717eb322d5ae1c97d8aa26eb440287b'
                sides:
                    local: 1
            @remote.isUpToDate(doc).should.be.false()
            doc.sides.remote = 2
            doc._rev = '2-0123456'
            @remote.isUpToDate(doc).should.be.true()
            doc.sides.local = 3
            doc._rev = '3-0123456'
            @remote.isUpToDate(doc).should.be.false()


    describe 'addFile', ->
        it 'adds a file to couchdb', (done) ->
            checksum = 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
            doc =
                path: 'cat2.jpg'
                docType: 'file'
                checksum: checksum
                creationDate: new Date()
                lastModification: new Date()
                size: 36901
            fixture = 'test/fixtures/chat-mignon-mod.jpg'
            @remote.other =
                createReadStream: (localDoc, callback) ->
                    stream = fs.createReadStream fixture
                    callback null, stream
            @remote.addFile doc, (err, created) =>
                should.not.exist err
                should.exist doc.remote._id
                should.exist doc.remote._rev
                should.exist doc.remote.binary
                @couch.get created.id, (err, file) =>
                    should.not.exist err
                    file.should.have.properties
                        path: ''
                        name: 'cat2.jpg'
                        docType: 'file'
                        creationDate: doc.creationDate.toISOString()
                        lastModification: doc.lastModification.toISOString()
                        size: 36901
                    should.exist file.binary.file.id
                    @couch.get file.binary.file.id, (err, binary) ->
                        should.not.exist err
                        binary.checksum.should.equal checksum
                        done()

        it 'does not reupload an existing file', (done) ->
            checksum = 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
            doc =
                path: 'backup/cat3.jpg'
                docType: 'file'
                checksum: checksum
                creationDate: new Date()
                lastModification: new Date()
                size: 36901
            same =
                _id: 'ORIGINAL/CAT3.JPG'
                path: 'ORIGINAL/CAT3.JPG'
                docType: 'file'
                checksum: checksum
                creationDate: new Date()
                lastModification: new Date()
                size: 36901
                remote:
                    _id: '05161241-ca73'
                    _rev: '1-abcdef'
                    binary:
                        _id: checksum
                        _rev: '1-951456'
                sides:
                    local: 1
                    remote: 1
            @pouch.db.put same, (err) =>
                should.not.exist err
                @remote.addFile doc, (err, created) =>
                    should.not.exist err
                    should.exist doc.remote._id
                    should.exist doc.remote._rev
                    should.exist doc.remote.binary
                    @couch.get created.id, (err, file) ->
                        should.not.exist err
                        file.should.have.properties
                            path: '/backup'
                            name: 'cat3.jpg'
                            docType: 'file'
                            creationDate: doc.creationDate.toISOString()
                            lastModification: doc.lastModification.toISOString()
                            size: 36901
                        done()


    describe 'addFolder', ->
        it 'adds a folder to couchdb', (done) ->
            doc =
                path: 'couchdb-folder/folder-1'
                docType: 'folder'
                creationDate: new Date()
                lastModification: new Date()
            @remote.addFolder doc, (err, created) =>
                should.not.exist err
                should.exist doc.remote._id
                should.exist doc.remote._rev
                @couch.get created.id, (err, folder) ->
                    should.not.exist err
                    folder.should.have.properties
                        path: '/couchdb-folder'
                        name: 'folder-1'
                        docType: 'folder'
                        creationDate: doc.creationDate.toISOString()
                        lastModification: doc.lastModification.toISOString()
                    done()


    describe 'overwriteFile', ->
        it 'overwrites the binary content', (done) ->
            couchHelpers.createFile @couch, 6, (err, created) =>
                should.not.exist err
                doc =
                    path: 'couchdb-folder/file-6'
                    docType: 'file'
                    checksum: '9999999999999999999999999999999999999926'
                    lastModification: '2015-11-16T16:12:01.002Z'
                old =
                    path: 'couchdb-folder/file-6'
                    docType: 'file'
                    checksum: '1111111111111111111111111111111111111126'
                    remote:
                        _id: created.id
                        _rev: created.rev
                        binary:
                            _id: '1111111111111111111111111111111111111126'
                            _rev: '1-852147'
                binaryDoc =
                    _id: old.checksum
                    checksum: old.checksum
                @couch.put binaryDoc, (err) =>
                    should.not.exist err
                    @remote.overwriteFile doc, old, (err) =>
                        should.not.exist err
                        @couch.get doc.remote._id, (err, file) =>
                            should.not.exist err
                            file.should.have.properties
                                _id: created.id
                                docType: 'file'
                                path: '/couchdb-folder'
                                name: 'file-6'
                                lastModification: doc.lastModification
                            doc.remote._rev.should.equal file._rev
                            doc.remote.binary.should.have.properties
                                _id: doc.checksum
                                _rev: file.binary.file.rev
                            file.binary.file.id.should.equal doc.checksum
                            @couch.get file.binary.file.id, (err, binary) ->
                                should.not.exist err
                                binary.checksum.should.equal doc.checksum
                                done()


    describe 'updateFileMetadata', ->
        it 'updates the lastModification', (done) ->
            couchHelpers.createFile @couch, 7, (err, created) =>
                should.not.exist err
                doc =
                    path: 'couchdb-folder/file-7'
                    docType: 'file'
                    checksum: '1111111111111111111111111111111111111127'
                    lastModification: '2015-11-16T16:13:01.001Z'
                old =
                    path: 'couchdb-folder/file-7'
                    docType: 'file'
                    checksum: '1111111111111111111111111111111111111127'
                    remote:
                        _id: created.id
                        _rev: created.rev
                        binary:
                            _id: '1111111111111111111111111111111111111127'
                            _rev: '1-852654'
                @remote.updateFileMetadata doc, old, (err) =>
                    should.not.exist err
                    @couch.get doc.remote._id, (err, file) ->
                        should.not.exist err
                        file.should.have.properties
                            _id: created.id
                            docType: 'file'
                            path: '/couchdb-folder'
                            name: 'file-7'
                            lastModification: doc.lastModification
                            binary:
                                file:
                                    id: doc.remote.binary._id
                                    rev: doc.remote.binary._rev
                        doc.remote._rev.should.equal file._rev
                        done()


    describe 'updateFolder', ->
        it 'updates the metadata of a folder in couchdb', (done) ->
            couchHelpers.createFolder @couch, 2, (err, created) =>
                doc =
                    path: 'couchdb-folder/folder-2'
                    docType: 'folder'
                    creationDate: new Date()
                    lastModification: new Date()
                old =
                    path: 'couchdb-folder/folder-2'
                    docType: 'folder'
                    remote:
                        _id: created.id
                        _rev: created.rev
                @remote.updateFolder doc, old, (err, updated) =>
                    should.not.exist err
                    doc.remote._id.should.equal old.remote._id
                    doc.remote._rev.should.not.equal created.rev
                    @couch.get updated.id, (err, folder) ->
                        should.not.exist err
                        folder.should.have.properties
                            path: '/couchdb-folder'
                            name: 'folder-2'
                            docType: 'folder'
                            lastModification: doc.lastModification.toISOString()
                        done()

        it 'adds a folder to couchdb if the folder does not exist', (done) ->
            doc =
                path: 'couchdb-folder/folder-3'
                docType: 'folder'
                creationDate: new Date()
                lastModification: new Date()
            @remote.updateFolder doc, {}, (err, created) =>
                should.not.exist err
                @couch.get created.id, (err, folder) ->
                    should.not.exist err
                    folder.should.have.properties
                        path: '/couchdb-folder'
                        name: 'folder-3'
                        docType: 'folder'
                        creationDate: doc.creationDate.toISOString()
                        lastModification: doc.lastModification.toISOString()
                    done()


    describe 'moveFile', ->
        it 'moves the file', (done) ->
            checksum = 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
            binary =
                _id: checksum
                _rev: '1-0123456789'
            old =
                path: 'cat6.jpg'
                docType: 'file'
                checksum: checksum
                creationDate: new Date()
                lastModification: new Date()
                size: 36901
            doc =
                path: 'moved-to/cat7.jpg'
                docType: 'file'
                checksum: checksum
                creationDate: new Date()
                lastModification: new Date()
                size: 36901
            remoteDoc = @remote.createRemoteDoc old, binary: binary
            @couch.put remoteDoc, (err, created) =>
                should.not.exist err
                old.remote =
                    _id: created.id
                    _rev: created.rev
                    binary:
                        _id: checksum
                        _rev: binary._rev
                @remote.moveFile doc, old, (err, moved) =>
                    should.not.exist err
                    moved.id.should.equal old.remote._id
                    moved.rev.should.not.equal old.remote._rev
                    @couch.get moved.id, (err, file) ->
                        should.not.exist err
                        file.should.have.properties
                            path: '/moved-to'
                            name: 'cat7.jpg'
                            docType: 'file'
                            lastModification: doc.lastModification.toISOString()
                            size: 36901
                            binary:
                                file:
                                    id: binary._id
                                    rev: binary._rev
                        done()


    describe 'moveFolder', ->
        it 'moves the folder in couchdb', (done) ->
            couchHelpers.createFolder @couch, 4, (err, created) =>
                doc =
                    path: 'couchdb-folder/folder-5'
                    docType: 'folder'
                    creationDate: new Date()
                    lastModification: new Date()
                    remote:
                        _id: created.id
                        _rev: created.rev
                old =
                    path: 'couchdb-folder/folder-4'
                    docType: 'folder'
                    remote:
                        _id: created.id
                        _rev: created.rev
                @remote.moveFolder doc, old, (err, created) =>
                    should.not.exist err
                    @couch.get created.id, (err, folder) ->
                        should.not.exist err
                        folder.should.have.properties
                            path: '/couchdb-folder'
                            name: 'folder-5'
                            docType: 'folder'
                            lastModification: doc.lastModification.toISOString()
                        done()

        it 'adds a folder to couchdb if the folder does not exist', (done) ->
            doc =
                path: 'couchdb-folder/folder-7'
                docType: 'folder'
                creationDate: new Date()
                lastModification: new Date()
            old =
                path: 'couchdb-folder/folder-6'
                docType: 'folder'
            @remote.moveFolder doc, old, (err, created) =>
                should.not.exist err
                @couch.get created.id, (err, folder) ->
                    should.not.exist err
                    folder.should.have.properties
                        path: '/couchdb-folder'
                        name: 'folder-7'
                        docType: 'folder'
                        creationDate: doc.creationDate.toISOString()
                        lastModification: doc.lastModification.toISOString()
                    done()


    describe 'deleteFile', ->
        it 'deletes a file in couchdb', (done) ->
            couchHelpers.createFile @couch, 8, (err, file) =>
                should.not.exist err
                doc =
                    path: 'couchdb-folder/file-8'
                    _deleted: true
                    docType: 'file'
                    checksum: '1111111111111111111111111111111111111128'
                    remote:
                        _id: file.id
                        _rev: file.rev
                        binary:
                            _id: '1111111111111111111111111111111111111128'
                            _rev: '1-754123'
                @couch.get doc.remote._id, (err) =>
                    should.not.exist err
                    @remote.deleteFile doc, (err) =>
                        should.not.exist err
                        @couch.get doc.remote._id, (err) ->
                            err.status.should.equal 404
                            done()

        it 'deletes also the associated binary', (done) ->
            couchHelpers.createFile @couch, 9, (err, file) =>
                should.not.exist err
                doc =
                    path: 'couchdb-folder/file-9'
                    _deleted: true
                    docType: 'file'
                    checksum: '1111111111111111111111111111111111111129'
                    remote:
                        _id: file.id
                        _rev: file.rev
                        binary:
                            _id: '1111111111111111111111111111111111111129'
                            _rev: '1-954862'
                binary =
                    _id: doc.checksum
                    checksum: doc.checksum
                @couch.put binary, (err, uploaded) =>
                    should.not.exist err
                    doc.remote.binary =
                        _id: uploaded.id
                        _rev: uploaded.rev
                    @remote.deleteFile doc, (err) =>
                        should.not.exist err
                        @couch.get binary._id, (err) ->
                            err.status.should.equal 404
                            done()


    describe 'deleteFolder', ->
        it 'deletes a folder in couchdb', (done) ->
            couchHelpers.createFolder @couch, 9, (err, folder) =>
                should.not.exist err
                doc =
                    path: 'couchdb-folder/folder-9'
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


    describe 'resolveConflict', ->
        it 'renames the file/folder', (done) ->
            checksum = 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
            binary =
                _id: checksum
                _rev: '1-0123456789'
            src =
                path: 'cat9.jpg'
                docType: 'file'
                checksum: checksum
                creationDate: new Date().toISOString()
                lastModification: new Date().toISOString()
                size: 36901
            dst =
                path: 'cat-conflict-2015-12-01T01:02:03Z.jpg'
                docType: 'file'
                checksum: checksum
                creationDate: src.creationDate
                lastModification: src.lastModification
                size: 36901
            remoteDoc = @remote.createRemoteDoc src, binary: binary
            @couch.put remoteDoc, (err, created) =>
                should.not.exist err
                src.remote =
                    _id: created.id
                    _rev: created.rev
                    binary:
                        _id: checksum
                        _rev: binary._rev
                @remote.resolveConflict dst, src, (err, moved) =>
                    should.not.exist err
                    @couch.get moved.id, (err, file) ->
                        should.not.exist err
                        file.should.have.properties
                            path: ''
                            name: dst.path
                            docType: 'file'
                            lastModification: dst.lastModification
                            size: 36901
                            binary:
                                file:
                                    id: binary._id
                                    rev: binary._rev
                        done()
