async  = require 'async'
clone  = require 'lodash.clone'
fs     = require 'fs-extra'
path   = require 'path'
sinon  = require 'sinon'
should = require 'should'

configHelpers = require '../../helpers/config'
couchHelpers  = require '../../helpers/couch'
pouchHelpers  = require '../../helpers/pouch'

Merge   = require '../../../backend/merge'
Watcher = require '../../../backend/remote/watcher'


describe "RemoteWatcher Tests", ->

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    before 'start couch server', couchHelpers.startServer
    before 'instanciate couch', couchHelpers.createCouchClient
    before 'instanciate remote watcher', ->
        @merge   = invalidId: Merge::invalidId
        @watcher = new Watcher @couch, @merge, @pouch
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
            @merge.addDoc = sinon.stub().yields null
            doc =
                _id: '12345678905'
                _rev: '1-abcdef'
                docType: 'file'
                path: 'my-folder'
                name: 'file-5'
                checksum: '9999999999999999999999999999999999999999'
                tags: []
                binary:
                    file:
                        id: '1234'
                        rev: '5-6789'
            @watcher.onChange clone(doc), (err) =>
                should.not.exist err
                @merge.addDoc.called.should.be.true()
                args = @merge.addDoc.args[0]
                args[0].should.equal 'remote'
                args[1].should.have.properties
                    _id: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary: doc.binary.file.id
                args[1].should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls updateDoc when tags are updated', (done) ->
            @merge.updateDoc = sinon.stub().yields null
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
                @merge.updateDoc.called.should.be.true()
                args = @merge.updateDoc.args[0]
                args[0].should.equal 'remote'
                args[1].should.have.properties
                    _id: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary: doc.binary.file.id
                args[1].should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls updateDoc when content is overwritten', (done) ->
            @merge.updateDoc = sinon.stub().yields null
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
                @merge.updateDoc.called.should.be.true()
                args = @merge.updateDoc.args[0]
                args[0].should.equal 'remote'
                args[1].should.have.properties
                    _id: 'my-folder/file-1'
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary: doc.binary.file.id
                args[1].should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls moveDoc when file is renamed', (done) ->
            @merge.moveDoc = sinon.stub().yields null
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
                @merge.moveDoc.called.should.be.true()
                args = @merge.moveDoc.args[0]
                args[0].should.equal 'remote'
                src = args[2]
                src.should.have.properties
                    _id: 'my-folder/file-2'
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: '12345678902'
                dst = args[1]
                dst.should.have.properties
                    _id: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary: doc.binary.file.id
                dst.should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls moveDoc when file is moved', (done) ->
            @merge.moveDoc = sinon.stub().yields null
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
                @merge.moveDoc.called.should.be.true()
                src = @merge.moveDoc.args[0][2]
                src.should.have.properties
                    _id: 'my-folder/file-2'
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: '12345678902'
                dst = @merge.moveDoc.args[0][1]
                dst.should.have.properties
                    _id: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary: doc.binary.file.id
                dst.should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls deletedDoc&addDoc when file has changed completely', (done) ->
            @merge.deleteDoc = sinon.stub().yields null
            @merge.addDoc = sinon.stub().yields null
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
                @merge.deleteDoc.called.should.be.true()
                id = @merge.deleteDoc.args[0][1]._id
                id.should.equal 'my-folder/file-3'
                @merge.addDoc.called.should.be.true()
                args = @merge.addDoc.args[0]
                args[0].should.equal 'remote'
                args[1].should.have.properties
                    _id: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary: doc.binary.file.id
                args[1].should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls deleteDoc for a deleted doc', (done) ->
            @merge.deleteDoc = sinon.stub().yields null
            doc =
                _id: '12345678901'
                _rev: '7-abcdef'
                _deleted: true
            @watcher.onChange doc, (err) =>
                should.not.exist err
                @merge.deleteDoc.called.should.be.true()
                id = @merge.deleteDoc.args[0][1]._id
                id.should.equal 'my-folder/file-1'
                done()

        it 'calls addDoc for folder created by the mobile app', (done) ->
            @merge.addDoc = sinon.stub().yields null
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
                @merge.addDoc.called.should.be.true()
                @merge.addDoc.args[0][1].should.have.properties
                    _id: 'Photos from devices'
                    docType: 'folder'
                    lastModification: "2015-09-29T14:13:33.384Z"
                    creationDate: "2015-09-29T14:13:33.384Z"
                    tags: []
                    remote:
                        _id: "913F429E-5609-C636-AE9A-CD00BD138B13"
                        _rev: "1-7786acf12a11fad6ad1eeb861953e0d8"
                done()
