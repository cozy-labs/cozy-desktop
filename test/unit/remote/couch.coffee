crypto = require 'crypto'
fs     = require 'fs'
http   = require 'http'
should = require 'should'

configHelpers = require '../../helpers/config'
couchHelpers  = require '../../helpers/couch'

Couch = require '../../../src/remote/couch'


describe "Couch", ->

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

    describe 'ping', ->
        it 'answers true if CouchDb is available', (done) ->
            @couch.ping (available) ->
                available.should.be.true()
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

    describe 'uploadAsAttachment', ->
        it 'upload a file as an attachment to an existing doc', (done) ->
            file = 'test/fixtures/chat-mignon.jpg'
            mime = 'image/jpeg'
            @couch.uploadAsAttachment @doc._id, @rev, mime, file, (err, doc) ->
                should.not.exist err
                should.exist doc.id
                should.exist doc.rev
                done()

        it 'upload a stream as an attachment to an existing doc', (done) ->
            stream = fs.createReadStream 'test/fixtures/chat-mignon-mod.jpg'
            mime = 'image/jpeg'
            @couch.uploadAsAttachment @doc._id, @rev, mime, stream, (err, doc)->
                should.not.exist err
                should.exist doc.id
                should.exist doc.rev
                done()

        it 'has the correct content-type', (done) ->
            stream = fs.createReadStream 'test/fixtures/cool-pillow.jpg'
            mime = 'image/jpeg'
            @couch.uploadAsAttachment @doc._id, @rev, mime, stream, (err, doc)->
                should.not.exist err
                http.get "#{couchHelpers.url}/cozy/#{doc.id}/file", (res) ->
                    res.headers['content-type'].should.equal mime
                    done()

    describe 'downloadBinary', ->
        it 'creates a readable stream from a remote binary doc', (done) ->
            file = 'test/fixtures/chat-mignon.jpg'
            mime = 'image/jpeg'
            @couch.uploadAsAttachment @doc._id, @rev, mime, file, (err, doc) =>
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

    describe 'sameRemoteDoc', ->
        it 'returns true if the documents are the same', ->
            one =
                _id: '5e93939833e147a78c61b115f50cc77d'
                _rev: '12-e91c1c55d2b82087682e32a30036a22b'
                docType: 'file'
                path: ''
                name: 'planche.jpg'
                creationDate: '2015-11-23T15:30:01.831Z'
                lastModification: '2015-11-23T15:30:01.831Z'
                checksum: 'd0d3ddb1ccc7b4362c928b5f194dae5f7a0005f9'
                size: 539118
                class: 'image'
                mime: 'image/jpeg'
                binary:
                    file:
                        id: 'd0d3ddb1ccc7b4362c928b5f194dae5f7a0005f9'
                        rev: '7-39a6777ab539b47d046888011f4f089d'
                    thumb:
                        id: 'df8d4874a4d8316877abf61b3e0057a0'
                        rev: '2-d3540f14ece76cd5104c0059871f0373'
            two =
                _id: '24af4c7ae9454f7e9d1f78219554cf19'
                docType: 'file'
                path: ''
                name: 'planche.jpg'
                creationDate: '2015-11-23T15:30:01.831Z'
                lastModification: '2015-11-23T15:30:01.831Z'
                checksum: 'd0d3ddb1ccc7b4362c928b5f194dae5f7a0005f9'
                size: 539118
                class: 'image'
                mime: 'image/jpeg'
            @couch.sameRemoteDoc(one, two).should.be.true()

        it 'returns false if the documents are different', ->
            one =
                _id: '5e93939833e147a78c61b115f50cc77d'
                _rev: '12-e91c1c55d2b82087682e32a30036a22b'
                docType: 'file'
                path: ''
                name: 'planche.jpg'
                creationDate: '2015-11-23T15:30:01.831Z'
                lastModification: '2015-11-23T15:30:01.831Z'
                checksum: 'd0d3ddb1ccc7b4362c928b5f194dae5f7a0005f9'
                size: 539118
                class: 'image'
                mime: 'image/jpeg'
                binary:
                    file:
                        id: 'd0d3ddb1ccc7b4362c928b5f194dae5f7a0005f9'
                        rev: '7-39a6777ab539b47d046888011f4f089d'
                    thumb:
                        id: 'df8d4874a4d8316877abf61b3e0057a0'
                        rev: '2-d3540f14ece76cd5104c0059871f0373'
            two =
                _id: '85f39bb308ea4340a606970c1b9e2bb8'
                docType: 'file'
                path: ''
                name: 'planche.jpg'
                creationDate: '2015-11-23T15:23:46.352Z'
                lastModification: '2015-11-23T15:23:46.352Z'
                checksum: 'c584315c6fd2155030808ee96fdf80bf20161cc3',
                size: 84980,
                class: 'image'
                mime: 'image/jpeg'
            @couch.sameRemoteDoc(one, two).should.be.false()
