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
        it 'TODO'

    describe 'applied', ->
        it 'TODO'

    describe 'fileChanged', ->
        it 'TODO'

    describe 'folderChanged', ->
        it 'TODO'

    describe 'fileAdded', ->
        it 'TODO'

    describe 'fileUpdated', ->
        it 'TODO'

    describe 'fileMoved', ->
        it 'TODO'

    describe 'fileDeleted', ->
        it 'TODO'

    describe 'folderAdded', ->
        it 'TODO'

    describe 'folderUpdated', ->
        it 'TODO'

    describe 'folderMoved', ->
        it 'TODO'

    describe 'folderDeleted', ->
        it 'TODO'
