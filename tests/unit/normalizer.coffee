sinon  = require 'sinon'
should = require 'should'

Normalizer = require '../../backend/normalizer'


describe 'Normalizer', ->

    beforeEach 'instanciate normalizer', ->
        @pouch = {}
        @normalizer = new Normalizer @pouch


    describe 'Helpers', ->

        describe 'invalidPathOrName', ->
            it 'returns true if the path is incorrect', ->
                ret = @normalizer.invalidPathOrName path: '../foo', name: 'bar'
                ret.should.be.true()
                ret = @normalizer.invalidPathOrName path: 'foo/..', name: 'bar'
                ret.should.be.true()
                ret = @normalizer.invalidPathOrName path: 'f/../oo', name: 'bar'
                ret.should.be.true()

            it 'returns true if the name is incorrect', ->
                ret = @normalizer.invalidPathOrName path: 'foo', name: ''
                ret.should.be.true()
                ret = @normalizer.invalidPathOrName path: 'foo', name: '.'
                ret.should.be.true()
                ret = @normalizer.invalidPathOrName path: 'foo', name: '..'
                ret.should.be.true()
                ret = @normalizer.invalidPathOrName path: 'foo', name: '/bar'
                ret.should.be.true()
                ret = @normalizer.invalidPathOrName path: 'foo', name: 'baz/'
                ret.should.be.true()
                ret = @normalizer.invalidPathOrName path: 'foo', name: 'bar/baz'
                ret.should.be.true()

            it 'returns false if everything is OK', ->
                ret = @normalizer.invalidPathOrName path: '', name: 'foo'
                ret.should.be.false()
                ret = @normalizer.invalidPathOrName path: 'foo', name: 'bar'
                ret.should.be.false()
                ret = @normalizer.invalidPathOrName path: 'foo/bar', name: 'baz'
                ret.should.be.false()

        describe 'invalidChecksum', ->
            it 'returns true if the checksum is missing', ->
                ret = @normalizer.invalidChecksum {}
                ret.should.be.true()
                ret = @normalizer.invalidChecksum checksum: null
                ret.should.be.true()
                ret = @normalizer.invalidChecksum checksum: undefined
                ret.should.be.true()

            it 'returns true if the checksum is incorrect', ->
                ret = @normalizer.invalidChecksum checksum: ''
                ret.should.be.true()
                ret = @normalizer.invalidChecksum checksum: 'f00'
                ret.should.be.true()
                md5 = '68b329da9893e34099c7d8ad5cb9c940'
                ret = @normalizer.invalidChecksum checksum: md5
                ret.should.be.true()

            it 'returns false if the checksum is OK', ->
                doc = checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                ret = @normalizer.invalidChecksum doc
                ret.should.be.false()
                doc = checksum: 'ADC83B19E793491B1C6EA0FD8B46CD9F32E592FC'
                ret = @normalizer.invalidChecksum doc
                ret.should.be.false()

        describe 'ensureFolderExist', ->
            it 'works when in the root folder', (done) ->
                @normalizer.ensureFolderExist path: '', name: 'foo', (err) ->
                    should.not.exist err
                    done()

            it 'works if the parent directory is present', (done) ->
                stub = sinon.stub().yields null, path: '', name: 'foo'
                @pouch.folders = ->
                    get: stub
                @normalizer.ensureFolderExist path: 'foo', name: 'b', (err) ->
                    should.not.exist err
                    stub.calledWith('foo').should.be.true()
                    done()

            it 'creates the parent directory if missing', (done) ->
                stub = sinon.stub().yields 'not found'
                @pouch.folders = ->
                    get: stub
                @normalizer.addFolder = sinon.stub().yields null, 'OK'
                @normalizer.ensureFolderExist path: 'foo', name: 'b', (err) =>
                    should.not.exist err
                    stub.calledWith('foo').should.be.true()
                    @normalizer.addFolder.called.should.be.true()
                    parent = path: '.', name: 'foo'
                    @normalizer.addFolder.calledWith(parent).should.be.true()
                    done()

        describe 'emptyFolder', ->
            it 'does nothing in an empty folder', (done) ->
                @pouch.byPath = sinon.stub().yields null, []
                @normalizer.emptyFolder path: 'foo', name: 'bar', (err) =>
                    should.not.exist err
                    @pouch.byPath.calledWith('foo/bar').should.be.true()
                    done()

            it 'remove files in the folder', (done) ->
                files = [
                    { docType: 'file', path: 'foo/bar', name: 'baz' }
                    { docType: 'file', path: 'foo/bar', name: 'qux' }
                    { docType: 'file', path: 'foo/bar', name: 'quux' }
                ]
                @pouch.byPath = sinon.stub().yields null, files
                @pouch.db = remove: sinon.stub().yields null
                @normalizer.emptyFolder path: 'foo', name: 'bar', (err) =>
                    should.not.exist err
                    @pouch.byPath.calledWith('foo/bar').should.be.true()
                    for file in files
                        @pouch.db.remove.calledWith(file).should.be.true()
                    done()

            it 'remove nested folders', (done) ->
                folders = [
                    { docType: 'folder', path: 'foo/bar', name: 'baz' }
                    { docType: 'folder', path: 'foo/bar', name: 'qux' }
                    { docType: 'folder', path: 'foo/bar', name: 'quux' }
                ]
                @pouch.byPath = sinon.stub().yields null, folders
                @normalizer.deleteFolder = sinon.stub().yields null
                @normalizer.emptyFolder path: 'foo', name: 'bar', (err) =>
                    should.not.exist err
                    @pouch.byPath.calledWith('foo/bar').should.be.true()
                    for f in folders
                        @normalizer.deleteFolder.calledWith(f).should.be.true()
                    done()


    describe 'Actions', ->

        describe 'addFile', ->
            it 'expects a doc with a valid path and name', (done) ->
                @normalizer.addFile path: 'foo', name: null, (err) ->
                    err.should.equal 'Invalid path or name'
                    done()

            it 'expects a doc with a checksum', (done) ->
                doc =
                    path: 'foo'
                    name: 'bar'
                    checksum: ''
                @normalizer.addFile doc, (err) ->
                    err.should.equal 'Invalid checksum'
                    done()

            it 'saves the new file', (done) ->
                @normalizer.ensureFolderExist = sinon.stub().yields null
                @pouch.db = put: sinon.stub().yields null
                doc =
                    id: '123'
                    path: 'foo'
                    name: 'bar'
                    checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                    docType: 'file'
                    creationDate: new Date()
                    lastModification: new Date()
                    tags: ['courge', 'quux']
                @normalizer.addFile doc, (err) =>
                    should.not.exist err
                    @pouch.db.put.calledWith(doc).should.be.true()
                    done()

            it 'adds missing fields', (done) ->
                @normalizer.ensureFolderExist = sinon.stub().yields null
                @pouch.db = put: sinon.stub().yields null
                doc =
                    path: 'foo'
                    name: 'bar'
                    checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                @normalizer.addFile doc, (err) =>
                    should.not.exist err
                    args = @pouch.db.put.args[0][0]
                    should.exist args.id
                    args.docType.should.equal 'file'
                    should.exist args.creationDate
                    should.exist args.lastModification
                    done()

        describe 'addFolder', ->
            it 'expects a doc with a valid path and name', (done) ->
                @normalizer.addFolder path: 'foo', name: null, (err) ->
                    err.should.equal 'Invalid path or name'
                    done()

            it 'saves the new folder', (done) ->
                @normalizer.ensureFolderExist = sinon.stub().yields null
                @pouch.db = put: sinon.stub().yields null
                doc =
                    id: '456'
                    path: 'foo'
                    name: 'baz'
                    docType: 'folder'
                    creationDate: new Date()
                    lastModification: new Date()
                    tags: ['courge', 'quux']
                @normalizer.addFolder doc, (err) =>
                    should.not.exist err
                    @pouch.db.put.calledWith(doc).should.be.true()
                    done()

            it 'adds missing fields', (done) ->
                @normalizer.ensureFolderExist = sinon.stub().yields null
                @pouch.db = put: sinon.stub().yields null
                doc =
                    path: 'foo'
                    name: 'bar'
                @normalizer.addFolder doc, (err) =>
                    should.not.exist err
                    args = @pouch.db.put.args[0][0]
                    should.exist args.id
                    args.docType.should.equal 'folder'
                    should.exist args.creationDate
                    should.exist args.lastModification
                    done()

        describe 'moveFile', ->
            it 'TODO'

        describe 'moveFolder', ->
            it 'TODO'

        describe 'deleteFile', ->
            it 'TODO'

        describe 'deleteFolder', ->
            it 'TODO'
