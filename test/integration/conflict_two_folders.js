faker  = require 'faker'
fs     = require 'fs-extra'
path   = require 'path'
should = require 'should'

Cozy  = require '../helpers/integration'
Files = require '../helpers/files'


describe 'Conflict between two folders', ->
    @slow 1000
    @timeout 10000

    before Cozy.ensurePreConditions


    describe 'with local first', ->
        folder =
            path: ''
            name: faker.internet.domainWord()
        localChild =
            path: path.join folder.path, folder.name
            name: 'a' + faker.name.firstName()
            lastModification: '2015-12-09T12:11:30.861Z'
        remoteChild =
            path: path.join folder.path, folder.name
            name: 'z' + faker.name.lastName()
            lastModification: '2015-12-09T12:12:39.844Z'

        before Files.deleteAll
        before Cozy.registerDevice

        before 'Create the remote tree', (done) ->
            Files.createFolder folder, (err, created) ->
                fixturePath = path.join Cozy.fixturesDir, 'chat-mignon-mod.jpg'
                Files.uploadFile remoteChild, fixturePath, done

        before 'Create the local tree', ->
            folderPath = path.join @syncPath, folder.path, folder.name
            fs.ensureDirSync folderPath
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'
            filePath = path.join @syncPath, localChild.path, localChild.name
            fs.copySync fixturePath, filePath

        before Cozy.sync

        after Cozy.clean

        it 'waits a bit to resolve the conflict', (done) ->
            setTimeout done, 2000

        it 'has the two files on local', ->
            folders = fs.readdirSync @syncPath
            folders = (f for f in folders when f isnt '.cozy-desktop')
            folders.length.should.equal 1
            files = fs.readdirSync path.join @syncPath, folders[0]
            files.length.should.equal 2
            [local, remote] = files.sort()
            local.should.equal localChild.name
            remote.should.equal remoteChild.name

        it 'has the two files on remote', (done) ->
            Files.getAllFiles (err, files) ->
                files.length.should.equal 2
                if files[0].name is localChild.name
                    [local, remote] = files
                else
                    [remote, local] = files
                local.path.should.equal "/#{localChild.path}"
                local.name.should.equal localChild.name
                remote.path.should.equal "/#{remoteChild.path}"
                remote.name.should.equal remoteChild.name
                done()


    describe 'with remote first', ->
        folder =
            path: ''
            name: faker.internet.domainWord()
        localChild =
            path: path.join folder.path, folder.name
            name: 'b' + faker.name.firstName()
            lastModification: '2015-12-09T12:11:30.861Z'
        remoteChild =
            path: path.join folder.path, folder.name
            name: 'y' + faker.name.lastName()
            lastModification: '2015-12-09T12:12:39.844Z'

        before Files.deleteAll
        before Cozy.registerDevice

        before 'Create the remote tree', (done) ->
            Files.createFolder folder, (err, created) ->
                fixturePath = path.join Cozy.fixturesDir, 'chat-mignon-mod.jpg'
                Files.uploadFile remoteChild, fixturePath, done

        before Cozy.fetchRemoteMetadata

        before 'Create the local tree', ->
            folderPath = path.join @syncPath, folder.path, folder.name
            fs.ensureDirSync folderPath
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'
            filePath = path.join @syncPath, localChild.path, localChild.name
            fs.copySync fixturePath, filePath

        before Cozy.sync

        after Cozy.clean

        it 'waits a bit to resolve the conflict', (done) ->
            setTimeout done, 2000

        it 'has the two files on local', ->
            folders = fs.readdirSync @syncPath
            folders = (f for f in folders when f isnt '.cozy-desktop')
            folders.length.should.equal 1
            files = fs.readdirSync path.join @syncPath, folders[0]
            files.length.should.equal 2
            [local, remote] = files.sort()
            local.should.equal localChild.name
            remote.should.equal remoteChild.name

        it 'has the two files on remote', (done) ->
            Files.getAllFiles (err, files) ->
                files.length.should.equal 2
                if files[0].name is localChild.name
                    [local, remote] = files
                else
                    [remote, local] = files
                local.path.should.equal "/#{localChild.path}"
                local.name.should.equal localChild.name
                remote.path.should.equal "/#{remoteChild.path}"
                remote.name.should.equal remoteChild.name
                done()
