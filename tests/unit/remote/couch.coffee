should = require 'should'

couchHelpers = require '../../helpers/couch'

Couch = require '../../../backend/remote/couch'


describe "DB Tests", ->

    before 'start couch server', couchHelpers.startServer
    before 'instanciate couch', couchHelpers.createCouchClient
    after 'stop couch server', couchHelpers.stopServer

    it 'getLastRemoteChangeSeq', (done) ->
        @couch.getLastRemoteChangeSeq (err, seq) ->
            should.not.exist err
            seq.should.equal 0
            done()

    it 'copyViewFromRemote'

    it 'replicateToRemote'
    it 'uploadBinary'
    it 'getRemoteDoc'
    it 'createEmptyRemoteDoc'
    it 'uploadAsAttachment'
