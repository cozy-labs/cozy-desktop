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
        @side  = 'local'
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
            it 'returns false if the checksum is missing', ->
                ret = @merge.invalidChecksum {}
                ret.should.be.false()
                ret = @merge.invalidChecksum checksum: null
                ret.should.be.false()
                ret = @merge.invalidChecksum checksum: undefined
                ret.should.be.false()

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

        describe 'sameBinary', ->
            it 'returns true for two docs with the same checksum', ->
                one = checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                two = checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                ret = @merge.sameBinary one, two
                ret.should.be.true()

            it 'returns true for two docs with the same remote file', ->
                one =
                    checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                    remote:
                        file:
                            _id: 'f00b4r'
                two =
                    remote:
                        file:
                            _id: 'f00b4r'
                ret = @merge.sameBinary one, two
                ret.should.be.true()
                ret = @merge.sameBinary two, one
                ret.should.be.true()

            it 'returns false for two different documents', ->
                one = checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                two =
                    checksum: '2082e7f715f058acab2398d25d135cf5f4c0ce41'
                    remote:
                        file:
                            _id: 'f00b4r'
                three =
                    remote:
                        file:
                            _id: 'c00463'
                ret = @merge.sameBinary one, two
                ret.should.be.false()
                ret = @merge.sameBinary two, three
                ret.should.be.false()
                ret = @merge.sameBinary three, one
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
                    @merge.putFolder.calledWith(null, parent).should.be.true()
                    done()

            it 'creates the full tree if needed', (done) ->
                @merge.putFolder = sinon.stub().yields null, 'OK'
                @merge.ensureParentExist _id: 'a/b/c/d/e', (err) =>
                    should.not.exist err
                    method = @merge.putFolder
                    method.called.should.be.true()
                    method.calledWith(null, _id: 'a').should.be.true()
                    method.calledWith(null, _id: 'a/b').should.be.true()
                    method.calledWith(null, _id: 'a/b/c').should.be.true()
                    method.calledWith(null, _id: 'a/b/c/d').should.be.true()
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
                @merge.moveDoc @side, doc, was, (err) =>
                    should.not.exist err
                    @merge.moveFile.calledWith(@side, doc, was).should.be.true()
                    done()

            it 'calls moveFolder for a folder', (done) ->
                doc =
                    _id: 'move/folder'
                    docType: 'folder'
                was =
                    _id: 'move/old-folder'
                    docType: 'folder'
                spy = @merge.moveFolder = sinon.stub().yields null
                @merge.moveDoc @side, doc, was, (err) =>
                    should.not.exist err
                    spy.calledWith(@side, doc, was).should.be.true()
                    done()

            it 'throws an error if we move a file to a folder', (done) ->
                doc =
                    _id: 'move/folder'
                    docType: 'folder'
                was =
                    _id: 'move/old-file'
                    docType: 'file'
                @merge.moveDoc @side, doc, was, (err) ->
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
                @merge.moveDoc @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Incompatible docTypes: file'
                    done()

        describe 'deleteDoc', ->
            it 'calls deleteFile for a file', (done) ->
                doc =
                    _id: 'delete/name'
                    docType: 'file'
                @merge.deleteFile = sinon.stub().yields null
                @merge.deleteDoc @side, doc, (err) =>
                    should.not.exist err
                    @merge.deleteFile.calledWith(@side, doc).should.be.true()
                    done()

            it 'calls deleteFolder for a folder', (done) ->
                doc =
                    _id: 'delete/folder'
                    docType: 'folder'
                @merge.deleteFolder = sinon.stub().yields null
                @merge.deleteDoc @side, doc, (err) =>
                    should.not.exist err
                    @merge.deleteFolder.calledWith(@side, doc).should.be.true()
                    done()

        describe 'markSide', ->
            it 'marks local: 1 for a new doc', ->
                doc = {}
                @merge.markSide 'local', doc
                should.exist doc.sides
                should.exist doc.sides.local
                doc.sides.local.should.equal 1

            it 'increments the rev for an already existing doc', ->
                doc =
                    sides:
                        local: 3
                        remote: 5
                prev = _rev: '5-0123'
                @merge.markSide 'local', doc, prev
                doc.sides.local.should.equal 6


    describe 'Put', ->

        describe 'addFile', ->
            it 'expects a doc with a valid id', (done) ->
                @merge.addFile @side, _id: '/', (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid id'
                    done()

            it 'accepts doc with no checksum', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'no-checksum'
                    docType: 'file'
                @merge.addFile @side, doc, (err) ->
                    should.not.exist err
                    done()

            it 'rejects doc with an invalid checksum', (done) ->
                doc =
                    _id: 'no-checksum'
                    checksum: 'foobar'
                @merge.addFile @side, doc, (err) ->
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
                @merge.addFile @side, doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        for date in ['creationDate', 'lastModification']
                            doc[date] = doc[date].toISOString()
                        res.should.have.properties doc
                        res.sides.local.should.equal 1
                        done()

            it 'adds missing fields', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foo/missing-fields'
                    checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                @merge.addFile @side, doc, (err) =>
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
                    @merge.addFile @side, doc, (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err, res) =>
                            should.not.exist err
                            res.should.have.properties @file
                            res.size.should.equal was.size
                            res.class.should.equal was.class
                            res.mime.should.equal was.mime
                            res.sides.local.should.equal 2
                            done()

                it 'can resolve a conflict', ->
                    it 'TODO'


        describe 'updateFile', ->
            it 'expects a doc with a valid id', (done) ->
                @merge.updateFile @side, _id: '/', (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid id'
                    done()

            it 'accepts doc with no checksum', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'no-checksum'
                    docType: 'file'
                @merge.updateFile @side, doc, (err) ->
                    should.not.exist err
                    done()

            it 'rejects doc with an invalid checksum', (done) ->
                doc =
                    _id: 'no-checksum'
                    checksum: 'foobar'
                @merge.updateFile @side, doc, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid checksum'
                    done()

            it 'saves the new file', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foobar/new-file'
                    checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                    docType: 'file'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                @merge.updateFile @side, doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        for date in ['creationDate', 'lastModification']
                            doc[date] = doc[date].toISOString()
                        res.should.have.properties doc
                        res.sides.local.should.equal 1
                        done()

            it 'adds missing fields', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foobar/missing-fields'
                    checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                @merge.updateFile @side, doc, (err) =>
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
                        _id: 'fizzbuzz.jpg'
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
                    @merge.updateFile @side, doc, (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err, res) =>
                            should.not.exist err
                            res.should.have.properties @file
                            res.size.should.equal was.size
                            res.class.should.equal was.class
                            res.mime.should.equal was.mime
                            res.sides.local.should.equal 2
                            done()

                it 'can overwrite the content of a file', (done) ->
                    @merge.ensureParentExist = sinon.stub().yields null
                    doc =
                        _id: 'fizzbuzz.jpg'
                        docType: 'file'
                        checksum: '3333333333333333333333333333333333333333'
                        tags: ['qux', 'quux']
                    @merge.updateFile @side, clone(doc), (err) =>
                        should.not.exist err
                        @pouch.db.get @file._id, (err, res) ->
                            should.not.exist err
                            res.should.have.properties doc
                            should.not.exist res.size
                            should.not.exist res.class
                            should.not.exist res.mime
                            res.sides.local.should.equal 3
                            done()


        describe 'putFolder', ->
            it 'expects a doc with a valid id', (done) ->
                @merge.putFolder @side, _id: '..', (err) ->
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
                @merge.putFolder @side, doc, (err) =>
                    should.not.exist err
                    doc.creationDate = doc.creationDate.toISOString()
                    doc.lastModification = doc.lastModification.toISOString()
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        res.should.have.properties doc
                        res.sides.local.should.equal 1
                        done()

            it 'adds missing fields', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc = _id: 'foo/folder-missing-fields'
                @merge.putFolder @side, doc, (err) =>
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
                    @merge.putFolder @side, clone(doc), (err) =>
                        should.not.exist err
                        doc.tags = ['bar', 'baz', 'foo']
                        for date in ['creationDate', 'lastModification']
                            doc[date] = doc[date].toISOString()
                        @pouch.db.get doc._id, (err, res) ->
                            should.not.exist err
                            res.should.have.properties doc
                            res.sides.local.should.equal 2
                            done()

                it 'can resolve a conflict', ->
                    it 'TODO'


    describe 'Move', ->

        describe 'moveFile', ->
            it 'expects a doc with a valid id', (done) ->
                doc = _id: ''
                was = _id: 'foo/baz'
                @merge.moveFile @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid id'
                    done()

            it 'expects a was with a valid id', (done) ->
                doc = _id: 'foo/bar'
                was = _id: ''
                @merge.moveFile @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid id'
                    done()

            it 'expects a doc with a valid checksum', (done) ->
                doc =
                    _id: 'foo/bar'
                    docType: 'file'
                    checksum: 'invalid'
                was = _id: 'foo/baz'
                @merge.moveFile @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid checksum'
                    done()

            it 'expects two different paths', (done) ->
                doc =
                    _id: 'foo/bar'
                    docType: 'file'
                    checksum: '5555555555555555555555555555555555555555'
                was =
                    _id: 'foo/bar'
                    docType: 'file'
                    checksum: '5555555555555555555555555555555555555555'
                @merge.moveFile @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid move'
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
                @merge.moveFile @side, doc, was, (err) ->
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
                    @merge.moveFile @side, clone(doc), clone(was), (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err, res) =>
                            should.not.exist err
                            for date in ['creationDate', 'lastModification']
                                doc[date] = doc[date].toISOString()
                            res.should.have.properties doc
                            res.sides.local.should.equal 1
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
                    @merge.moveFile @side, doc, clone(was), (err) =>
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
                    @merge.moveFile @side, clone(doc), clone(was), (err) ->
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
                        @merge.moveFile @side, clone(doc), clone(was), (err) =>
                            should.not.exist err
                            @pouch.db.get @file._id, (err, res) =>
                                should.not.exist err
                                res.should.have.properties doc
                                should.not.exist res.size
                                should.not.exist res.class
                                should.not.exist res.mime
                                res.sides.local.should.equal 2
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
                @merge.moveFolder @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid id'
                    done()

            it 'expects a was with a valid id', (done) ->
                doc = _id: 'foo/bar'
                was = _id: ''
                @merge.moveFolder @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid id'
                    done()

            it 'expects two different paths', (done) ->
                doc =
                    _id: 'foo/bar'
                    docType: 'folder'
                was =
                    _id: 'foo/bar'
                    docType: 'folder'
                @merge.moveFolder @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid move'
                    done()

            it 'expects a revision for was', (done) ->
                doc =
                    _id: 'foo/bar'
                    docType: 'folder'
                was =
                    _id: 'foo/baz'
                    docType: 'folder'
                @merge.moveFolder @side, doc, was, (err) ->
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
                    @merge.moveFolder @side, clone(doc), clone(was), (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err, res) =>
                            should.not.exist err
                            for date in ['creationDate', 'lastModification']
                                doc[date] = doc[date].toISOString()
                            res.should.have.properties doc
                            res.sides.local.should.equal 1
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
                    @merge.moveFolder @side, doc, clone(was), (err) =>
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
                    @merge.moveFolder @side, clone(doc), clone(was), (err) ->
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
                        @merge.moveFolder @side, clone(doc), was, (err) =>
                            should.not.exist err
                            @pouch.db.get @folder._id, (err, res) =>
                                should.not.exist err
                                res.should.have.properties doc
                                res.sides.local.should.equal 2
                                @pouch.db.get was._id, (err, res) ->
                                    should.exist err
                                    err.status.should.equal 404
                                    done()

                it 'can resolve a conflict', ->
                    it 'TODO'

        describe 'moveFolderRecursively', ->
            before (done) ->
                pouchHelpers.createParentFolder @pouch, =>
                    pouchHelpers.createFolder @pouch, 9, =>
                        pouchHelpers.createFile @pouch, 9, done

            it 'move the folder and files/folders inside it', (done) ->
                doc =
                    _id: 'destination'
                    docType: 'folder'
                    creationDate: new Date
                    lastModification: new Date
                    tags: []
                @pouch.db.get 'my-folder', (err, was) =>
                    should.not.exist err
                    @merge.moveFolderRecursively doc, was, (err) =>
                        should.not.exist err
                        ids = [
                            '',
                            '/folder-9',
                            '/file-9'
                        ]
                        async.eachSeries ids, (id, next) =>
                            @pouch.db.get "destination#{id}", (err, res) =>
                                should.not.exist err
                                should.exist res
                                @pouch.db.get "my-folder#{id}", (err, res) ->
                                    err.status.should.equal 404
                                    next()
                        , done


    describe 'Delete', ->

        describe 'deleteFile', ->
            it 'deletes a file', (done) ->
                doc =
                    _id: 'to-delete/file'
                    docType: 'file'
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @merge.deleteFile @side, doc, (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err) ->
                            err.status.should.equal 404
                            done()

        describe 'deleteFolder', ->
            it 'deletes a folder', (done) ->
                doc =
                    _id: 'to-delete/folder'
                    docType: 'folder'
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @merge.deleteFolder @side, doc, (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err, res) ->
                            err.status.should.equal 404
                            done()

            it 'remove files in the folder', (done) ->
                doc =
                    _id: 'foo/to-remove'
                    docType: 'folder'
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    async.eachSeries ['baz', 'qux', 'quux'], (name, next) =>
                        file =
                            _id: "foo/to-remove/#{name}"
                            docType: 'file'
                        @pouch.db.put file, next
                    , (err) =>
                        should.not.exist err
                        @merge.deleteFolder @side, doc, (err) =>
                            should.not.exist err
                            @pouch.byPath 'foo/to-remove', (err, docs) ->
                                docs.length.should.be.equal 0
                                done()

            it 'remove nested folders', (done) ->
                async.eachSeries ['', '/b', '/b/c', '/b/d'], (name, next) =>
                    doc =
                        _id: "nested/to-delete#{name}"
                        docType: 'folder'
                    @pouch.db.put doc, next
                , (err) =>
                    should.not.exist err
                    @merge.deleteFolder @side, _id: 'nested/to-delete', (err) =>
                        should.not.exist err
                        @pouch.db.allDocs (err, res) ->
                            should.not.exist err
                            for row in res.rows
                                row.id.should.not.match /^nested/
                            done()
