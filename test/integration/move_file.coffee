faker  = require 'faker'
find   = require 'lodash.find'
fs     = require 'fs-extra'
path   = require 'path'
should = require 'should'

Cozy  = require '../helpers/integration'
Files = require '../helpers/files'


describe 'Move a file', ->
    @slow 1000
    @timeout 10000

    before Cozy.ensurePreConditions


    describe 'on local', ->
        src =
            path: ''
            name: faker.name.jobArea()
        dst =
            path: ''
            name: faker.name.jobType()
        expectedSizes = []

        before Cozy.registerDevice
        before Files.deleteAll
        before Cozy.sync
        after Cozy.clean

        it 'create the local file', ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon-mod.jpg'
            filePath = path.join @basePath, src.path, src.name
            src.size = fs.statSync(fixturePath).size
            fs.copySync fixturePath, filePath

        it 'waits a bit', (done) ->
            setTimeout done, 4000

        it 'renames the file', (done) ->
            srcPath = path.join @basePath, src.path, src.name
            dstPath = path.join @basePath, dst.path, dst.name
            fs.rename srcPath, dstPath, done

        it 'waits a bit', (done) ->
            setTimeout done, 4000

        it 'has the file on local', ->
            files = fs.readdirSync @basePath
            files = (f for f in files when f isnt '.cozy-desktop')
            files.length.should.equal 1
            size = fs.statSync(path.join @basePath, files[0]).size
            size.should.equal src.size
            files[0].should.equal dst.name

        it 'has the file on remote', (done) ->
            Files.getAllFiles (err, files) ->
                files.length.should.equal 1
                files[0].size.should.eql src.size
                files[0].name.should.equal dst.name
                done()


    describe 'on remote', ->
        src =
            path: ''
            name: faker.name.jobArea()
            lastModification: '2015-10-13T02:04:08Z'
        dst =
            path: ''
            name: faker.name.jobType()
        expectedSizes = []

        before Cozy.registerDevice
        before Files.deleteAll
        before Cozy.sync
        after Cozy.clean

        it 'create the remote file', (done) ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'
            Files.uploadFile src, fixturePath, (err, created) ->
                src.id = created.id
                src.size = fs.statSync(fixturePath).size
                done()

        it 'waits a bit', (done) ->
            setTimeout done, 4000

        it 'renames the file', (done) ->
            srcPath = path.join @basePath, src.path, src.name
            dstPath = path.join @basePath, dst.path, dst.name
            dst.id = src.id
            Files.updateFile dst, done

        it 'waits a bit', (done) ->
            setTimeout done, 4000

        it 'has the file on local', ->
            files = fs.readdirSync @basePath
            files = (f for f in files when f isnt '.cozy-desktop')
            files.length.should.equal 1
            size = fs.statSync(path.join @basePath, files[0]).size
            size.should.equal src.size
            files[0].should.equal dst.name

        it 'has the file on remote', (done) ->
            Files.getAllFiles (err, files) ->
                files.length.should.equal 1
                files[0].size.should.eql src.size
                files[0].name.should.equal dst.name
                done()
