async  = require 'async'
sinon  = require 'sinon'
should = require 'should'

Normalizer = require '../../backend/normalizer'
Pouch      = require '../../backend/pouch'

configHelpers = require '../helpers/config'
pouchHelpers  = require '../helpers/pouch'


describe 'Normalizer', ->

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    beforeEach 'instanciate normalizer', ->
        @normalizer = new Normalizer @pouch
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig


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

            it 'returns false for paths witna  leading slash', ->
                ret = @normalizer.invalidPathOrName path: '/foo', name: 'baz'
                ret.should.be.false()
                ret = @normalizer.invalidPathOrName path: '/foo/baz', name: 'bar'
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
                doc =
                    _id: Pouch.newId()
                    docType: 'folder'
                    path: ''
                    name: 'foo'
                child =
                    _id: Pouch.newId()
                    docType: 'folder'
                    path: 'foo',
                    name: 'b'
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @normalizer.ensureFolderExist child, (err) ->
                        should.not.exist err
                        done()

            it 'creates the parent directory if missing', (done) ->
                @normalizer.putFolder = sinon.stub().yields null, 'OK'
                @normalizer.ensureFolderExist path: 'bar', name: 'c', (err) =>
                    should.not.exist err
                    @normalizer.putFolder.called.should.be.true()
                    parent = path: '.', name: 'bar'
                    @normalizer.putFolder.calledWith(parent).should.be.true()
                    done()

        describe 'emptyFolder', ->
            it 'does nothing in an empty folder', (done) ->
                @normalizer.emptyFolder path: '', name: 'abc', (err) ->
                    should.not.exist err
                    done()

            it 'remove files in the folder', (done) ->
                async.eachSeries ['baz', 'qux', 'quux'], (name, next) =>
                    doc =
                        _id: Pouch.newId()
                        docType: 'file'
                        path: 'foo/a'
                        name: name
                    @pouch.db.put doc, next
                , (err) =>
                    should.not.exist err
                    @normalizer.emptyFolder path: 'foo', name: 'a', (err) =>
                        should.not.exist err
                        @pouch.byPath 'foo/a', (err, docs) ->
                            docs.length.should.be.equal 0
                            done()

            it 'remove nested folders', (done) ->
                async.eachSeries ['baz', 'qux', 'quux'], (name, next) =>
                    doc =
                        _id: Pouch.newId()
                        docType: 'folder'
                        path: 'foo/b'
                        name: name
                    @pouch.db.put doc, next
                , (err) =>
                    should.not.exist err
                    @normalizer.deleteFolder = sinon.stub().yields null
                    @normalizer.emptyFolder path: 'foo', name: 'b', (err) =>
                        should.not.exist err
                        names = for args in @normalizer.deleteFolder.args
                            args[0].name
                        names.sort().should.eql ['baz', 'quux', 'qux']
                        done()

        describe 'putDoc', ->
            it 'calls putFile for a file', (done) ->
                doc =
                    _id: Pouch.newId()
                    docType: 'file'
                    path: 'parent'
                    name: 'name'
                @normalizer.putFile = sinon.stub().yields null
                @normalizer.putDoc doc, (err) =>
                    should.not.exist err
                    @normalizer.putFile.calledWith(doc).should.be.true()
                    done()

            it 'calls putFolder for a folder', (done) ->
                doc =
                    _id: Pouch.newId()
                    docType: 'folder'
                    path: 'parent'
                    name: 'name'
                @normalizer.putFolder = sinon.stub().yields null
                @normalizer.putDoc doc, (err) =>
                    should.not.exist err
                    @normalizer.putFolder.calledWith(doc).should.be.true()
                    done()

        describe 'deleteDoc', ->
            it 'calls deleteFile for a file', (done) ->
                doc =
                    _id: Pouch.newId()
                    docType: 'file'
                    path: 'parent'
                    name: 'name'
                @normalizer.deleteFile = sinon.stub().yields null
                @normalizer.deleteDoc doc, (err) =>
                    should.not.exist err
                    @normalizer.deleteFile.calledWith(doc).should.be.true()
                    done()

            it 'calls deleteFolder for a folder', (done) ->
                doc =
                    _id: Pouch.newId()
                    docType: 'folder'
                    path: 'parent'
                    name: 'name'
                @normalizer.deleteFolder = sinon.stub().yields null
                @normalizer.deleteDoc doc, (err) =>
                    should.not.exist err
                    @normalizer.deleteFolder.calledWith(doc).should.be.true()
                    done()


    describe 'Actions', ->

        describe 'putFile', ->
            it 'expects a doc with a valid path and name', (done) ->
                @normalizer.putFile path: 'foo', name: null, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid path or name'
                    done()

            it 'expects a doc with a checksum', (done) ->
                doc =
                    path: 'foo'
                    name: 'bar'
                    checksum: ''
                @normalizer.putFile doc, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid checksum'
                    done()

            it 'saves the new file', (done) ->
                @normalizer.ensureFolderExist = sinon.stub().yields null
                doc =
                    _id: Pouch.newId()
                    path: 'foo'
                    name: 'bar'
                    checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                    docType: 'file'
                    creationDate: (new Date).toString()
                    lastModification: (new Date).toString()
                    tags: ['courge', 'quux']
                @normalizer.putFile doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        res.should.have.properties doc
                        done()

            it 'adds missing fields', (done) ->
                @normalizer.ensureFolderExist = sinon.stub().yields null
                doc =
                    path: 'foo'
                    name: 'bar'
                    checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                @normalizer.putFile doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        res.should.have.properties doc
                        res.docType.should.equal 'file'
                        should.exist res._id
                        should.exist res.creationDate
                        should.exist res.lastModification
                        done()

        describe 'putFolder', ->
            it 'expects a doc with a valid path and name', (done) ->
                @normalizer.putFolder path: 'foo', name: null, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid path or name'
                    done()

            it 'saves the new folder', (done) ->
                @normalizer.ensureFolderExist = sinon.stub().yields null
                doc =
                    _id: Pouch.newId()
                    path: 'foo'
                    name: 'baz'
                    docType: 'folder'
                    creationDate: (new Date).toString()
                    lastModification: (new Date).toString()
                    tags: ['courge', 'quux']
                @normalizer.putFolder doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        res.should.have.properties doc
                        done()

            it 'adds missing fields', (done) ->
                @normalizer.ensureFolderExist = sinon.stub().yields null
                doc =
                    path: 'foo'
                    name: 'bar'
                @normalizer.putFolder doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        res.should.have.properties doc
                        res.docType.should.equal 'folder'
                        should.exist res._id
                        should.exist res.creationDate
                        should.exist res.lastModification
                        done()

        describe 'moveFile', ->
            it 'expects a doc with an id', (done) ->
                @normalizer.moveFile path: 'foo', name: 'bar', (err) ->
                    should.exist err
                    err.message.should.equal 'Missing id'
                    done()

            it 'expects a doc with the file docType', (done) ->
                @normalizer.moveFile _id: '123', docType: 'folder', (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid docType'
                    done()

            it 'expects a doc with a valid path and name', (done) ->
                doc =
                    _id: '123'
                    docType: 'file'
                    path: '..'
                    name: ''
                @normalizer.moveFile doc, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid path or name'
                    done()

            it 'expects a doc with a valid checksum', (done) ->
                doc =
                    _id: '123'
                    docType: 'file'
                    path: 'foo'
                    name: 'bar'
                    checksum: 'invalid'
                @normalizer.moveFile doc, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid checksum'
                    done()

            it 'saves the moved file', (done) ->
                @normalizer.ensureFolderExist = sinon.stub().yields null
                doc =
                    _id: Pouch.newId()
                    docType: 'file'
                    path: 'foo'
                    name: 'bar'
                    checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                @normalizer.moveFile doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        res.should.have.properties doc
                        done()

        describe 'moveFolder', ->
            it 'expects a doc with an id', (done) ->
                @normalizer.moveFolder path: 'foo', name: 'bar', (err) ->
                    should.exist err
                    err.message.should.equal 'Missing id'
                    done()

            it 'expects a doc with the folder docType', (done) ->
                @normalizer.moveFolder _id: '123', docType: 'file', (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid docType'
                    done()

            it 'expects a doc with a valid path and name', (done) ->
                doc =
                    _id: '123'
                    docType: 'folder'
                    path: '..'
                    name: ''
                @normalizer.moveFolder doc, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid path or name'
                    done()

            it 'saves the moved folder', (done) ->
                @normalizer.ensureFolderExist = sinon.stub().yields null
                doc =
                    _id: Pouch.newId()
                    docType: 'folder'
                    path: 'foo'
                    name: 'bar'
                @normalizer.moveFolder doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        res.should.have.properties doc
                        done()

        describe 'deleteFile', ->
            it 'deletes a file identified by its id', (done) ->
                doc =
                    _id: Pouch.newId()
                    docType: 'file'
                    path: 'foo'
                    name: 'd'
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @normalizer.deleteFile _id: doc._id, (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err) ->
                            err.status.should.equal 404
                            done()

            it 'deletes a file identified by its fullpath', (done) ->
                doc =
                    _id: Pouch.newId()
                    docType: 'file'
                    path: 'foo'
                    name: 'e'
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @normalizer.deleteFile fullpath: 'foo/e', (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err, res) ->
                            err.status.should.equal 404
                            done()

        describe 'deleteFolder', ->
            it 'deletes a folder identified by its id', (done) ->
                doc =
                    _id: Pouch.newId()
                    docType: 'folder'
                    path: 'foo'
                    name: 'f'
                @normalizer.emptyFolder = sinon.stub().yields null
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @normalizer.deleteFolder _id: doc._id, (err) =>
                        should.not.exist err
                        firstArg = @normalizer.emptyFolder.args[0][0]
                        firstArg.should.have.properties doc
                        @pouch.db.get doc._id, (err, res) ->
                            err.status.should.equal 404
                            done()

            it 'deletes a folder identified by its fullpath', (done) ->
                doc =
                    _id: Pouch.newId()
                    docType: 'folder'
                    path: 'foo'
                    name: 'g'
                @normalizer.emptyFolder = sinon.stub().yields null
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @normalizer.deleteFolder fullpath: 'foo/g', (err) =>
                        should.not.exist err
                        firstArg = @normalizer.emptyFolder.args[0][0]
                        firstArg.should.have.properties doc
                        @pouch.db.get doc._id, (err, res) ->
                            err.status.should.equal 404
                            done()
