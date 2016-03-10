faker  = require 'faker'
fs     = require 'fs-extra'
path   = require 'path'
should = require 'should'

Cozy  = require '../helpers/integration'
Files = require '../helpers/files'


describe 'Conflict between two files', ->
    @slow 1000
    @timeout 10000

    before Cozy.ensurePreConditions


    describe 'with local first', ->
        file =
            path: ''
            name: faker.commerce.color()
            lastModification: '2015-10-12T01:02:03Z'
        expectedSizes = []

        before Files.deleteAll
        before Cozy.registerDevice

        before 'Create the remote tree', (done) ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon-mod.jpg'
            Files.uploadFile file, fixturePath, (err, created) ->
                file.remote =
                    id: created.id
                    size: fs.statSync(fixturePath).size
                done()

        before 'Create the local tree', ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'
            filePath = path.join @basePath, file.path, file.name
            file.local = size: fs.statSync(fixturePath).size
            fs.copySync fixturePath, filePath

        before Cozy.sync

        after Cozy.clean

        it 'waits a bit to resolve the conflict', (done) ->
            expectedSizes = [file.local.size, file.remote.size].sort()
            setTimeout done, 3000

        it 'has the two files on local', ->
            files = fs.readdirSync @basePath
            files = (f for f in files when f isnt '.cozy-desktop')
            files.length.should.equal 2
            sizes = for f in files
                fs.statSync(path.join @basePath, f).size
            sizes.sort().should.eql expectedSizes
            names = files.sort()
            names[0].should.equal file.name
            parts = names[1].split '-conflict-'
            parts.length.should.equal 2
            parts[0].should.equal file.name

        it 'has the files on remote', (done) ->
            Files.getAllFiles (err, files) ->
                files.length.should.equal 2
                sizes = (f.size for f in files)
                sizes.sort().should.eql expectedSizes
                names = (f.name for f in files).sort()
                names[0].should.equal file.name
                parts = names[1].split '-conflict-'
                parts.length.should.equal 2
                parts[0].should.equal file.name
                done()


    describe 'with remote first', ->
        file =
            path: ''
            name: faker.commerce.department()
            lastModification: '2015-10-13T02:04:06Z'
        expectedSizes = []

        before Cozy.registerDevice
        before Files.deleteAll

        before 'Create the remote tree', (done) ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon-mod.jpg'
            Files.uploadFile file, fixturePath, (err, created) ->
                file.remote =
                    id: created.id
                    size: fs.statSync(fixturePath).size
                done()

        before Cozy.fetchRemoteMetadata

        before 'Create the local tree', ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'
            filePath = path.join @basePath, file.path, file.name
            file.local = size: fs.statSync(fixturePath).size
            fs.copySync fixturePath, filePath

        before Cozy.sync

        after Cozy.clean

        it 'waits a bit to resolve the conflict', (done) ->
            expectedSizes = [file.local.size, file.remote.size].sort()
            setTimeout done, 1500

        it 'has the two files on local', ->
            files = fs.readdirSync @basePath
            files = (f for f in files when f isnt '.cozy-desktop')
            files.length.should.equal 2
            sizes = for f in files
                fs.statSync(path.join @basePath, f).size
            sizes.sort().should.eql expectedSizes
            names = files.sort()
            names[0].should.equal file.name
            parts = names[1].split '-conflict-'
            parts.length.should.equal 2
            parts[0].should.equal file.name

        it 'has the files on remote', (done) ->
            Files.getAllFiles (err, files) ->
                files.length.should.equal 2
                sizes = (f.size for f in files)
                sizes.sort().should.eql expectedSizes
                names = (f.name for f in files).sort()
                names[0].should.equal file.name
                parts = names[1].split '-conflict-'
                parts.length.should.equal 2
                parts[0].should.equal file.name
                done()
