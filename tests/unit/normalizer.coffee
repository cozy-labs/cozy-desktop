async  = require 'async'
clone  = require 'lodash.clone'
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

        describe 'invalidId', ->
            it 'returns true if the id is incorrect', ->
                ret = @normalizer.invalidId _id: '/'
                ret.should.be.true()
                ret = @normalizer.invalidId _id: ''
                ret.should.be.true()
                ret = @normalizer.invalidId _id: '.'
                ret.should.be.true()
                ret = @normalizer.invalidId _id: '..'
                ret.should.be.true()
                ret = @normalizer.invalidId _id: '../foo/bar.png'
                ret.should.be.true()
                ret = @normalizer.invalidId _id: 'foo/..'
                ret.should.be.true()
                ret = @normalizer.invalidId _id: 'f/../oo/../../bar/./baz'
                ret.should.be.true()

            it 'returns false if everything is OK', ->
                ret = @normalizer.invalidId _id: 'foo'
                ret.should.be.false()
                ret = @normalizer.invalidId _id: 'foo/bar'
                ret.should.be.false()
                ret = @normalizer.invalidId _id: 'foo/bar/baz.jpg'
                ret.should.be.false()

            it 'returns false for paths with a leading slash', ->
                ret = @normalizer.invalidId _id: '/foo/bar'
                ret.should.be.false()
                ret = @normalizer.invalidId _id: '/foo/bar/baz.bmp'
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

        describe 'ensureParentExist', ->
            it 'works when in the root folder', (done) ->
                @normalizer.ensureParentExist _id: 'foo', (err) ->
                    should.not.exist err
                    done()

            it 'works if the parent directory is present', (done) ->
                doc =
                    _id: 'exists'
                    docType: 'folder'
                child =
                    _id: 'exists/child'
                    docType: 'folder'
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @normalizer.ensureParentExist child, (err) ->
                        should.not.exist err
                        done()

            it 'creates the parent directory if missing', (done) ->
                @normalizer.putFolder = sinon.stub().yields null, 'OK'
                @normalizer.ensureParentExist _id: 'missing/child', (err) =>
                    should.not.exist err
                    @normalizer.putFolder.called.should.be.true()
                    parent = _id: 'missing'
                    @normalizer.putFolder.calledWith(parent).should.be.true()
                    done()

            it 'creates the full tree if needed', (done) ->
                @normalizer.putFolder = sinon.stub().yields null, 'OK'
                @normalizer.ensureParentExist _id: 'a/b/c/d/e', (err) =>
                    should.not.exist err
                    method = @normalizer.putFolder
                    method.called.should.be.true()
                    method.calledWith(_id: 'a').should.be.true()
                    method.calledWith(_id: 'a/b').should.be.true()
                    method.calledWith(_id: 'a/b/c').should.be.true()
                    method.calledWith(_id: 'a/b/c/d').should.be.true()
                    done()

        describe 'emptyFolder', ->
            it 'does nothing in an empty folder', (done) ->
                @normalizer.emptyFolder _id: 'abc', (err) ->
                    should.not.exist err
                    done()

            it 'remove files in the folder', (done) ->
                async.eachSeries ['baz', 'qux', 'quux'], (name, next) =>
                    doc =
                        _id: "foo/to-remove/#{name}"
                        docType: 'file'
                    @pouch.db.put doc, next
                , (err) =>
                    should.not.exist err
                    @normalizer.emptyFolder _id: 'foo/to-remove', (err) =>
                        should.not.exist err
                        @pouch.byPath 'foo/to-remove', (err, docs) ->
                            docs.length.should.be.equal 0
                            done()

            it 'remove nested folders', (done) ->
                async.eachSeries ['', '/b', '/b/c', '/b/d'], (name, next) =>
                    doc =
                        _id: "nested/foo#{name}"
                        docType: 'folder'
                    @pouch.db.put doc, next
                , (err) =>
                    should.not.exist err
                    @normalizer.emptyFolder _id: 'nested', (err) =>
                        should.not.exist err
                        @pouch.db.allDocs (err, res) ->
                            should.not.exist err
                            for row in res.rows
                                row.id.should.not.match /^nested/
                            done()

        describe 'putDoc', ->
            it 'calls putFile for a file', (done) ->
                doc =
                    _id: 'put/name'
                    docType: 'file'
                @normalizer.putFile = sinon.stub().yields null
                @normalizer.putDoc doc, (err) =>
                    should.not.exist err
                    @normalizer.putFile.calledWith(doc).should.be.true()
                    done()

            it 'calls putFolder for a folder', (done) ->
                doc =
                    _id: 'put/folder'
                    docType: 'folder'
                @normalizer.putFolder = sinon.stub().yields null
                @normalizer.putDoc doc, (err) =>
                    should.not.exist err
                    @normalizer.putFolder.calledWith(doc).should.be.true()
                    done()

        describe 'deleteDoc', ->
            it 'calls deleteFile for a file', (done) ->
                doc =
                    _id: 'delete/name'
                    docType: 'file'
                @normalizer.deleteFile = sinon.stub().yields null
                @normalizer.deleteDoc doc, (err) =>
                    should.not.exist err
                    @normalizer.deleteFile.calledWith(doc).should.be.true()
                    done()

            it 'calls deleteFolder for a folder', (done) ->
                doc =
                    _id: 'delete/folder'
                    docType: 'folder'
                @normalizer.deleteFolder = sinon.stub().yields null
                @normalizer.deleteDoc doc, (err) =>
                    should.not.exist err
                    @normalizer.deleteFolder.calledWith(doc).should.be.true()
                    done()


    describe 'Put', ->

        describe 'putFile', ->
            it 'expects a doc with a valid id', (done) ->
                @normalizer.putFile _id: '/', (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid id'
                    done()

            it 'expects a doc with a checksum', (done) ->
                doc =
                    _id: 'no-checksum'
                    checksum: ''
                @normalizer.putFile doc, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid checksum'
                    done()

            it 'saves the new file', (done) ->
                @normalizer.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foo/new-file'
                    checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                    docType: 'file'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                @normalizer.putFile doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        for date in ['creationDate', 'lastModification']
                            doc[date] = doc[date].toISOString()
                        res.should.have.properties doc
                        done()

            it 'adds missing fields', (done) ->
                @normalizer.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foo/missing-fields'
                    checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                @normalizer.putFile doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        for date in ['creationDate', 'lastModification']
                            doc[date] = doc[date].toISOString()
                        res.should.have.properties doc
                        res.docType.should.equal 'file'
                        should.exist res._id
                        should.exist res.creationDate
                        should.exist res.lastModification
                        done()

            describe 'when a folder with the same path exists', ->
                it 'TODO'

            describe 'when a file with the same path exists', ->
                before 'create a file', (done) ->
                    @file =
                        _id: 'buzz.jpg'
                        docType: 'file'
                        checksum: '1111111111111111111111111111111111111111'
                        creationDate: new Date
                        lastModification: new Date
                        tags: ['foo']
                        size: 12345
                        class: 'image'
                        mime: 'image/jpeg'
                    @pouch.db.put @file, done

                it 'can update the metadata', (done) ->
                    @normalizer.ensureParentExist = sinon.stub().yields null
                    was = clone @file
                    @file.tags = ['bar', 'baz']
                    @file.lastModification = new Date
                    doc = clone @file
                    delete doc.size
                    delete doc.class
                    delete doc.mime
                    @file.creationDate = doc.creationDate.toISOString()
                    @file.lastModification = doc.lastModification.toISOString()
                    @normalizer.putFile doc, (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err, res) =>
                            should.not.exist err
                            res.should.have.properties @file
                            res.size.should.equal was.size
                            res.class.should.equal was.class
                            res.mime.should.equal was.mime
                            done()

                it 'can overwrite the content of a file', (done) ->
                    @normalizer.ensureParentExist = sinon.stub().yields null
                    doc =
                        _id: 'buzz.jpg'
                        docType: 'file'
                        checksum: '3333333333333333333333333333333333333333'
                        tags: ['qux', 'quux']
                    @normalizer.putFile clone(doc), (err) =>
                        should.not.exist err
                        @pouch.db.get @file._id, (err, res) ->
                            should.not.exist err
                            res.should.have.properties doc
                            should.not.exist res.size
                            should.not.exist res.class
                            should.not.exist res.mime
                            done()

                it 'can resolve a conflict', ->
                    it 'TODO'


        describe 'putFolder', ->
            it 'expects a doc with a valid id', (done) ->
                @normalizer.putFolder _id: '..', (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid id'
                    done()

            it 'saves the new folder', (done) ->
                @normalizer.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foo/new-folder'
                    docType: 'folder'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                @normalizer.putFolder doc, (err) =>
                    should.not.exist err
                    doc.creationDate = doc.creationDate.toISOString()
                    doc.lastModification = doc.lastModification.toISOString()
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        res.should.have.properties doc
                        done()

            it 'adds missing fields', (done) ->
                @normalizer.ensureParentExist = sinon.stub().yields null
                doc = _id: 'foo/folder-missing-fields'
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

            describe 'when a file with the same path exists', ->
                it 'TODO'

            describe 'when a folder with the same path exists', ->
                before 'create a folder', (done) ->
                    @folder =
                        _id: 'fizz'
                        docType: 'folder'
                        creationDate: new Date
                        lastModification: new Date
                        tags: ['foo', 'bar']
                    @pouch.db.put @folder, done

                it 'can update the tags and last modification date', (done) ->
                    @normalizer.ensureParentExist = sinon.stub().yields null
                    doc = clone @folder
                    doc.tags = ['bar', 'baz']
                    doc.lastModification = new Date
                    @normalizer.putFolder clone(doc), (err) =>
                        should.not.exist err
                        doc.tags = ['bar', 'baz', 'foo']
                        for date in ['creationDate', 'lastModification']
                            doc[date] = doc[date].toISOString()
                        @pouch.db.get doc._id, (err, res) ->
                            should.not.exist err
                            res.should.have.properties doc
                            done()

                it 'can resolve a conflict', ->
                    it 'TODO'


    describe 'Move', ->
        return it 'TODO'

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
                @normalizer.ensureParentExist = sinon.stub().yields null
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
                @normalizer.ensureParentExist = sinon.stub().yields null
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


    describe 'Delete', ->

        describe 'deleteFile', ->
            it 'deletes a file', (done) ->
                doc =
                    _id: 'to-delete/file'
                    docType: 'file'
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @normalizer.deleteFile doc, (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err) ->
                            err.status.should.equal 404
                            done()

        describe 'deleteFolder', ->
            it 'deletes a folder', (done) ->
                doc =
                    _id: 'to-delete/folder'
                    docType: 'folder'
                @normalizer.emptyFolder = sinon.stub().yields null
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @normalizer.deleteFolder doc, (err) =>
                        should.not.exist err
                        firstArg = @normalizer.emptyFolder.args[0][0]
                        firstArg.should.have.properties doc
                        @pouch.db.get doc._id, (err, res) ->
                            err.status.should.equal 404
                            done()
