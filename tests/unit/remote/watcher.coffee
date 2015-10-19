async  = require 'async'
fs     = require 'fs-extra'
path   = require 'path'
should = require 'should'

configHelpers = require '../../helpers/config'
couchHelpers  = require '../../helpers/couch'
pouchHelpers  = require '../../helpers/pouch'

Normalizer = require '../../../backend/normalizer'
Watcher    = require '../../../backend/remote/watcher'


describe "RemoteWatcher Tests", ->
    @timeout 8000

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    before 'start couch server', couchHelpers.startServer
    before 'instanciate couch', couchHelpers.createCouchClient
    before 'instanciate remote watcher', ->
        @normalizer = new Normalizer @pouch
        @watcher    = new Watcher @couch, @normalizer, @pouch
    after 'stop couch server', couchHelpers.stopServer
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig

    return it 'TODO fix tests'

    describe "initial replication", ->
        fixturePath = path.join  __dirname, '..', 'fixtures', 'chat-mignon.jpg'
        remoteFolders = [
            {name: 'remotefolder-01', parent: ''}
            {name: 'remotesub-01', parent: '/remotefolder-01'}
        ]
        remoteFiles = [
            {name: 'remotefile-01', parent: ''}
            {name: 'remotefile-02', parent: '/remotefolder-01'}
            {name: 'remotefile-03', parent: '/remotefolder-01/remotesub-01'}
        ]

        # Create remote folders
        before (done) ->
            async.eachSeries remoteFolders, (folder, next) ->
                folderHelpers.createFolder folder.name, folder.parent, next
            , done

        # Create remote files
        before (done) ->
            uploadFile = (file, next) ->
                {name, parent} = file
                fileHelpers.uploadFile name, fixturePath, parent, next
            async.eachSeries remoteFiles, uploadFile, done

        it "syncs remote and local folders", (done) ->
            syncToCozy = true
            remoteWatcher.init syncToCozy, (err) ->
                should.not.exist err
                setTimeout done, 1000

        it "and all files are present remotely", (done) ->
            fileHelpers.getAll (err, files) ->
                should.not.exist err

                fileHash = {}
                files.forEach (file) ->
                    fileHash[path.join file.path, file.name] = true

                remoteFiles.forEach (file) ->
                    fileHash[path.join file.parent, file.name].should.be.ok()
                localFiles.forEach (file) ->
                    fileHash[path.join file.parent, file.name].should.be.ok()

                done()

        it "and all folders are present remotely", (done) ->
            folderHelpers.getAll (err, folders) ->
                should.not.exist err

                folderHash = {}
                folders.forEach (folder) ->
                    folderHash[path.join folder.path, folder.name] = true

                remoteFolders.forEach (folder) ->
                    folderPath = path.join folder.parent, folder.name
                    folderHash[folderPath].should.be.ok()
                localFolders.forEach (folder) ->
                    folderPath = path.join folder.parent, folder.name
                    folderHash[folderPath].should.be.ok()

                done()

        it "and all files are present locally", ->
            remoteFolders.forEach (folder) ->
                folderPath = path.join syncPath, folder.parent, folder.name
                fs.existsSync(folderPath).should.be.ok()
            localFolders.forEach (folder) ->
                folderPath = path.join syncPath, folder.parent, folder.name
                fs.existsSync(folderPath).should.be.ok()
            remoteFiles.forEach (file) ->
                filePath = path.join syncPath, file.parent, file.name
                fs.existsSync(filePath).should.be.ok()
            localFiles.forEach (file) ->
                filePath = path.join syncPath, file.parent, file.name
                fs.existsSync(filePath).should.be.ok()

        it "and all local files are correct", (done) ->
            fixtureSize = fs.statSync(fixturePath).size
            remoteFiles.forEach (file) ->
                filepath = path.join syncPath, file.parent, file.name
                fs.statSync(filepath).size.should.be.equal fixtureSize
            done()
