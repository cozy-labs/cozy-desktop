crypto = require 'crypto'
fs     = require 'fs'
should = require 'should'

configHelpers = require '../../helpers/config'
couchHelpers  = require '../../helpers/couch'

Couch = require '../../../backend/remote/couch'


describe "Couch", ->
    @timeout 4000

    before 'instanciate config', configHelpers.createConfig
    before 'start couch server', couchHelpers.startServer
    before 'instanciate couch', couchHelpers.createCouchClient
    beforeEach 'create a document', (done) ->
        @doc =
            _id: Couch.newId()
            docType: 'binary'
            checksum: '42'
        @couch.put @doc, (err, created) =>
            should.not.exist err
            @rev = created.rev
            done()
    after 'stop couch server', couchHelpers.stopServer
    after 'clean config directory', configHelpers.cleanConfig


    describe 'newId', ->
        it "returns a complex alpha-numeric chain", ->
            Couch.newId().length.should.equal 32
            Couch.newId().should.match /^\w+$/i

    describe 'getLastRemoteChangeSeq', ->
        it 'gets the last change sequence number from couch', (done) ->
            @couch.getLastRemoteChangeSeq (err, seq) ->
                should.not.exist err
                seq.should.be.aboveOrEqual 1
                done()

    describe 'get', ->
        it 'retrieves a document by its id', (done) ->
            @couch.get @doc._id, (err, doc) =>
                should.not.exist err
                should.exist doc
                doc._id.should.equal @doc._id
                should.exist doc._rev
                doc.docType.should.equal 'binary'
                done()

    describe 'put', (done) ->
        it 'can create a new document', (done) ->
            doc =
                _id: Couch.newId()
                docType: 'binary'
            @couch.put doc, (err, created) ->
                should.not.exist err
                should.exist created
                should.exist created.id
                should.exist created.rev
                done()

        it 'can update a document', (done) ->
            @doc.checksum = 'deadcafe'
            @doc._rev = @rev
            @couch.put @doc, (err, updated) =>
                should.not.exist err
                should.exist updated
                should.exist updated.id
                should.exist updated.rev
                @couch.get @doc._id, (err, doc) =>
                    should.not.exist err
                    doc.checksum.should.equal @doc.checksum
                    done()

    describe 'remove', ->
        it 'deletes a document', (done) ->
            @couch.remove @doc._id, @rev, (err, deleted) ->
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
        it 'upload a file as an attachment to an existing doc', (done) ->
            file = 'tests/fixtures/chat-mignon.jpg'
            @couch.uploadAsAttachment @doc._id, @rev, file, (err, attached) ->
                should.not.exist err
                done()

    describe 'downloadBinary', ->
        it 'creates a readable stream from a remote binary doc', (done) ->
            file = 'tests/fixtures/chat-mignon.jpg'
            @couch.uploadAsAttachment @doc._id, @rev, file, (err, attached) =>
                should.not.exist err
                stream = fs.createReadStream file
                checksum = crypto.createHash 'sha1'
                checksum.setEncoding 'hex'
                stream.pipe checksum
                stream.on 'end', =>
                    checksum.end()
                    sha1 = checksum.read()
                    @couch.downloadBinary @doc._id, (err, stream) ->
                        should.not.exist err
                        checksum = crypto.createHash 'sha1'
                        checksum.setEncoding 'hex'
                        stream.pipe checksum
                        stream.on 'end', ->
                            checksum.end()
                            checksum.read().should.equal sha1
                            done()
