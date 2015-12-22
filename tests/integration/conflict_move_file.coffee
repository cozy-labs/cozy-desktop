faker  = require 'faker'
find   = require 'lodash.find'
fs     = require 'fs-extra'
path   = require 'path'
should = require 'should'

Cozy  = require '../helpers/integration'
Files = require '../helpers/files'


describe 'Conflict when moving a file', ->
    @slow 1000
    @timeout 10000

    before Cozy.ensurePreConditions


    describe 'on local', ->
        src =
            path: ''
            name: faker.name.jobArea()
        file =
            path: ''
            name: faker.name.jobType()
            lastModification: '2015-10-13T02:04:08Z'
        expectedSizes = []

        before Cozy.registerDevice
        before Files.deleteAll

        before 'Create the remote tree', (done) ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'
            Files.uploadFile file, fixturePath, (err, created) ->
                file.remote =
                    id: created.id
                    size: fs.statSync(fixturePath).size
                done()

        before Cozy.fetchRemoteMetadata

        before 'Create the local tree', ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon-mod.jpg'
            filePath = path.join @basePath, src.path, src.name
            file.local = size: fs.statSync(fixturePath).size
            fs.copySync fixturePath, filePath

        before 'Simulate works/latency for Sync', ->
            @app.instanciate()
            apply = @app.sync.apply
            @app.sync.apply = (change, callback) =>
                setTimeout =>
                    @app.sync.apply = apply
                    @app.sync.apply change, callback
                , 2400

        before Cozy.sync

        after Cozy.clean

        it 'waits a bit to resolve the conflict', (done) ->
            expectedSizes = [file.remote.size, file.local.size]
            srcPath = path.join @basePath, src.path, src.name
            dstPath = path.join @basePath, file.path, file.name
            fs.renameSync srcPath, dstPath
            setTimeout done, 6000

        it 'has the two files on local', ->
            files = fs.readdirSync @basePath
            files = (f for f in files when f isnt '.cozy-desktop')
            files.length.should.equal 2
            sizes = for f in files
                fs.statSync(path.join @basePath, f).size
            sizes.should.eql expectedSizes
            names = files.sort()
            names[0].should.equal file.name
            parts = names[1].split '-conflict-'
            parts.length.should.equal 2
            parts[0].should.equal file.name

        it 'has the files on remote', (done) ->
            Files.getAllFiles (err, files) ->
                console.log files unless files.length is 2  # TODO debug
                files.length.should.equal 2
                sizes = (f.size for f in files)
                sizes.sort().should.eql expectedSizes.sort()
                names = (f.name for f in files).sort()
                names[0].should.equal file.name
                parts = names[1].split '-conflict-'
                parts.length.should.equal 2
                parts[0].should.equal file.name
                done()


    describe 'on remote', ->
        src =
            path: ''
            name: faker.name.jobArea()
            lastModification: '2015-10-13T02:04:08Z'
        file =
            path: ''
            name: faker.name.jobType()

        before Cozy.registerDevice
        before Files.deleteAll

        before 'Create the remote tree', (done) ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon-mod.jpg'
            Files.uploadFile src, fixturePath, (err, created) ->
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

        before (done) ->
            srcPath = path.join @basePath, src.path, src.name
            dstPath = path.join @basePath, file.path, file.name
            file.id = file.remote.id
            Files.updateFile file, done

        before Cozy.sync

        after Cozy.clean

        it 'has the two files on local', ->
            files = fs.readdirSync @basePath
            files = (f for f in files when f isnt '.cozy-desktop')
            files.length.should.equal 2
            sizes = for f in files
                fs.statSync(path.join @basePath, f).size
            sizes.should.eql [file.local.size, file.remote.size]
            names = files.sort()
            names[0].should.equal file.name
            parts = names[1].split '-conflict-'
            parts.length.should.equal 2
            parts[0].should.equal file.name

        it 'has the two files on remote', (done) ->
            Files.getAllFiles (err, files) ->
                files.length.should.equal 2
                if files[0].name is file.name
                    [local, remote] = files
                else
                    [remote, local] = files
                local.size.should.equal file.local.size
                local.name.should.equal file.name
                remote.size.should.equal file.remote.size
                parts = remote.name.split '-conflict-'
                parts.length.should.equal 2
                parts[0].should.equal file.name
                done()
