should = require 'should'

configHelpers = require '../../helpers/config'
couchHelpers = require '../../helpers/couch'

Couch = require '../../../backend/remote/couch'


describe "DB Tests", ->

    before 'instanciate config', configHelpers.createConfig
    before 'start couch server', couchHelpers.startServer
    before 'instanciate couch', couchHelpers.createCouchClient
    after 'stop couch server', couchHelpers.stopServer
    after 'clean config directory', configHelpers.cleanConfig

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
