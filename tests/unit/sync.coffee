async  = require 'async'
sinon  = require 'sinon'
should = require 'should'

Sync = require '../../backend/sync'


configHelpers = require '../helpers/config'
pouchHelpers  = require '../helpers/pouch'


describe "Sync", ->

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate events', configHelpers.createEvents
    before 'instanciate pouch', pouchHelpers.createDatabase
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig

    describe 'start', ->
        beforeEach 'instanciate sync', ->
            @local  = start: sinon.stub().yields()
            @remote = start: sinon.stub().yields()
            @sync = new Sync @pouch, @local, @remote, @events
            @sync.sync = sinon.stub().yields 'stopped'

        it 'starts the metadata replication of remote in readonly', (done) ->
            @sync.start 'readonly', (err) =>
                err.should.equal 'stopped'
                @local.start.called.should.be.false()
                @remote.start.calledOnce.should.be.true()
                @sync.sync.calledOnce.should.be.true()
                done()

        it 'starts the metadata replication of local in writeonly', (done) ->
            @sync.start 'writeonly', (err) =>
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
            @sync = new Sync @pouch, @local, @remote
            @sync.apply = sinon.stub().yields()

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
            @sync = new Sync @pouch, @local, @remote
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

    describe 'apply', ->
        beforeEach ->
            @local = {}
            @remote = {}
            @sync = new Sync @pouch, @local, @remote

        it 'calls fileChanged for a file', (done) ->
            change =
                seq: 123
                doc:
                    _id: 'foo/bar'
                    docType: 'file'
                    checksum: '0000000000000000000000000000000000000000'
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
            @sync.folderChanged = sinon.stub().yields()
            @sync.apply change, (err) =>
                should.not.exist err
                @sync.folderChanged.called.should.be.true()
                @sync.folderChanged.calledWith(change.doc).should.be.true()
                done()

    describe 'applied', ->
        beforeEach ->
            @local = {}
            @remote = {}
            @sync = new Sync @pouch, @local, @remote

        it 'returns a function that saves the seq number if OK', (done) ->
            func = @sync.applied seq: 125, (err) =>
                should.not.exist err
                @pouch.getLocalSeq (err, seq) ->
                    seq.should.equal 125
                    done()
            func()

        it 'returns a function that does not touch the seq if error', (done) ->
            @pouch.setLocalSeq 126, =>
                func = @sync.applied seq: 127, (err) =>
                    should.exist err
                    @pouch.getLocalSeq (err, seq) ->
                        seq.should.equal 126
                        done()
                func new Error 'Apply failed'

    describe 'fileChanged', ->
        beforeEach ->
            @local = {}
            @remote = {}
            @sync = new Sync @pouch, @local, @remote

        it 'calls fileAdded for an added file', (done) ->
            doc =
                _id: 'foo/bar'
                _rev: '1-abcdef0123456789'
                docType: 'file'
            @sync.fileAdded = sinon.stub().yields()
            @sync.fileChanged doc, (err) =>
                should.not.exist err
                @sync.fileAdded.calledWith(doc).should.be.true()
                done()

        it 'calls fileUpdated for an updated file', (done) ->
            doc =
                _id: 'foo/bar'
                _rev: '2-abcdef9876543210'
                docType: 'file'
                tags: ['qux']
            @sync.fileUpdated = sinon.stub().yields()
            @sync.fileChanged doc, (err) =>
                should.not.exist err
                @sync.fileUpdated.calledWith(doc).should.be.true()
                done()

        it 'calls fileUpdated for an updated file', (done) ->
            was =
                _id: 'foo/bar'
                _rev: '3-9876543210'
                _deleted: true
                moveTo: 'foo/baz'
                docType: 'file'
                tags: ['qux']
            doc =
                _id: 'foo/baz'
                _rev: '1-abcdef'
                docType: 'file'
                tags: ['qux']
            @sync.fileDeleted = sinon.stub().yields()
            @sync.fileAdded = sinon.stub().yields()
            @sync.fileMoved = sinon.stub().yields()
            @sync.fileChanged was, (err) =>
                should.not.exist err
                @sync.fileDeleted.called.should.be.false()
                @sync.fileChanged doc, (err) =>
                    should.not.exist err
                    @sync.fileAdded.called.should.be.false()
                    @sync.fileMoved.calledWith(doc, was).should.be.true()
                    done()

        it 'calls fileDeleted for a deleted file', (done) ->
            doc =
                _id: 'foo/baz'
                _rev: '4-1234567890'
                _deleted: true
                docType: 'file'
            @sync.fileDeleted = sinon.stub().yields()
            @sync.fileChanged doc, (err) =>
                should.not.exist err
                @sync.fileDeleted.calledWith(doc).should.be.true()
                done()

    describe 'folderChanged', ->
        beforeEach ->
            @local = {}
            @remote = {}
            @sync = new Sync @pouch, @local, @remote

        it 'calls folderAdded for an added folder', (done) ->
            doc =
                _id: 'foobar/bar'
                _rev: '1-abcdef0123456789'
                docType: 'folder'
            @sync.folderAdded = sinon.stub().yields()
            @sync.folderChanged doc, (err) =>
                should.not.exist err
                @sync.folderAdded.calledWith(doc).should.be.true()
                done()

        it 'calls folderUpdated for an updated folder', (done) ->
            doc =
                _id: 'foobar/bar'
                _rev: '2-abcdef9876543210'
                docType: 'folder'
                tags: ['qux']
            @sync.folderUpdated = sinon.stub().yields()
            @sync.folderChanged doc, (err) =>
                should.not.exist err
                @sync.folderUpdated.calledWith(doc).should.be.true()
                done()

        it 'calls folderUpdated for an updated folder', (done) ->
            was =
                _id: 'foobar/bar'
                _rev: '3-9876543210'
                _deleted: true
                moveTo: 'foobar/baz'
                docType: 'folder'
                tags: ['qux']
            doc =
                _id: 'foobar/baz'
                _rev: '1-abcdef'
                docType: 'folder'
                tags: ['qux']
            @sync.folderDeleted = sinon.stub().yields()
            @sync.folderAdded = sinon.stub().yields()
            @sync.folderMoved = sinon.stub().yields()
            @sync.folderChanged was, (err) =>
                should.not.exist err
                @sync.folderDeleted.called.should.be.false()
                @sync.folderChanged doc, (err) =>
                    should.not.exist err
                    @sync.folderAdded.called.should.be.false()
                    @sync.folderMoved.calledWith(doc, was).should.be.true()
                    done()

        it 'calls folderDeleted for a deleted folder', (done) ->
            doc =
                _id: 'foobar/baz'
                _rev: '4-1234567890'
                _deleted: true
                docType: 'folder'
            @sync.folderDeleted = sinon.stub().yields()
            @sync.folderChanged doc, (err) =>
                should.not.exist err
                @sync.folderDeleted.calledWith(doc).should.be.true()
                done()

    describe 'fileAdded', ->
        it 'calls addFile on local and remote', (done) ->
            doc =
                _id: 'foo/bar'
                docType: 'file'
            @local  = addFile: sinon.stub().yields()
            @remote = addFile: sinon.stub().yields()
            @sync = new Sync @pouch, @local, @remote
            @sync.fileAdded doc, (err) =>
                should.not.exist err
                @local.addFile.calledWith(doc).should.be.true()
                @remote.addFile.calledWith(doc).should.be.true()
                done()

    describe 'fileUpdated', ->
        it 'calls updateFile on local and remote', (done) ->
            doc =
                _id: 'foo/bar'
                docType: 'file'
            @local  = updateFile: sinon.stub().yields()
            @remote = updateFile: sinon.stub().yields()
            @sync = new Sync @pouch, @local, @remote
            @sync.fileUpdated doc, (err) =>
                should.not.exist err
                @local.updateFile.calledWith(doc).should.be.true()
                @remote.updateFile.calledWith(doc).should.be.true()
                done()

    describe 'fileMoved', ->
        it 'calls moveFile on local and remote', (done) ->
            doc =
                _id: 'foo/bar'
                docType: 'file'
            old =
                _id: 'foo/baz'
                docType: 'file'
            @local  = moveFile: sinon.stub().yields()
            @remote = moveFile: sinon.stub().yields()
            @sync = new Sync @pouch, @local, @remote
            @sync.fileMoved doc, old, (err) =>
                should.not.exist err
                @local.moveFile.calledWith(doc, old).should.be.true()
                @remote.moveFile.calledWith(doc, old).should.be.true()
                done()

    describe 'fileDeleted', ->
        it 'calls deleteFile on local and remote', (done) ->
            doc =
                _id: 'foo/bar'
                docType: 'file'
            @local  = deleteFile: sinon.stub().yields()
            @remote = deleteFile: sinon.stub().yields()
            @sync = new Sync @pouch, @local, @remote
            @sync.fileDeleted doc, (err) =>
                should.not.exist err
                @local.deleteFile.calledWith(doc).should.be.true()
                @remote.deleteFile.calledWith(doc).should.be.true()
                done()

    describe 'folderAdded', ->
        it 'calls addFolder on local and remote', (done) ->
            doc =
                _id: 'foo/bar'
                docType: 'folder'
            @local  = addFolder: sinon.stub().yields()
            @remote = addFolder: sinon.stub().yields()
            @sync = new Sync @pouch, @local, @remote
            @sync.folderAdded doc, (err) =>
                should.not.exist err
                @local.addFolder.calledWith(doc).should.be.true()
                @remote.addFolder.calledWith(doc).should.be.true()
                done()

    describe 'folderUpdated', ->
        it 'calls updateFolder on local and remote', (done) ->
            doc =
                _id: 'foo/bar'
                docType: 'folder'
            @local  = updateFolder: sinon.stub().yields()
            @remote = updateFolder: sinon.stub().yields()
            @sync = new Sync @pouch, @local, @remote
            @sync.folderUpdated doc, (err) =>
                should.not.exist err
                @local.updateFolder.calledWith(doc).should.be.true()
                @remote.updateFolder.calledWith(doc).should.be.true()
                done()

    describe 'folderMoved', ->
        it 'calls moveFolder on local and remote', (done) ->
            doc =
                _id: 'foo/bar'
                docType: 'folder'
            old =
                _id: 'foo/baz'
                docType: 'folder'
            @local  = moveFolder: sinon.stub().yields()
            @remote = moveFolder: sinon.stub().yields()
            @sync = new Sync @pouch, @local, @remote
            @sync.folderMoved doc, old, (err) =>
                should.not.exist err
                @local.moveFolder.calledWith(doc, old).should.be.true()
                @remote.moveFolder.calledWith(doc, old).should.be.true()
                done()

    describe 'folderDeleted', ->
        it 'calls deleteFolder on local and remote', (done) ->
            doc =
                _id: 'foo/bar'
                docType: 'folder'
            @local  = deleteFolder: sinon.stub().yields()
            @remote = deleteFolder: sinon.stub().yields()
            @sync = new Sync @pouch, @local, @remote
            @sync.folderDeleted doc, (err) =>
                should.not.exist err
                @local.deleteFolder.calledWith(doc).should.be.true()
                @remote.deleteFolder.calledWith(doc).should.be.true()
                done()
