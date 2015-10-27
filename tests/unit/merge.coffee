async  = require 'async'
clone  = require 'lodash.clone'
sinon  = require 'sinon'
should = require 'should'

Merge = require '../../backend/merge'
Pouch = require '../../backend/pouch'

configHelpers = require '../helpers/config'
pouchHelpers  = require '../helpers/pouch'


describe 'Merge', ->

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    beforeEach 'instanciate merge', ->
        @merge = new Merge @pouch
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig


    describe 'Helpers', ->

        describe 'invalidId', ->
            it 'returns true if the id is incorrect', ->
                ret = @merge.invalidId _id: '/'
                ret.should.be.true()
                ret = @merge.invalidId _id: ''
                ret.should.be.true()
                ret = @merge.invalidId _id: '.'
                ret.should.be.true()
                ret = @merge.invalidId _id: '..'
                ret.should.be.true()
                ret = @merge.invalidId _id: '../foo/bar.png'
                ret.should.be.true()
                ret = @merge.invalidId _id: 'foo/..'
                ret.should.be.true()
                ret = @merge.invalidId _id: 'f/../oo/../../bar/./baz'
                ret.should.be.true()

            it 'returns false if everything is OK', ->
                ret = @merge.invalidId _id: 'foo'
                ret.should.be.false()
                ret = @merge.invalidId _id: 'foo/bar'
                ret.should.be.false()
                ret = @merge.invalidId _id: 'foo/bar/baz.jpg'
                ret.should.be.false()

            it 'returns false for paths with a leading slash', ->
                ret = @merge.invalidId _id: '/foo/bar'
                ret.should.be.false()
                ret = @merge.invalidId _id: '/foo/bar/baz.bmp'
                ret.should.be.false()

        describe 'invalidChecksum', ->
            it 'returns true if the checksum is missing', ->
                ret = @merge.invalidChecksum {}
                ret.should.be.true()
                ret = @merge.invalidChecksum checksum: null
                ret.should.be.true()
                ret = @merge.invalidChecksum checksum: undefined
                ret.should.be.true()

            it 'returns true if the checksum is incorrect', ->
                ret = @merge.invalidChecksum checksum: ''
                ret.should.be.true()
                ret = @merge.invalidChecksum checksum: 'f00'
                ret.should.be.true()
                md5 = '68b329da9893e34099c7d8ad5cb9c940'
                ret = @merge.invalidChecksum checksum: md5
                ret.should.be.true()

            it 'returns false if the checksum is OK', ->
                doc = checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                ret = @merge.invalidChecksum doc
                ret.should.be.false()
                doc = checksum: 'ADC83B19E793491B1C6EA0FD8B46CD9F32E592FC'
                ret = @merge.invalidChecksum doc
                ret.should.be.false()

        describe 'ensureParentExist', ->
            it 'works when in the root folder', (done) ->
                @merge.ensureParentExist _id: 'foo', (err) ->
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
                    @merge.ensureParentExist child, (err) ->
                        should.not.exist err
                        done()

            it 'creates the parent directory if missing', (done) ->
                @merge.putFolder = sinon.stub().yields null, 'OK'
                @merge.ensureParentExist _id: 'missing/child', (err) =>
                    should.not.exist err
                    @merge.putFolder.called.should.be.true()
                    parent = _id: 'missing'
                    @merge.putFolder.calledWith(parent).should.be.true()
                    done()

            it 'creates the full tree if needed', (done) ->
                @merge.putFolder = sinon.stub().yields null, 'OK'
                @merge.ensureParentExist _id: 'a/b/c/d/e', (err) =>
                    should.not.exist err
                    method = @merge.putFolder
                    method.called.should.be.true()
                    method.calledWith(_id: 'a').should.be.true()
                    method.calledWith(_id: 'a/b').should.be.true()
                    method.calledWith(_id: 'a/b/c').should.be.true()
                    method.calledWith(_id: 'a/b/c/d').should.be.true()
                    done()

        describe 'emptyFolder', ->
            it 'does nothing in an empty folder', (done) ->
                @merge.emptyFolder _id: 'abc', (err) ->
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
                    @merge.emptyFolder _id: 'foo/to-remove', (err) =>
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
                    @merge.emptyFolder _id: 'nested', (err) =>
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
                @merge.putFile = sinon.stub().yields null
                @merge.putDoc doc, (err) =>
                    should.not.exist err
                    @merge.putFile.calledWith(doc).should.be.true()
                    done()

            it 'calls putFolder for a folder', (done) ->
                doc =
                    _id: 'put/folder'
                    docType: 'folder'
                @merge.putFolder = sinon.stub().yields null
                @merge.putDoc doc, (err) =>
                    should.not.exist err
                    @merge.putFolder.calledWith(doc).should.be.true()
                    done()

        describe 'moveDoc', ->
            it 'calls moveFile for a file', (done) ->
                doc =
                    _id: 'move/name'
                    docType: 'file'
                was =
                    _id: 'move/old-name'
                    docType: 'file'
                @merge.moveFile = sinon.stub().yields null
                @merge.moveDoc doc, was, (err) =>
                    should.not.exist err
                    @merge.moveFile.calledWith(doc, was).should.be.true()
                    done()

            it 'calls moveFolder for a folder', (done) ->
                doc =
                    _id: 'move/folder'
                    docType: 'folder'
                was =
                    _id: 'move/old-folder'
                    docType: 'folder'
                @merge.moveFolder = sinon.stub().yields null
                @merge.moveDoc doc, was, (err) =>
                    should.not.exist err
                    @merge.moveFolder.calledWith(doc, was).should.be.true()
                    done()

            it 'throws an error if we move a file to a folder', (done) ->
                doc =
                    _id: 'move/folder'
                    docType: 'folder'
                was =
                    _id: 'move/old-file'
                    docType: 'file'
                @merge.moveDoc doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Incompatible docTypes: folder'
                    done()

            it 'throws an error if we move a folder to a file', (done) ->
                doc =
                    _id: 'move/file'
                    docType: 'file'
                was =
                    _id: 'move/old-folder'
                    docType: 'folder'
                @merge.moveDoc doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Incompatible docTypes: file'
                    done()

        describe 'deleteDoc', ->
            it 'calls deleteFile for a file', (done) ->
                doc =
                    _id: 'delete/name'
                    docType: 'file'
                @merge.deleteFile = sinon.stub().yields null
                @merge.deleteDoc doc, (err) =>
                    should.not.exist err
                    @merge.deleteFile.calledWith(doc).should.be.true()
                    done()

            it 'calls deleteFolder for a folder', (done) ->
                doc =
                    _id: 'delete/folder'
                    docType: 'folder'
                @merge.deleteFolder = sinon.stub().yields null
                @merge.deleteDoc doc, (err) =>
                    should.not.exist err
                    @merge.deleteFolder.calledWith(doc).should.be.true()
                    done()


    describe 'Put', ->

        describe 'putFile', ->
            it 'expects a doc with a valid id', (done) ->
                @merge.putFile _id: '/', (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid id'
                    done()

            it 'expects a doc with a checksum', (done) ->
                doc =
                    _id: 'no-checksum'
                    checksum: ''
                @merge.putFile doc, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid checksum'
                    done()

            it 'saves the new file', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foo/new-file'
                    checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                    docType: 'file'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                @merge.putFile doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        for date in ['creationDate', 'lastModification']
                            doc[date] = doc[date].toISOString()
                        res.should.have.properties doc
                        done()

            it 'adds missing fields', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foo/missing-fields'
                    checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                @merge.putFile doc, (err) =>
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
                    @merge.ensureParentExist = sinon.stub().yields null
                    was = clone @file
                    @file.tags = ['bar', 'baz']
                    @file.lastModification = new Date
                    doc = clone @file
                    delete doc.size
                    delete doc.class
                    delete doc.mime
                    @file.creationDate = doc.creationDate.toISOString()
                    @file.lastModification = doc.lastModification.toISOString()
                    @merge.putFile doc, (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err, res) =>
                            should.not.exist err
                            res.should.have.properties @file
                            res.size.should.equal was.size
                            res.class.should.equal was.class
                            res.mime.should.equal was.mime
                            done()

                it 'can overwrite the content of a file', (done) ->
                    @merge.ensureParentExist = sinon.stub().yields null
                    doc =
                        _id: 'buzz.jpg'
                        docType: 'file'
                        checksum: '3333333333333333333333333333333333333333'
                        tags: ['qux', 'quux']
                    @merge.putFile clone(doc), (err) =>
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
                @merge.putFolder _id: '..', (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid id'
                    done()

            it 'saves the new folder', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foo/new-folder'
                    docType: 'folder'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                @merge.putFolder doc, (err) =>
                    should.not.exist err
                    doc.creationDate = doc.creationDate.toISOString()
                    doc.lastModification = doc.lastModification.toISOString()
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        res.should.have.properties doc
                        done()

            it 'adds missing fields', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc = _id: 'foo/folder-missing-fields'
                @merge.putFolder doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        for date in ['creationDate', 'lastModification']
                            doc[date] = doc[date].toISOString()
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
                    @merge.ensureParentExist = sinon.stub().yields null
                    doc = clone @folder
                    doc.tags = ['bar', 'baz']
                    doc.lastModification = new Date
                    @merge.putFolder clone(doc), (err) =>
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

        describe 'moveFile', ->
            it 'expects a doc with a valid id', (done) ->
                doc = _id: ''
                was = _id: 'foo/baz'
                @merge.moveFile doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid id'
                    done()

            it 'expects a was with a valid id', (done) ->
                doc = _id: 'foo/bar'
                was = _id: ''
                @merge.moveFile doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid id'
                    done()

            it 'expects a doc with a valid checksum', (done) ->
                doc =
                    _id: 'foo/bar'
                    docType: 'file'
                    checksum: 'invalid'
                was = _id: 'foo/baz'
                @merge.moveFile doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid checksum'
                    done()

            it 'expects a revision for was', (done) ->
                doc =
                    _id: 'foo/bar'
                    docType: 'file'
                    checksum: '5555555555555555555555555555555555555555'
                was =
                    _id: 'foo/baz'
                    docType: 'file'
                    checksum: '5555555555555555555555555555555555555555'
                @merge.moveFile doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Missing rev'
                    done()

            it 'saves the new file and deletes the old one', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foo/new'
                    checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                    docType: 'file'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                was =
                    _id: 'foo/old'
                    checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                    docType: 'file'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                @pouch.db.put clone(was), (err, inserted) =>
                    should.not.exist err
                    was._rev = inserted.rev
                    @merge.moveFile clone(doc), clone(was), (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err, res) =>
                            should.not.exist err
                            for date in ['creationDate', 'lastModification']
                                doc[date] = doc[date].toISOString()
                            res.should.have.properties doc
                            @pouch.db.get was._id, (err, res) ->
                                should.exist err
                                err.status.should.equal 404
                                done()

            it 'adds missing fields', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foo/new-missing-fields.jpg'
                    checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                was =
                    _id: 'foo/old-missing-fields.jpg'
                    checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                    docType: 'file'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                    size: 5426
                    class: 'image'
                    mime: 'image/jpeg'
                @pouch.db.put clone(was), (err, inserted) =>
                    should.not.exist err
                    was._rev = inserted.rev
                    @merge.moveFile doc, clone(was), (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err, res) ->
                            should.not.exist err
                            for date in ['creationDate', 'lastModification']
                                doc[date] = doc[date].toISOString()
                            res.should.have.properties doc
                            should.exist res._id
                            should.exist res.creationDate
                            should.exist res.lastModification
                            should.exist res.size
                            should.exist res.class
                            should.exist res.mime
                            done()

            it 'adds a hint for writers to know that it is a move', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foo/new-hint'
                    checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                    docType: 'file'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                was =
                    _id: 'foo/old-hint'
                    checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                    docType: 'file'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                opts =
                    include_docs: true
                    live: true
                    since: 'now'
                @pouch.db.put clone(was), (err, inserted) =>
                    should.not.exist err
                    was._rev = inserted.rev
                    @pouch.db.changes(opts).on 'change', (info) ->
                        @cancel()
                        info.id.should.equal was._id
                        info.doc.moveTo.should.equal doc._id
                        done()
                    @merge.moveFile clone(doc), clone(was), (err) ->
                        should.not.exist err

            describe 'when a folder with the same path exists', ->
                it 'TODO'

            describe 'when a file with the same path exists', ->
                before 'create a file', (done) ->
                    @file =
                        _id: 'fuzz.jpg'
                        docType: 'file'
                        checksum: '1111111111111111111111111111111111111111'
                        creationDate: new Date
                        lastModification: new Date
                        tags: ['foo']
                        size: 12345
                        class: 'image'
                        mime: 'image/jpeg'
                    @pouch.db.put @file, done

                it 'can overwrite the content of a file', (done) ->
                    @merge.ensureParentExist = sinon.stub().yields null
                    doc =
                        _id: 'fuzz.jpg'
                        docType: 'file'
                        checksum: '3333333333333333333333333333333333333333'
                        tags: ['qux', 'quux']
                    was =
                        _id: 'old-fuzz.jpg'
                        checksum: '3333333333333333333333333333333333333333'
                        docType: 'file'
                        creationDate: new Date
                        lastModification: new Date
                        tags: ['qux', 'quux']
                    @pouch.db.put clone(was), (err, inserted) =>
                        should.not.exist err
                        was._rev = inserted.rev
                        @merge.moveFile clone(doc), clone(was), (err) =>
                            should.not.exist err
                            @pouch.db.get @file._id, (err, res) =>
                                should.not.exist err
                                res.should.have.properties doc
                                should.not.exist res.size
                                should.not.exist res.class
                                should.not.exist res.mime
                                @pouch.db.get was._id, (err, res) ->
                                    should.exist err
                                    err.status.should.equal 404
                                    done()

                it 'can resolve a conflict', ->
                    it 'TODO'


        describe 'moveFolder', ->
            it 'expects a doc with a valid id', (done) ->
                doc = _id: ''
                was = _id: 'foo/baz'
                @merge.moveFolder doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid id'
                    done()

            it 'expects a was with a valid id', (done) ->
                doc = _id: 'foo/bar'
                was = _id: ''
                @merge.moveFolder doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid id'
                    done()

            it 'expects a revision for was', (done) ->
                doc =
                    _id: 'foo/bar'
                    docType: 'folder'
                was =
                    _id: 'foo/baz'
                    docType: 'folder'
                @merge.moveFolder doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Missing rev'
                    done()

            it 'saves the new folder and deletes the old one', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foobar/new'
                    docType: 'folder'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                was =
                    _id: 'foobar/old'
                    docType: 'folder'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                @pouch.db.put clone(was), (err, inserted) =>
                    should.not.exist err
                    was._rev = inserted.rev
                    @merge.moveFolder clone(doc), clone(was), (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err, res) =>
                            should.not.exist err
                            for date in ['creationDate', 'lastModification']
                                doc[date] = doc[date].toISOString()
                            res.should.have.properties doc
                            @pouch.db.get was._id, (err, res) ->
                                should.exist err
                                err.status.should.equal 404
                                done()

            it 'adds missing fields', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foobar/new-missing-fields'
                was =
                    _id: 'foobar/old-missing-fields'
                    docType: 'folder'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                @pouch.db.put clone(was), (err, inserted) =>
                    should.not.exist err
                    was._rev = inserted.rev
                    @merge.moveFolder doc, clone(was), (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err, res) ->
                            should.not.exist err
                            for date in ['creationDate', 'lastModification']
                                doc[date] = doc[date].toISOString()
                            res.should.have.properties doc
                            should.exist res._id
                            should.exist res.creationDate
                            should.exist res.lastModification
                            done()

            it 'adds a hint for writers to know that it is a move', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foobar/new-hint'
                    docType: 'folder'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                was =
                    _id: 'foobar/old-hint'
                    docType: 'folder'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                opts =
                    include_docs: true
                    live: true
                    since: 'now'
                @pouch.db.put clone(was), (err, inserted) =>
                    should.not.exist err
                    was._rev = inserted.rev
                    @pouch.db.changes(opts).on 'change', (info) ->
                        @cancel()
                        info.id.should.equal was._id
                        info.doc.moveTo.should.equal doc._id
                        done()
                    @merge.moveFolder clone(doc), clone(was), (err) ->
                        should.not.exist err

            describe 'when a file with the same path exists', ->
                it 'TODO'

            describe 'when a folder with the same path exists', ->
                before 'create a folder', (done) ->
                    @folder =
                        _id: 'foobaz'
                        docType: 'folder'
                        creationDate: new Date
                        lastModification: new Date
                        tags: ['foo']
                    @pouch.db.put @folder, done

                it 'can overwrite the content of a folder', (done) ->
                    @merge.ensureParentExist = sinon.stub().yields null
                    doc =
                        _id: 'foobaz'
                        docType: 'folder'
                        tags: ['qux', 'quux']
                    was =
                        _id: 'old-foobaz'
                        docType: 'folder'
                        creationDate: new Date
                        lastModification: new Date
                        tags: ['qux', 'quux']
                    @pouch.db.put clone(was), (err, inserted) =>
                        should.not.exist err
                        was._rev = inserted.rev
                        @merge.moveFolder clone(doc), clone(was), (err) =>
                            should.not.exist err
                            @pouch.db.get @folder._id, (err, res) =>
                                should.not.exist err
                                res.should.have.properties doc
                                @pouch.db.get was._id, (err, res) ->
                                    should.exist err
                                    err.status.should.equal 404
                                    done()

                it 'can resolve a conflict', ->
                    it 'TODO'


    describe 'Delete', ->

        describe 'deleteFile', ->
            it 'deletes a file', (done) ->
                doc =
                    _id: 'to-delete/file'
                    docType: 'file'
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @merge.deleteFile doc, (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err) ->
                            err.status.should.equal 404
                            done()

        describe 'deleteFolder', ->
            it 'deletes a folder', (done) ->
                doc =
                    _id: 'to-delete/folder'
                    docType: 'folder'
                @merge.emptyFolder = sinon.stub().yields null
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @merge.deleteFolder doc, (err) =>
                        should.not.exist err
                        firstArg = @merge.emptyFolder.args[0][0]
                        firstArg.should.have.properties doc
                        @pouch.db.get doc._id, (err, res) ->
                            err.status.should.equal 404
                            done()
