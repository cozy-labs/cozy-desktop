fs     = require 'fs-extra'
should = require 'should'

filesystem = require '../../../backend/local/filesystem'


describe "Filesystem Tests", ->

    describe "getFileClass", ->
        it "returns proper class for given file", ->
            [mimeType, fileClass] = filesystem.getFileClass 'image.png'
            mimeType.should.equal 'image/png'
            fileClass.should.equal 'image'
            [mimeType, fileClass] = filesystem.getFileClass 'doc.txt'
            mimeType.should.equal 'text/plain'
            fileClass.should.equal 'document'

    describe "checksum", ->
        it "returns the checksum of givenfile", (done) ->
            filePath = 'tests/fixtures/chat-mignon.jpg'
            filesystem.checksum filePath, (err, sum) ->
                should.not.exist err
                sum.should.equal "bf268fcb32d2fd7243780ad27af8ae242a6f0d30"
                done()
