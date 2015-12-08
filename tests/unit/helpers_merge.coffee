async  = require 'async'
clone  = require 'lodash.clone'
path   = require 'path'
sinon  = require 'sinon'
should = require 'should'

Merge = require '../../backend/merge'

configHelpers = require '../helpers/config'
pouchHelpers  = require '../helpers/pouch'


describe 'Merge Helpers', ->

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    beforeEach 'instanciate merge', ->
        @side  = 'local'
        @merge = new Merge @pouch
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig


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
            one =
                docType: 'file'
                checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
            two =
                docType: 'file'
                checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
            ret = @merge.sameBinary one, two
            ret.should.be.true()

        it 'returns true for two docs with the same remote file', ->
            one =
                checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                docType: 'file'
                remote:
                    _id: 'f00b4r'
            two =
                docType: 'file'
                remote:
                    _id: 'f00b4r'
            ret = @merge.sameBinary one, two
            ret.should.be.true()
            ret = @merge.sameBinary two, one
            ret.should.be.true()

        it 'returns false for two different documents', ->
            one =
                docType: 'file'
                checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
            two =
                docType: 'file'
                checksum: '2082e7f715f058acab2398d25d135cf5f4c0ce41'
                remote:
                    _id: 'f00b4r'
            three =
                docType: 'file'
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


    describe 'resolveConflictDoc', ->
        it 'appends -conflict- and the date to the path', (done) ->
            doc = path: 'foo/bar'
            @merge.local = {}
            spy = @merge.local.resolveConflict = sinon.stub().yields null
            @merge.resolveConflict @side, doc, ->
                spy.called.should.be.true()
                dst = spy.args[0][0]
                parts = dst.path.split '-conflict-'
                parts[0].should.equal 'foo/bar'
                parts = parts[1].split 'T'
                parts[0].should.match /^\d{4}-\d{2}-\d{2}$/
                parts[1].should.match /^\d{2}:\d{2}:\d{2}.\d{3}Z$/
                src = spy.args[0][1]
                src.path.should.equal doc.path
                done()

        it 'preserves the extension', (done) ->
            doc = path: 'foo/bar.jpg'
            @merge.local = {}
            spy = @merge.local.resolveConflict = sinon.stub().yields null
            @merge.resolveConflict @side, doc, ->
                spy.called.should.be.true()
                dst = spy.args[0][0]
                path.extname(dst.path).should.equal '.jpg'
                done()
