fs     = require 'fs-extra'
should = require 'should'

filesystem = require '../../../backend/local/filesystem'

describe "Filesystem Tests", ->

    describe "getFileClass", ->
        it "returns proper class for given file", (done) ->
            filesystem.getFileClass 'image.png', (err, infos) ->
                infos.fileClass.should.equal 'image'
                filesystem.getFileClass 'doc.txt', (err, infos) ->
                    infos.fileClass.should.equal 'document'
                    done()

    describe "checksum", ->
        it "returns the checksum of givenfile", (done) ->
            filePath = 'tests/fixtures/chat-mignon.jpg'
            filesystem.checksum filePath, (err, sum) ->
                should.not.exist err
                sum.should.equal "bf268fcb32d2fd7243780ad27af8ae242a6f0d30"
                done()

    describe "getSize", ->
        it "returns the size of given file", (done) ->
            filePath = 'tests/fixtures/chat-mignon.jpg'
            filesystem.getSize filePath, (err, size) ->
                should.not.exist err
                size.should.equal fs.statSync(filePath).size
                done()
