fs     = require 'fs'
should = require 'should'

configHelpers = require '../../helpers/config'
couchHelpers  = require '../../helpers/couch'

Couch = require '../../../backend/remote/couch'
Pouch = require '../../../backend/pouch'


describe "Couch", ->
    @timeout 8000

    before 'instanciate config', configHelpers.createConfig
    before 'start couch server', couchHelpers.startServer
    before 'instanciate couch', couchHelpers.createCouchClient
    beforeEach 'create a document', (done) ->
        @doc =
            _id: Pouch.newId()
            docType: 'binary'
            checksum: '42'
        @couch.put @doc, (err, created) =>
            should.not.exist err
            @rev = created.rev
            done()
    after 'stop couch server', couchHelpers.stopServer
    after 'clean config directory', configHelpers.cleanConfig

    describe 'getLastRemoteChangeSeq', ->
        it 'gets the last change sequence number from couch', (done) ->
            @couch.getLastRemoteChangeSeq (err, seq) ->
                should.not.exist err
                seq.should.equal 1
                done()

    describe 'get', ->
        it 'retrieves a document by its id', (done) ->
            @couch.get @doc._id, (err, doc) =>
                should.not.exist err
                should.exist doc
                doc.id.should.equal @doc._id
                should.exist doc.rev
                doc.docType.should.equal 'binary'
                done()

    describe 'put', (done) ->
        it 'can create a new document', (done) ->
            doc =
                _id: Pouch.newId()
                docType: 'binary'
            @couch.put doc, (err, created) ->
                should.not.exist err
                should.exist created
                should.exist created.id
                should.exist created.rev
                done()

        it 'can update a document', (done) ->
            @doc.checksum = 'deadcafe'
            @couch.put @doc, @rev, (err, updated) =>
                should.not.exist err
                should.exist updated
                should.exist updated.id
                should.exist updated.rev
                @couch.get @doc._id, (err, doc) =>
                    should.not.exist err
                    doc.checksum.should.equal @doc.checksum
                    done()

    describe 'del', ->
        it 'deletes a document', (done) ->
            @couch.del @doc._id, @rev, (err, deleted) ->
                should.not.exist err
                should.exist deleted
                should.exist deleted.id
                should.exist deleted.rev
                done()

    describe 'pickViewToCopy', ->
        it 'fetches the design document from couch with its views'

    describe 'getFromRemoteView', ->
        it 'gets documents from a view on a remote couch'

    describe 'createEmptyRemoteDoc', ->
        it 'creates a remote binary doc', (done) ->
            @couch.createEmptyRemoteDoc foo: 'bar', (err, doc) ->
                should.not.exist err
                should.exist doc
                should.exist doc.id
                should.exist doc.rev
                done()

    describe 'uploadAsAttachment', ->
        return it 'FIXME'
        it 'upload a stream as an attachment to an existing doc', (done) ->
            stream = fs.createReadStream 'tests/fixtures/chat-mignon.jpg'
            @couch.uploadAsAttachment @doc._id, @rev, stream, (err, attached) ->
                console.log 1, err, attached
                should.not.exist err
                done()

    describe 'downloadBinary', ->
        it 'creates a readable stream from a remote binary doc'
