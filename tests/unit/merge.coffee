async  = require 'async'
clone  = require 'lodash.clone'
sinon  = require 'sinon'
should = require 'should'

Merge = require '../../backend/merge'

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

        describe 'updatePathOnConflict', ->
            it 'appends -conflict- and the date to the path', ->
                doc = path: 'foo/bar'
                @merge.updatePathOnConflict doc
                parts = doc.path.split '-conflict-'
                parts[0].should.equal 'foo/bar'
                parts = parts[1].split 'T'
                parts[0].should.match /^\d{4}-\d{2}-\d{2}$/
                parts[1].should.match /^\d{2}:\d{2}:\d{2}.\d{3}Z$/

        describe 'sameDate', ->
            it 'returns true if the date are nearly the same', ->
                a = '2015-12-01T11:22:56.517Z'
                b = '2015-12-01T11:22:56.000Z'
                c = '2015-12-01T11:22:57.000Z'
                d = '2015-12-01T11:22:59.200Z'
                e = '2015-12-01T11:22:52.200Z'
                @merge.sameDate(a, b).should.be.true()
                @merge.sameDate(a, c).should.be.true()
                @merge.sameDate(a, d).should.be.true()
                @merge.sameDate(a, e).should.be.false()
                @merge.sameDate(b, c).should.be.true()
                @merge.sameDate(b, d).should.be.false()
                @merge.sameDate(b, e).should.be.false()
                @merge.sameDate(c, d).should.be.true()
                @merge.sameDate(c, e).should.be.false()
                @merge.sameDate(d, e).should.be.false()

        describe 'sameFolder', ->
            it 'returns true if the folders are the same', ->
                a =
                    _id: 'FOO/BAR'
                    docType: 'folder'
                    path: 'foo/bar'
                    creationDate: '2015-12-01T11:22:56.517Z'
                    lastModification: '2015-12-01T11:22:56.517Z'
                    tags: ['qux']
                    remote:
                        id: '123'
                        rev: '4-567'
                b =
                    _id: 'FOO/BAR'
                    docType: 'folder'
                    path: 'FOO/BAR'
                    creationDate: '2015-12-01T11:22:56.000Z'
                    lastModification: '2015-12-01T11:22:57.000Z'
                    tags: ['qux']
                    remote:
                        id: '123'
                        rev: '4-567'
                c =
                    _id: 'FOO/BAR'
                    docType: 'folder'
                    path: 'FOO/BAR'
                    creationDate: '2015-12-01T11:22:56.000Z'
                    lastModification: '2015-12-01T11:22:57.000Z'
                    tags: ['qux', 'courge']
                    remote:
                        id: '123'
                        rev: '4-567'
                d =
                    _id: 'FOO/BAR'
                    docType: 'folder'
                    path: 'FOO/BAR'
                    creationDate: '2015-12-01T11:22:56.000Z'
                    lastModification: '2015-12-01T11:22:57.000Z'
                    tags: ['qux', 'courge']
                    remote:
                        id: '123'
                        rev: '8-901'
                e =
                    _id: 'FOO/BAZ'
                    docType: 'folder'
                    path: 'FOO/BAZ'
                    creationDate: '2015-12-01T11:22:56.000Z'
                    lastModification: '2015-12-01T11:22:57.000Z'
                    tags: ['qux']
                    remote:
                        id: '123'
                        rev: '4-567'
                @merge.sameFolder(a, b).should.be.true()
                @merge.sameFolder(a, c).should.be.false()
                @merge.sameFolder(a, d).should.be.false()
                @merge.sameFolder(a, e).should.be.false()
                @merge.sameFolder(b, c).should.be.false()
                @merge.sameFolder(b, d).should.be.false()
                @merge.sameFolder(b, e).should.be.false()
                @merge.sameFolder(c, d).should.be.false()
                @merge.sameFolder(c, e).should.be.false()
                @merge.sameFolder(d, e).should.be.false()

        describe 'sameFile', ->
            it 'returns true if the files are the same', ->
                a =
                    _id: 'FOO/BAR'
                    docType: 'file'
                    path: 'foo/bar'
                    checksum: '9440ca447681546bd781d6a5166d18737223b3f6'
                    creationDate: '2015-12-01T11:22:56.517Z'
                    lastModification: '2015-12-01T11:22:56.517Z'
                    tags: ['qux']
                    remote:
                        id: '123'
                        rev: '4-567'
                b =
                    _id: 'FOO/BAR'
                    docType: 'file'
                    path: 'FOO/BAR'
                    checksum: '9440ca447681546bd781d6a5166d18737223b3f6'
                    creationDate: '2015-12-01T11:22:56.000Z'
                    lastModification: '2015-12-01T11:22:57.000Z'
                    tags: ['qux']
                    remote:
                        id: '123'
                        rev: '4-567'
                c =
                    _id: 'FOO/BAR'
                    docType: 'file'
                    path: 'FOO/BAR'
                    checksum: '000000047681546bd781d6a5166d18737223b3f6'
                    creationDate: '2015-12-01T11:22:56.000Z'
                    lastModification: '2015-12-01T11:22:57.000Z'
                    tags: ['qux']
                    remote:
                        id: '123'
                        rev: '4-567'
                d =
                    _id: 'FOO/BAR'
                    docType: 'file'
                    path: 'FOO/BAR'
                    checksum: '9440ca447681546bd781d6a5166d18737223b3f6'
                    creationDate: '2015-12-01T11:22:56.000Z'
                    lastModification: '2015-12-01T11:22:57.000Z'
                    tags: ['qux']
                    remote:
                        id: '123'
                        rev: '8-901'
                e =
                    _id: 'FOO/BAZ'
                    docType: 'file'
                    path: 'FOO/BAZ'
                    checksum: '9440ca447681546bd781d6a5166d18737223b3f6'
                    creationDate: '2015-12-01T11:22:56.000Z'
                    lastModification: '2015-12-01T11:22:57.000Z'
                    tags: ['qux']
                    remote:
                        id: '123'
                        rev: '4-567'
                f =
                    _id: 'FOO/BAR'
                    docType: 'file'
                    path: 'foo/bar'
                    checksum: '9440ca447681546bd781d6a5166d18737223b3f6'
                    creationDate: '2015-12-01T11:22:56.517Z'
                    lastModification: '2015-12-01T11:22:56.517Z'
                    size: 12345
                    tags: ['qux']
                    remote:
                        id: '123'
                        rev: '4-567'
                @merge.sameFile(a, b).should.be.true()
                @merge.sameFile(a, c).should.be.false()
                @merge.sameFile(a, d).should.be.false()
                @merge.sameFile(a, e).should.be.false()
                @merge.sameFile(a, f).should.be.false()
                @merge.sameFile(b, c).should.be.false()
                @merge.sameFile(b, d).should.be.false()
                @merge.sameFile(b, e).should.be.false()
                @merge.sameFile(b, f).should.be.false()
                @merge.sameFile(c, d).should.be.false()
                @merge.sameFile(c, e).should.be.false()
                @merge.sameFile(c, f).should.be.false()
                @merge.sameFile(d, e).should.be.false()
                @merge.sameFile(d, f).should.be.false()
                @merge.sameFile(e, f).should.be.false()

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
                        _id: 'f00b4r'
                two =
                    remote:
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
                        _id: 'f00b4r'
                three =
                    remote:
                        _id: 'c00463'
                ret = @merge.sameBinary one, two
                ret.should.be.false()
                ret = @merge.sameBinary two, three
                ret.should.be.false()
                ret = @merge.sameBinary three, one
                ret.should.be.false()

        describe 'ensureParentExist', ->
            it 'works when in the root folder', (done) ->
                @merge.ensureParentExist @side, _id: 'foo', (err) ->
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
                    @merge.ensureParentExist @side, child, (err) ->
                        should.not.exist err
                        done()

            it 'creates the parent directory if missing', (done) ->
                @merge.putFolder = sinon.stub().yields null, 'OK'
                doc =
                    _id: 'MISSING/CHILD'
                    path: 'missing/child'
                @merge.ensureParentExist @side, doc, (err) =>
                    should.not.exist err
                    @merge.putFolder.called.should.be.true()
                    @merge.putFolder.args[0][1].should.have.properties
                        _id: 'MISSING'
                        path: 'missing'
                        docType: 'folder'
                    done()

            it 'creates the full tree if needed', (done) ->
                @merge.putFolder = sinon.stub().yields null, 'OK'
                doc =
                    _id: 'a/b/c/d/e'
                    path: 'a/b/c/d/e'
                @merge.ensureParentExist @side, doc, (err) =>
                    should.not.exist err
                    for id, i in ['a', 'a/b', 'a/b/c', 'a/b/c/d']
                        @merge.putFolder.called.should.be.true()
                        @merge.putFolder.args[i][1].should.have.properties
                            _id: id
                            path: id
                            docType: 'folder'
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
                doc.sides.remote.should.equal 5


    describe 'Put', ->

        describe 'addFile', ->
            it 'saves the new file', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'foo/new-file'
                    path: 'foo/new-file'
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

            describe 'when a folder with the same path exists', ->
                it 'TODO'

            describe 'when a file with the same path exists', ->
                before 'create a file', (done) ->
                    @file =
                        _id: 'BUZZ.JPG'
                        path: 'BUZZ.JPG'
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
            it 'saves the new file', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'FOOBAR/NEW-FILE'
                    path: 'FOOBAR/NEW-FILE'
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

            describe 'when a folder with the same path exists', ->
                it 'TODO'

            describe 'when a file with the same path exists', ->
                before 'create a file', (done) ->
                    @file =
                        _id: 'FIZZBUZZ.JPG'
                        path: 'FIZZBUZZ.JPG'
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
                        _id: 'FIZZBUZZ.JPG'
                        path: 'FIZZBUZZ.JPG'
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
            it 'saves the new folder', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'FOO/NEW-FOLDER'
                    path: 'FOO/NEW-FOLDER'
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

            describe.skip 'when a file with the same path exists', ->
                before 'create a file', (done) ->
                    @file =
                        _id: 'CONFLICT/PUT-FOLDER'
                        path: 'CONFLICT/PUT-FOLDER'
                        docType: 'file'
                        checksum: '1bc9425d0ff90c05c17b9f39a7b7854be9992564'
                        creationDate: new Date
                        lastModification: new Date
                    @pouch.db.put @file, done

                it 'can resolve a conflict', (done) ->
                    @merge.ensureParentExist = sinon.stub().yields null
                    doc =
                        _id: 'CONFLICT/PUT-FOLDER'
                        path: 'CONFLICT/PUT-FOLDER'
                        docType: 'folder'
                        tags: ['qux', 'quux']
                    opts =
                        include_docs: true
                        live: true
                        since: 'now'
                    @pouch.db.changes(opts).on 'change', (info) ->
                        @cancel()
                        info.id.should.match doc._id
                        info.doc.docType.should.equal 'file'
                        info.doc.moveTo.should.match /-conflict-/
                    @merge.putFolder @side, doc, (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err, res) ->
                            should.not.exist err
                            for date in ['creationDate', 'lastModification']
                                doc[date] = doc[date].toISOString()
                            res.should.have.properties doc
                            setTimeout done, 10

            describe 'when a folder with the same path exists', ->
                before 'create a folder', (done) ->
                    @folder =
                        _id: 'FIZZ'
                        path: 'FIZZ'
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
                        for date in ['creationDate', 'lastModification']
                            doc[date] = doc[date].toISOString()
                        @pouch.db.get doc._id, (err, res) ->
                            should.not.exist err
                            res.should.have.properties doc
                            res.sides.local.should.equal 2
                            done()


    describe 'Move', ->

        describe 'moveFile', ->
            it 'saves the new file and deletes the old one', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'FOO/NEW'
                    path: 'FOO/NEW'
                    checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                    docType: 'file'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                was =
                    _id: 'FOO/OLD'
                    path: 'FOO/OLD'
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
                    _id: 'FOO/NEW-MISSING-FIELDS.JPG'
                    path: 'FOO/NEW-MISSING-FIELDS.JPG'
                    checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                was =
                    _id: 'FOO/OLD-MISSING-FIELDS.JPG'
                    path: 'FOO/OLD-MISSING-FIELDS.JPG'
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
                            doc.creationDate = doc.creationDate.toISOString()
                            res.should.have.properties doc
                            should.exist res.creationDate
                            should.exist res.size
                            should.exist res.class
                            should.exist res.mime
                            done()

            it 'adds a hint for writers to know that it is a move', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'FOO/NEW-HINT'
                    path: 'FOO/NEW-HINT'
                    checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                    docType: 'file'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                was =
                    _id: 'FOO/OLD-HINT'
                    path: 'FOO/OLD-HINT'
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

            describe.skip 'when a folder with the same path exists', ->
                before 'create a folder', (done) ->
                    @folder =
                        _id: 'FUZZ'
                        path: 'FUZZ'
                        docType: 'folder'
                        tags: ['foo']
                    @pouch.db.put @folder, done

                it 'can resolve the conflict', (done) ->
                    @merge.ensureParentExist = sinon.stub().yields null
                    doc =
                        _id: 'FUZZ'
                        path: 'FUZZ'
                        docType: 'file'
                        checksum: '3333333333333333333333333333333333333333'
                        tags: ['qux', 'quux']
                        size: 12345
                        class: 'image'
                        mime: 'image/jpeg'
                    was =
                        _id: 'old-fuzz'
                        path: 'old-fuzz'
                        checksum: '3333333333333333333333333333333333333333'
                        docType: 'file'
                        creationDate: new Date
                        lastModification: new Date
                        tags: ['qux', 'quux']
                    @pouch.db.put clone(was), (err, inserted) =>
                        should.not.exist err
                        was._rev = inserted.rev
                        @merge.moveFile @side, doc, clone(was), (err) =>
                            should.not.exist err
                            doc._id.should.match /-conflict-/
                            @pouch.db.get doc._id, (err, res) =>
                                should.not.exist err
                                for date in ['creationDate', 'lastModification']
                                    doc[date] = doc[date].toISOString()
                                res.should.have.properties doc
                                @pouch.db.get @folder._id, (err, res) =>
                                    should.not.exist err
                                    res.should.have.properties @folder
                                    @pouch.db.get was._id, (err, res) ->
                                        should.exist err
                                        err.status.should.equal 404
                                        done()

            describe.skip 'when a file with the same path exists', ->
                before 'create a file', (done) ->
                    @file =
                        _id: 'FUZZ.JPG'
                        path: 'FUZZ.JPG'
                        docType: 'file'
                        checksum: '1111111111111111111111111111111111111111'
                        tags: ['foo']
                    @pouch.db.put @file, done

                it 'can resolve the conflict', (done) ->
                    @merge.ensureParentExist = sinon.stub().yields null
                    doc =
                        _id: 'FUZZ.JPG'
                        path: 'FUZZ.JPG'
                        docType: 'file'
                        checksum: '3333333333333333333333333333333333333333'
                        tags: ['qux', 'quux']
                        size: 12345
                        class: 'image'
                        mime: 'image/jpeg'
                    was =
                        _id: 'old-fuzz.jpg'
                        path: 'old-fuzz.jpg'
                        checksum: '3333333333333333333333333333333333333333'
                        docType: 'file'
                        creationDate: new Date
                        lastModification: new Date
                        tags: ['qux', 'quux']
                    @pouch.db.put clone(was), (err, inserted) =>
                        should.not.exist err
                        was._rev = inserted.rev
                        @merge.moveFile @side, doc, clone(was), (err) =>
                            should.not.exist err
                            doc._id.should.match /-conflict-/
                            @pouch.db.get doc._id, (err, res) =>
                                should.not.exist err
                                for date in ['creationDate', 'lastModification']
                                    doc[date] = doc[date].toISOString()
                                res.should.have.properties doc
                                @pouch.db.get @file._id, (err, res) =>
                                    should.not.exist err
                                    res.should.have.properties @file
                                    @pouch.db.get was._id, (err, res) ->
                                        should.exist err
                                        err.status.should.equal 404
                                        done()


        describe 'moveFolder', ->
            it 'saves the new folder and deletes the old one', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'FOOBAR/NEW'
                    path: 'FOOBAR/NEW'
                    docType: 'folder'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                was =
                    _id: 'FOOBAR/OLD'
                    path: 'FOOBAR/OLD'
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

            it 'adds a hint for writers to know that it is a move', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'FOOBAR/NEW-HINT'
                    path: 'FOOBAR/NEW-HINT'
                    docType: 'folder'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                was =
                    _id: 'FOOBAR/OLD-HINT'
                    path: 'FOOBAR/OLD-HINT'
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

            describe.skip 'when a file with the same path exists', ->
                before 'create a file', (done) ->
                    @file =
                        _id: 'CONFLICT/FOOBAR'
                        path: 'CONFLICT/FOOBAR'
                        docType: 'file'
                        checksum: '1bc9425d0ff90c05c17b9f39a7b7854be9992564'
                        creationDate: new Date
                        lastModification: new Date
                    @pouch.db.put @file, done

                it 'can resolve a conflict', (done) ->
                    @merge.ensureParentExist = sinon.stub().yields null
                    doc =
                        _id: 'CONFLICT/FOOBAR'
                        path: 'CONFLICT/FOOBAR'
                        docType: 'folder'
                        tags: ['qux', 'quux']
                    was =
                        _id: 'OLD-FOOBAR'
                        path: 'OLD-FOOBAR'
                        docType: 'folder'
                        creationDate: new Date
                        lastModification: new Date
                        tags: ['qux', 'quux']
                    opts =
                        include_docs: true
                        live: true
                        since: 'now'
                    @pouch.db.put clone(was), (err, inserted) =>
                        should.not.exist err
                        was._rev = inserted.rev
                        @pouch.db.changes(opts).on 'change', (info) ->
                            @cancel()
                            info.id.should.match doc._id
                            info.doc.docType.should.equal 'file'
                            info.doc.moveTo.should.match /-conflict-/
                        @merge.moveFolder @side, doc, was, (err) =>
                            should.not.exist err
                            @pouch.db.get doc._id, (err, res) =>
                                should.not.exist err
                                for date in ['creationDate', 'lastModification']
                                    doc[date] = doc[date].toISOString()
                                res.should.have.properties doc
                                @pouch.db.get was._id, (err, res) ->
                                    should.exist err
                                    err.status.should.equal 404
                                    setTimeout done, 10

            describe.skip 'when a folder with the same path exists', ->
                before 'create a folder', (done) ->
                    @folder =
                        _id: 'CONFLICT/FOOBAZ'
                        path: 'CONFLICT/FOOBAZ'
                        docType: 'folder'
                        creationDate: new Date
                        lastModification: new Date
                        tags: ['foo']
                    @pouch.db.put @folder, done

                it 'can resolve a conflict', (done) ->
                    @merge.ensureParentExist = sinon.stub().yields null
                    doc =
                        _id: 'CONFLICT/FOOBAZ'
                        path: 'CONFLICT/FOOBAZ'
                        docType: 'folder'
                        tags: ['qux', 'quux']
                    was =
                        _id: 'OLD-FOOBAZ'
                        path: 'OLD-FOOBAZ'
                        docType: 'folder'
                        creationDate: new Date
                        lastModification: new Date
                        tags: ['qux', 'quux']
                    @pouch.db.put clone(was), (err, inserted) =>
                        should.not.exist err
                        was._rev = inserted.rev
                        @merge.moveFolder @side, doc, was, (err) =>
                            should.not.exist err
                            doc._id.should.not.equal @folder._id
                            doc.path.should.not.equal @folder.path
                            @pouch.db.get @folder._id, (err, res) =>
                                should.not.exist err
                                should.exist res
                                res.tags.should.deepEqual ['foo']
                                @pouch.db.get doc._id, (err, res) =>
                                    doc.path.should.match /-conflict-/
                                    res.sides.local.should.equal 1
                                    @pouch.db.get was._id, (err, res) ->
                                        should.exist err
                                        err.status.should.equal 404
                                        done()


        describe 'moveFolderRecursively', ->
            before (done) ->
                pouchHelpers.createParentFolder @pouch, =>
                    pouchHelpers.createFolder @pouch, 9, =>
                        pouchHelpers.createFile @pouch, 9, done

            it 'move the folder and files/folders inside it', (done) ->
                doc =
                    _id: 'DESTINATION'
                    path: 'DESTINATION'
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
                            @pouch.db.get "DESTINATION#{id}", (err, res) =>
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
                    _id: 'TO-DELETE/FILE'
                    path: 'TO-DELETE/FILE'
                    docType: 'file'
                    sides:
                        local: 1
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
                    _id: 'TO-DELETE/FOLDER'
                    path: 'TO-DELETE/FOLDER'
                    docType: 'folder'
                    sides:
                        local: 1
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @merge.deleteFolder @side, doc, (err) =>
                        should.not.exist err
                        @pouch.db.get doc._id, (err, res) ->
                            err.status.should.equal 404
                            done()

            it 'remove files in the folder', (done) ->
                doc =
                    _id: 'FOO/TO-REMOVE'
                    path: 'FOO/TO-REMOVE'
                    docType: 'folder'
                    sides:
                        local: 1
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    async.eachSeries ['baz', 'qux', 'quux'], (name, next) =>
                        file =
                            _id: "FOO/TO-REMOVE/#{name}"
                            path: "FOO/TO-REMOVE/#{name}"
                            docType: 'file'
                        @pouch.db.put file, next
                    , (err) =>
                        should.not.exist err
                        @merge.deleteFolder @side, doc, (err) =>
                            should.not.exist err
                            @pouch.byPath 'FOO/TO-REMOVE', (err, docs) ->
                                docs.length.should.be.equal 0
                                done()

            it 'remove nested folders', (done) ->
                base = 'NESTED/TO-DELETE'
                async.eachSeries ['', '/b', '/b/c', '/b/d'], (name, next) =>
                    doc =
                        _id: "#{base}#{name}"
                        path: "#{base}#{name}"
                        docType: 'folder'
                        sides:
                            local: 1
                    @pouch.db.put doc, next
                , (err) =>
                    should.not.exist err
                    @merge.deleteFolder @side, _id: base, path: base, (err) =>
                        should.not.exist err
                        @pouch.db.allDocs (err, res) ->
                            should.not.exist err
                            for row in res.rows
                                row.id.should.not.match /^NESTED/i
                            done()
