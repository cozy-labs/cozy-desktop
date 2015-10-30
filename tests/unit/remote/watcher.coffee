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

        it 'calls putDoc for a new doc', (done) ->
            @merge.putDoc = sinon.stub().yields null
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
                @merge.putDoc.called.should.be.true()
                args = @merge.putDoc.args[0][0]
                args.should.have.properties
                    _id: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary:
                            _id: doc.binary.file.id
                            _rev: doc.binary.file.rev
                args.should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls putDoc when tags are updated', (done) ->
            @merge.putDoc = sinon.stub().yields null
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
                @merge.putDoc.called.should.be.true()
                args = @merge.putDoc.args[0][0]
                args.should.have.properties
                    _id: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary:
                            _id: doc.binary.file.id
                            _rev: doc.binary.file.rev
                args.should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls putDoc when content is overwritten', (done) ->
            @merge.putDoc = sinon.stub().yields null
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
                @merge.putDoc.called.should.be.true()
                args = @merge.putDoc.args[0][0]
                args.should.have.properties
                    _id: 'my-folder/file-1'
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary:
                            _id: doc.binary.file.id
                            _rev: doc.binary.file.rev
                args.should.not.have.properties ['_rev', 'path', 'name']
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
                src = @merge.moveDoc.args[0][1]
                src.should.have.properties
                    _id: 'my-folder/file-2'
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: '12345678902'
                dst = @merge.moveDoc.args[0][0]
                dst.should.have.properties
                    _id: path.join doc.path, doc.name
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
                src = @merge.moveDoc.args[0][1]
                src.should.have.properties
                    _id: 'my-folder/file-2'
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: '12345678902'
                dst = @merge.moveDoc.args[0][0]
                dst.should.have.properties
                    _id: path.join doc.path, doc.name
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

        it 'calls deletedDoc&putDoc when file has changed completely', (done) ->
            @merge.deleteDoc = sinon.stub().yields null
            @merge.putDoc = sinon.stub().yields null
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
                id = @merge.deleteDoc.args[0][0]._id
                id.should.equal 'my-folder/file-3'
                @merge.putDoc.called.should.be.true()
                args = @merge.putDoc.args[0][0]
                args.should.have.properties
                    _id: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                        binary:
                            _id: doc.binary.file.id
                            _rev: doc.binary.file.rev
                args.should.not.have.properties ['_rev', 'path', 'name']
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
                id = @merge.deleteDoc.args[0][0]._id
                id.should.equal 'my-folder/file-1'
                done()

        it 'calls putDoc for folder created by the mobile app', (done) ->
            @merge.putDoc = sinon.stub().yields null
            doc =
                _id: "913F429E-5609-C636-AE9A-CD00BD138B13"
                _rev: "1-7786acf12a11fad6ad1eeb861953e0d8"
                docType: "Folder"
                name: "Photos from devices"
                path: ""
                lastModification: "2015-09-29T14:13:33.384Z"
                creationDate: "2015-09-29T14:13:33.384Z"
                tags: []
                binary:
                    file:
                        id: "0365C957-C5F5-3E88-A7F2-275D5F9AE5F2"
                        rev: "2-961fccd38fd7b2e5a2d6916f5e8fc4a1"
                    thumb:
                        id: "883f98d550b30fe64ed500538373ca51"
                        rev: "2-b3198de4001e1d1c82f9c9a6d99be9e3"
            @watcher.onChange doc, (err) =>
                should.not.exist err
                @merge.putDoc.called.should.be.true()
                @merge.putDoc.args[0][0].should.have.properties
                    _id: 'Photos from devices'
                    docType: 'folder'
                    lastModification: "2015-09-29T14:13:33.384Z"
                    creationDate: "2015-09-29T14:13:33.384Z"
                    tags: []
                    remote:
                        _id: "913F429E-5609-C636-AE9A-CD00BD138B13"
                        _rev: "1-7786acf12a11fad6ad1eeb861953e0d8"
                        binary:
                            _id: "0365C957-C5F5-3E88-A7F2-275D5F9AE5F2"
                            _rev: "2-961fccd38fd7b2e5a2d6916f5e8fc4a1"
                done()
