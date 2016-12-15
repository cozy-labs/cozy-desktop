async  = require 'async'
clone  = require 'lodash.clone'
fs     = require 'fs-extra'
path   = require 'path'
sinon  = require 'sinon'
should = require 'should'

configHelpers = require '../../helpers/config'
couchHelpers  = require '../../helpers/couch'
pouchHelpers  = require '../../helpers/pouch'

Prep    = require '../../../src/prep'
Watcher = require '../../../src/remote/watcher'


describe "RemoteWatcher Tests", ->

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    before 'start couch server', couchHelpers.startServer
    before 'instanciate couch', couchHelpers.createCouchClient
    before 'instanciate remote watcher', ->
        @prep    = invalidPath: Prep::invalidPath
        @watcher = new Watcher @couch, @prep, @pouch
    after 'stop couch server', couchHelpers.stopServer
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig

    before (done) ->
        pouchHelpers.createParentFolder @pouch, =>
            async.eachSeries [1..3], (i, callback) =>
                pouchHelpers.createFolder @pouch, i, =>
                    pouchHelpers.createFile @pouch, i, callback
            , done


    describe 'onChange', ->
        it 'does not fail when the path is missing', (done) ->
            doc =
                _id: '12345678904'
                _rev: '1-abcdef'
                docType: 'file'
                binary:
                    file:
                        id: '123'
            @watcher.onChange doc, (err) ->
                should.exist err
                err.message.should.equal 'Invalid path/name'
                done()

        it 'does not fail on ghost file', (done) ->
            sinon.stub(@watcher, 'putDoc')
            doc =
                _id: '12345678904'
                _rev: '1-abcdef'
                docType: 'file'
                path: 'foo'
                name: 'bar'
            @watcher.onChange doc, (err) =>
                @watcher.putDoc.called.should.be.false()
                @watcher.putDoc.restore()
                done()

        it 'calls addDoc for a new doc', (done) ->
            @prep.addDoc = sinon.stub().yields null
            doc =
                _id: '12345678905'
                _rev: '1-abcdef'
                docType: 'file'
                path: 'my-folder'
                name: 'file-5'
                checksum: '9999999999999999999999999999999999999999'
                tags: []
                localPath: '/storage/DCIM/IMG_123.jpg'
                binary:
                    file:
                        id: '1234'
                        rev: '5-6789'
            @watcher.onChange clone(doc), (err) =>
                should.not.exist err
                @prep.addDoc.called.should.be.true()
                args = @prep.addDoc.args[0]
                args[0].should.equal 'remote'
                args[1].should.have.properties
                    path: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    localPath: doc.localPath
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary:
                            _id: doc.binary.file.id
                            _rev: doc.binary.file.rev
                args[1].should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls updateDoc when tags are updated', (done) ->
            @prep.updateDoc = sinon.stub().yields null
            doc =
                _id: '12345678901'
                _rev: '2-abcdef'
                docType: 'file'
                path: 'my-folder'
                name: 'file-1'
                checksum: '1111111111111111111111111111111111111111'
                tags: ['foo', 'bar', 'baz']
                binary:
                    file:
                        id: '1234'
                        rev: '5-6789'
            @watcher.onChange clone(doc), (err) =>
                should.not.exist err
                @prep.updateDoc.called.should.be.true()
                args = @prep.updateDoc.args[0]
                args[0].should.equal 'remote'
                args[1].should.have.properties
                    path: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary:
                            _id: doc.binary.file.id
                            _rev: doc.binary.file.rev
                args[1].should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls updateDoc when content is overwritten', (done) ->
            @prep.updateDoc = sinon.stub().yields null
            doc =
                _id: '12345678901'
                _rev: '3-abcdef'
                docType: 'file'
                path: '/my-folder'
                name: 'file-1'
                checksum: '9999999999999999999999999999999999999999'
                tags: ['foo', 'bar', 'baz']
                binary:
                    file:
                        id: '4321'
                        rev: '9-8765'
            @watcher.onChange clone(doc), (err) =>
                should.not.exist err
                @prep.updateDoc.called.should.be.true()
                args = @prep.updateDoc.args[0]
                args[0].should.equal 'remote'
                args[1].should.have.properties
                    path: 'my-folder/file-1'
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary:
                            _id: doc.binary.file.id
                            _rev: doc.binary.file.rev
                args[1].should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls moveDoc when file is renamed', (done) ->
            @prep.moveDoc = sinon.stub().yields null
            doc =
                _id: '12345678902'
                _rev: '4-abcdef'
                docType: 'file'
                path: 'my-folder'
                name: 'file-2-bis'
                checksum: '1111111111111111111111111111111111111112'
                tags: []
                binary:
                    file:
                        id: '4321'
                        rev: '9-8765'
            @watcher.onChange clone(doc), (err) =>
                should.not.exist err
                @prep.moveDoc.called.should.be.true()
                args = @prep.moveDoc.args[0]
                args[0].should.equal 'remote'
                src = args[2]
                src.should.have.properties
                    path: 'my-folder/file-2'
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: '12345678902'
                dst = args[1]
                dst.should.have.properties
                    path: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary:
                            _id: doc.binary.file.id
                            _rev: doc.binary.file.rev
                dst.should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls moveDoc when file is moved', (done) ->
            @prep.moveDoc = sinon.stub().yields null
            doc =
                _id: '12345678902'
                _rev: '5-abcdef'
                docType: 'file'
                path: 'another-folder/in/some/place'
                name: 'file-2-ter'
                checksum: '1111111111111111111111111111111111111112'
                tags: []
                binary:
                    file:
                        id: '4321'
                        rev: '9-8765'
            @watcher.onChange clone(doc), (err) =>
                should.not.exist err
                @prep.moveDoc.called.should.be.true()
                src = @prep.moveDoc.args[0][2]
                src.should.have.properties
                    path: 'my-folder/file-2'
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: '12345678902'
                dst = @prep.moveDoc.args[0][1]
                dst.should.have.properties
                    path: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary:
                            _id: doc.binary.file.id
                            _rev: doc.binary.file.rev
                dst.should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls deletedDoc&addDoc when file has changed completely', (done) ->
            @prep.deleteDoc = sinon.stub().yields null
            @prep.addDoc = sinon.stub().yields null
            doc =
                _id: '12345678903'
                _rev: '6-abcdef'
                docType: 'file'
                path: 'another-folder/in/some/place'
                name: 'file-3-bis'
                checksum: '8888888888888888888888888888888888888888'
                tags: []
                binary:
                    file:
                        id: '1472'
                        rev: '5-8369'
            @watcher.onChange clone(doc), (err) =>
                should.not.exist err
                @prep.deleteDoc.called.should.be.true()
                id = @prep.deleteDoc.args[0][1].path
                id.should.equal 'my-folder/file-3'
                @prep.addDoc.called.should.be.true()
                args = @prep.addDoc.args[0]
                args[0].should.equal 'remote'
                args[1].should.have.properties
                    path: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary:
                            _id: doc.binary.file.id
                            _rev: doc.binary.file.rev
                args[1].should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls deleteDoc for a deleted doc', (done) ->
            @prep.deleteDoc = sinon.stub().yields null
            doc =
                _id: '12345678901'
                _rev: '7-abcdef'
                _deleted: true
            @watcher.onChange doc, (err) =>
                should.not.exist err
                @prep.deleteDoc.called.should.be.true()
                id = @prep.deleteDoc.args[0][1].path
                id.should.equal 'my-folder/file-1'
                done()

        it 'calls addDoc for folder created by the mobile app', (done) ->
            @prep.addDoc = sinon.stub().yields null
            doc =
                _id: "913F429E-5609-C636-AE9A-CD00BD138B13"
                _rev: "1-7786acf12a11fad6ad1eeb861953e0d8"
                docType: "Folder"
                name: "Photos from devices"
                path: ""
                lastModification: "2015-09-29T14:13:33.384Z"
                creationDate: "2015-09-29T14:13:33.384Z"
                tags: []
            @watcher.onChange doc, (err) =>
                should.not.exist err
                @prep.addDoc.called.should.be.true()
                @prep.addDoc.args[0][1].should.have.properties
                    path: 'Photos from devices'
                    docType: 'folder'
                    lastModification: "2015-09-29T14:13:33.384Z"
                    creationDate: "2015-09-29T14:13:33.384Z"
                    tags: []
                    remote:
                        _id: "913F429E-5609-C636-AE9A-CD00BD138B13"
                        _rev: "1-7786acf12a11fad6ad1eeb861953e0d8"
                done()

    describe 'removeRemote', ->
        it 'remove the association between a document and its remote', (done) ->
            doc =
                _id: 'removeRemote'
                path: 'removeRemote'
                docType: 'file'
                checksum: 'd3e2163ccd0c497969233a6bd2a4ac843fb8165e'
                sides:
                    local: 2
                    remote: 1
            @pouch.db.put doc, (err) =>
                should.not.exist err
                @pouch.db.get doc._id, (err, was) =>
                    should.not.exist err
                    @watcher.removeRemote was, (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err, actual) ->
                            should.not.exist err
                            should.not.exist actual.sides.remote
                            should.not.exist actual.remote
                            actual._id.should.equal doc._id
                            actual.sides.local.should.equal 2
                            done()
            return
