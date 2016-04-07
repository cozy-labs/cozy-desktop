async  = require 'async'
sinon  = require 'sinon'
should = require 'should'

Ignore = require '../../src/ignore'
Sync   = require '../../src/sync'


configHelpers = require '../helpers/config'
pouchHelpers  = require '../helpers/pouch'


describe "Sync", ->

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig


    describe 'start', ->
        beforeEach 'instanciate sync', ->
            @local  = start: sinon.stub().yields()
            @remote = start: sinon.stub().yields()
            @ignore = new Ignore []
            @events = {}
            @sync = new Sync @pouch, @local, @remote, @ignore, @events
            @sync.sync = sinon.stub().yields 'stopped'

        it 'starts the metadata replication of remote in read only', (done) ->
            @sync.start 'pull', (err) =>
                err.should.equal 'stopped'
                @local.start.called.should.be.false()
                @remote.start.calledOnce.should.be.true()
                @sync.sync.calledOnce.should.be.true()
                done()

        it 'starts the metadata replication of local in write only', (done) ->
            @sync.start 'push', (err) =>
                err.should.equal 'stopped'
                @local.start.calledOnce.should.be.true()
                @remote.start.called.should.be.false()
                @sync.sync.calledOnce.should.be.true()
                done()

        it 'starts the metadata replication of both in full', (done) ->
            @sync.start 'full', (err) =>
                err.should.equal 'stopped'
                @local.start.calledOnce.should.be.true()
                @remote.start.calledOnce.should.be.true()
                @sync.sync.calledOnce.should.be.true()
                done()

        it 'does not start sync if metadata replication fails', (done) ->
            @local.start = sinon.stub().yields 'failed'
            @sync.start 'full', (err) =>
                err.should.equal 'failed'
                @local.start.calledOnce.should.be.true()
                @remote.start.called.should.be.false()
                @sync.sync.calledOnce.should.be.false()
                done()


    describe 'sync', ->
        beforeEach ->
            @local = {}
            @remote = {}
            @ignore = new Ignore []
            @events = {}
            @sync = new Sync @pouch, @local, @remote, @ignore, @events
            @sync.apply = sinon.stub().yields()
            @sync.running = true

        it 'calls pop and apply', (done) ->
            @sync.pop = sinon.stub().yields null, { change: true }
            @sync.sync (err) =>
                should.not.exist err
                @sync.pop.calledOnce.should.be.true()
                @sync.apply.calledOnce.should.be.true()
                @sync.apply.calledWith(change: true).should.be.true()
                done()

        it 'calls pop but not apply if pop has failed', (done) ->
            @sync.pop = sinon.stub().yields 'failed'
            @sync.sync (err) =>
                err.should.equal 'failed'
                @sync.pop.calledOnce.should.be.true()
                @sync.apply.calledOnce.should.be.false()
                done()


    describe 'pop', ->
        beforeEach (done) ->
            @local = {}
            @remote = {}
            @ignore = new Ignore []
            @events = emit: sinon.spy()
            @sync = new Sync @pouch, @local, @remote, @ignore, @events
            @pouch.db.changes().on 'complete', (info) =>
                @pouch.setLocalSeq info.last_seq, done

        it 'gives the next change if there is already one', (done) ->
            pouchHelpers.createFile @pouch, 1, (err) =>
                should.not.exist err
                @sync.pop (err, change) =>
                    should.not.exist err
                    @pouch.getLocalSeq (err, seq) ->
                        should.not.exist err
                        change.should.have.properties
                            id: 'my-folder/file-1'
                            seq: seq + 1
                        change.doc.should.have.properties
                            _id: 'my-folder/file-1'
                            docType: 'file'
                            tags: []
                        done()

        it 'gives only one change', (done) ->
            async.eachSeries [2..5], (i, callback) =>
                pouchHelpers.createFile @pouch, i, callback
            , (err) =>
                should.not.exist err
                spy = sinon.spy()
                @sync.pop spy
                setTimeout ->
                    spy.calledOnce.should.be.true()
                    done()
                , 10

        it 'filters design doc changes', (done) ->
            query = """
                function(doc) {
                    if ('size' in doc) emit(doc.size);
                }
                """
            @pouch.createDesignDoc 'bySize', query, (err) =>
                should.not.exist err
                pouchHelpers.createFile @pouch, 6, (err) =>
                    should.not.exist err
                    spy = sinon.spy()
                    @sync.pop spy
                    setTimeout ->
                        spy.calledOnce.should.be.true()
                        [err, change] = spy.args[0]
                        should.not.exist err
                        change.doc.docType.should.equal 'file'
                        done()
                    , 10

        it 'waits for the next change if there no available change', (done) ->
            spy = sinon.spy()
            @sync.pop (err, change) =>
                spy()
                should.not.exist err
                @pouch.getLocalSeq (err, seq) ->
                    should.not.exist err
                    change.should.have.properties
                        id: 'my-folder/file-7'
                        seq: seq + 1
                    change.doc.should.have.properties
                        _id: 'my-folder/file-7'
                        docType: 'file'
                        tags: []
                    done()
            setTimeout =>
                spy.called.should.be.false()
                pouchHelpers.createFile @pouch, 7, (err) ->
                    should.not.exist err
            , 10

        it 'emits up-to-date if there are no available change', (done) ->
            spy = sinon.spy()
            @sync.pop (err, change) =>
                should.not.exist err
                setTimeout done, 11
            setTimeout =>
                @events.emit.calledWith('up-to-date').should.be.true()
                pouchHelpers.createFile @pouch, 8, (err) ->
                    should.not.exist err
            , 10


    describe 'apply', ->
        beforeEach ->
            @local = {}
            @remote = {}
            @ignore = new Ignore ['ignored']
            @events = {}
            @sync = new Sync @pouch, @local, @remote, @ignore, @events

        it 'does nothing for an ignored document', (done) ->
            change =
                seq: 121
                doc:
                    _id: 'ignored'
                    docType: 'folder'
                    sides:
                        local: 1
            @sync.folderChanged = sinon.spy()
            @sync.apply change, (err) =>
                should.not.exist err
                @sync.folderChanged.called.should.be.false()
                done()

        it 'does nothing for an up-to-date document', (done) ->
            change =
                seq: 122
                doc:
                    _id: 'foo'
                    docType: 'folder'
                    sides:
                        local: 1
                        remote: 1
            @sync.folderChanged = sinon.spy()
            @sync.apply change, (err) =>
                should.not.exist err
                @sync.folderChanged.called.should.be.false()
                done()

        it 'calls fileChanged for a file', (done) ->
            change =
                seq: 123
                doc:
                    _id: 'foo/bar'
                    docType: 'file'
                    checksum: '0000000000000000000000000000000000000000'
                    sides:
                        local: 1
            @sync.fileChanged = sinon.stub().yields()
            @sync.apply change, (err) =>
                should.not.exist err
                @sync.fileChanged.called.should.be.true()
                @sync.fileChanged.calledWith(change.doc).should.be.true()
                done()

        it 'calls folderChanged for a folder', (done) ->
            change =
                seq: 124
                doc:
                    _id: 'foo/baz'
                    docType: 'folder'
                    tags: []
                    sides:
                        local: 1
            @sync.folderChanged = sinon.stub().yields()
            @sync.apply change, (err) =>
                should.not.exist err
                @sync.folderChanged.called.should.be.true()
                @sync.folderChanged.calledWith(change.doc).should.be.true()
                done()


    describe 'applied', ->
        @timeout 5000

        beforeEach ->
            @local = {}
            @remote = {}
            @ignore = new Ignore []
            @events = {}
            @sync = new Sync @pouch, @local, @remote, @ignore, @events

        it 'returns a function that saves the seq number if OK', (done) ->
            change =
                seq: 125
                doc:
                    _id: 'just/deleted'
                    _deleted: true
            func = @sync.applied change, 'remote', (err) =>
                should.not.exist err
                @pouch.getLocalSeq (err, seq) ->
                    seq.should.equal 125
                    done()
            func()

        it 'saves the revision for the applied side', (done) ->
            doc =
                _id: 'just/created'
                docType: 'folder'
                sides:
                    local: 1
            @pouch.db.put doc, (err, infos) =>
                should.not.exist err
                @pouch.setLocalSeq 126, =>
                    change =
                        seq: 127
                        doc: doc
                    change.doc._rev = infos.rev
                    func = @sync.applied change, 'remote', (err) =>
                        should.not.exist err
                        @pouch.db.get change.doc._id, (err, doc) ->
                            should.not.exist err
                            doc.should.have.properties
                                _id: 'just/created'
                                docType: 'folder'
                                sides:
                                    local: 2
                                    remote: 2
                            done()
                    func()

        it 'returns a function that does not touch the seq if error', (done) ->
            @pouch.setLocalSeq 128, =>
                change =
                    seq: 129
                    doc:
                        _id: 'not/important'
                func = @sync.applied change, 'remote', (err) =>
                    should.not.exist err
                    @pouch.getLocalSeq (err, seq) ->
                        seq.should.equal 128
                        done()
                func new Error 'Apply failed'


    describe 'updateErrors', ->
        @timeout 5000

        beforeEach ->
            @local = {}
            @remote = {}
            @ignore = new Ignore []
            @events = {}
            @sync = new Sync @pouch, @local, @remote, @ignore, @events

        it 'sets the errors counter to 1 on first error', (done) ->
            doc =
                _id: 'first/failure'
            @pouch.db.put doc, (err, infos) =>
                should.not.exist err
                doc._rev = infos.rev
                @sync.updateErrors doc, =>
                    @pouch.db.get doc._id, (err, actual) ->
                        should.not.exist err
                        actual.errors.should.equal 1
                        done()

        it 'increments the errors counter to 1 on next error', (done) ->
            doc =
                _id: 'fourth/failure'
                errors: 3
            @pouch.db.put doc, (err, infos) =>
                should.not.exist err
                doc._rev = infos.rev
                @sync.updateErrors doc, =>
                    @pouch.db.get doc._id, (err, actual) ->
                        should.not.exist err
                        actual.errors.should.equal 4
                        done()

        it 'stops retrying after 10 errors', (done) ->
            doc =
                _id: 'eleventh/failure'
                errors: 10
            @pouch.db.put doc, (err, infos) =>
                should.not.exist err
                doc._rev = infos.rev
                @sync.updateErrors doc, =>
                    @pouch.db.get doc._id, (err, actual) ->
                        should.not.exist err
                        actual.errors.should.equal 10
                        actual._rev.should.equal doc._rev
                        done()


    describe 'fileChanged', ->
        beforeEach ->
            @local = {}
            @remote = {}
            @ignore = new Ignore []
            @events = {}
            @sync = new Sync @pouch, @local, @remote, @ignore, @events

        it 'calls addFile for an added file', (done) ->
            doc =
                _id: 'foo/bar'
                _rev: '1-abcdef0123456789'
                checksum: '391f7abfca1124c3ca937e5f85687352bcd9f261'
                docType: 'file'
                sides:
                    local: 1
            @remote.addFile = sinon.stub().yields()
            @sync.fileChanged doc, @remote, 0, (err) =>
                should.not.exist err
                @remote.addFile.calledWith(doc).should.be.true()
                done()

        it 'calls overwriteFile for an overwritten file', (done) ->
            doc =
                _id: 'overwrite/foo/bar'
                checksum: '391f7abfca1124c3ca937e5f85687352bcd9f261'
                docType: 'file'
                sides:
                    local: 1
            @pouch.db.put doc, (err, created) =>
                should.not.exist err
                doc._rev = created.rev
                doc.checksum = '389dd709c94a6a7ea56e1d55cbf65eef31b9bc5e'
                doc.sides =
                    local: 2
                    remote: 1
                @pouch.db.put doc, (err, updated) =>
                    @remote.overwriteFile = sinon.stub().yields()
                    @remote.updateFileMetadata = sinon.stub().yields()
                    @sync.fileChanged doc, @remote, 1, (err) =>
                        should.not.exist err
                        @remote.updateFileMetadata.called.should.be.false
                        @remote.overwriteFile.calledWith(doc).should.be.true()
                        done()

        it 'calls updateFileMetadata for updated file metadata', (done) ->
            doc =
                _id: 'update/foo/bar'
                checksum: '391f7abfca1124c3ca937e5f85687352bcd9f261'
                docType: 'file'
                sides:
                    local: 1
            @pouch.db.put doc, (err, created) =>
                should.not.exist err
                doc._rev = created.rev
                doc.tags = ['courge']
                doc.sides =
                    local: 2
                    remote: 1
                @pouch.db.put doc, (err, updated) =>
                    @remote.overwriteFile = sinon.stub().yields()
                    @remote.updateFileMetadata = sinon.stub().yields()
                    @sync.fileChanged doc, @remote, 1, (err) =>
                        should.not.exist err
                        @remote.overwriteFile.called.should.be.false
                        ufm = @remote.updateFileMetadata
                        ufm.calledWith(doc).should.be.true()
                        done()

        it 'calls moveFile for a moved file', (done) ->
            was =
                _id: 'foo/bar'
                _rev: '3-9876543210'
                _deleted: true
                moveTo: 'foo/baz'
                docType: 'file'
                tags: ['qux']
                sides:
                    local: 3
                    remote: 2
            doc =
                _id: 'foo/baz'
                _rev: '1-abcdef'
                docType: 'file'
                tags: ['qux']
                sides:
                    local: 1
            @remote.deleteFile = sinon.stub().yields()
            @remote.addFile = sinon.stub().yields()
            @remote.moveFile = sinon.stub().yields()
            @sync.fileChanged was, @remote, 2, (err) =>
                should.not.exist err
                @remote.deleteFile.called.should.be.false()
                @sync.fileChanged doc, @remote, 0, (err) =>
                    should.not.exist err
                    @remote.addFile.called.should.be.false()
                    @remote.moveFile.calledWith(doc, was).should.be.true()
                    done()

        it 'calls deleteFile for a deleted file', (done) ->
            doc =
                _id: 'foo/baz'
                _rev: '4-1234567890'
                _deleted: true
                docType: 'file'
                sides:
                    local: 1
                    remote: 2
            @local.deleteFile = sinon.stub().yields()
            @sync.fileChanged doc, @local, 1, (err) =>
                should.not.exist err
                @local.deleteFile.calledWith(doc).should.be.true()
                done()

        it 'does nothing for a deleted file that was not added', (done) ->
            doc =
                _id: 'tmp/fooz'
                _rev: '2-1234567890'
                _deleted: true
                docType: 'file'
                sides:
                    local: 2
            @remote.deleteFile = sinon.stub().yields()
            @sync.fileChanged doc, @remote, 0, (err) =>
                should.not.exist err
                @remote.deleteFile.called.should.be.false()
                done()


    describe 'folderChanged', ->
        beforeEach ->
            @local = {}
            @remote = {}
            @ignore = new Ignore []
            @events = {}
            @sync = new Sync @pouch, @local, @remote, @ignore, @events

        it 'calls addFolder for an added folder', (done) ->
            doc =
                _id: 'foobar/bar'
                _rev: '1-abcdef0123456789'
                docType: 'folder'
                sides:
                    local: 1
            @remote.addFolder = sinon.stub().yields()
            @sync.folderChanged doc, @remote, 0, (err) =>
                should.not.exist err
                @remote.addFolder.calledWith(doc).should.be.true()
                done()

        it 'calls updateFolder for an updated folder', (done) ->
            doc =
                _id: 'foobar/bar'
                _rev: '2-abcdef9876543210'
                docType: 'folder'
                tags: ['qux']
                sides:
                    local: 1
                    remote: 2
            @local.updateFolder = sinon.stub().yields()
            @sync.folderChanged doc, @local, 1, (err) =>
                should.not.exist err
                @local.updateFolder.calledWith(doc).should.be.true()
                done()

        it 'calls moveFolder for a moved folder', (done) ->
            was =
                _id: 'foobar/bar'
                _rev: '3-9876543210'
                _deleted: true
                moveTo: 'foobar/baz'
                docType: 'folder'
                tags: ['qux']
                sides:
                    local: 3
                    remote: 2
            doc =
                _id: 'foobar/baz'
                _rev: '1-abcdef'
                docType: 'folder'
                tags: ['qux']
                sides:
                    local: 1
            @remote.deleteFolder = sinon.stub().yields()
            @remote.addFolder = sinon.stub().yields()
            @remote.moveFolder = sinon.stub().yields()
            @sync.folderChanged was, @remote, 2, (err) =>
                should.not.exist err
                @remote.deleteFolder.called.should.be.false()
                @sync.folderChanged doc, @remote, 0, (err) =>
                    should.not.exist err
                    @remote.addFolder.called.should.be.false()
                    @remote.moveFolder.calledWith(doc, was).should.be.true()
                    done()

        it 'calls deleteFolder for a deleted folder', (done) ->
            doc =
                _id: 'foobar/baz'
                _rev: '4-1234567890'
                _deleted: true
                docType: 'folder'
                sides:
                    local: 1
                    remote: 2
            @local.deleteFolder = sinon.stub().yields()
            @sync.folderChanged doc, @local, 1, (err) =>
                should.not.exist err
                @local.deleteFolder.calledWith(doc).should.be.true()
                done()

        it 'does nothing for a deleted folder that was not added', (done) ->
            doc =
                _id: 'tmp/foobaz'
                _rev: '2-1234567890'
                _deleted: true
                docType: 'folder'
                sides:
                    local: 2
            @remote.deleteFolder = sinon.stub().yields()
            @sync.folderChanged doc, @remote, 0, (err) =>
                should.not.exist err
                @remote.deleteFolder.called.should.be.false()
                done()


    describe 'selectSide', ->
        beforeEach ->
            @local = {}
            @remote = {}
            @ignore = new Ignore []
            @events = {}
            @sync = new Sync @pouch, @local, @remote, @ignore, @events

        it 'selects the local side if remote is up-to-date', ->
            doc =
                _id: 'selectSide/1'
                _rev: '1-0123456789'
                docType: 'file'
                sides:
                    remote: 1
            [side, name, rev] = @sync.selectSide(doc)
            side.should.equal @sync.local
            name.should.equal 'local'
            rev.should.equal 0
            doc =
                _id: 'selectSide/2'
                _rev: '3-0123456789'
                docType: 'file'
                sides:
                    remote: 3
                    local: 2
            [side, name, rev] = @sync.selectSide(doc)
            side.should.equal @sync.local
            name.should.equal 'local'
            rev.should.equal 2

        it 'selects the remote side if local is up-to-date', ->
            doc =
                _id: 'selectSide/3'
                _rev: '1-0123456789'
                docType: 'file'
                sides:
                    local: 1
            [side, name, rev] = @sync.selectSide(doc)
            side.should.equal @sync.remote
            name.should.equal 'remote'
            rev.should.equal 0
            doc =
                _id: 'selectSide/4'
                _rev: '4-0123456789'
                docType: 'file'
                sides:
                    remote: 3
                    local: 4
            [side, name, rev] = @sync.selectSide(doc)
            side.should.equal @sync.remote
            name.should.equal 'remote'
            rev.should.equal 3

        it 'returns an empty array if both sides are up-to-date', ->
            doc =
                _id: 'selectSide/5'
                _rev: '5-0123456789'
                docType: 'file'
                sides:
                    remote: 5
                    local: 5
            [side, name, rev] = @sync.selectSide(doc)
            should.not.exist side
            should.not.exist name
            should.not.exist rev
