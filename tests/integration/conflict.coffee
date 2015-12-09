faker  = require 'faker'
find   = require 'lodash.find'
fs     = require 'fs-extra'
path   = require 'path'
should = require 'should'

Cozy  = require '../helpers/integration'
Files = require '../helpers/files'


describe 'Conflict', ->
    @slow 1000
    @timeout 10000

    before Cozy.ensurePreConditions


    describe 'with two files, local first', ->
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

        it 'has the two directories on local', ->
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

        it 'has the directories on remote', (done) ->
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


    describe 'with two files, remote first', ->
        file =
            path: ''
            name: faker.commerce.department()
            lastModification: '2015-10-13T02:04:06Z'
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

        it 'has the two directories on local', ->
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

        it 'has the directories on remote', (done) ->
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


    # TODO when a remote folder is renammed, move also files&folders inside it
    describe.skip 'between a local file and a remote folder', ->
        file =
            path: ''
            name: faker.commerce.color()
            lastModification: '2015-10-10T01:02:03Z'
        folder =
            path: file.path
            name: file.name
        child =
            path: path.join folder.path, folder.name
            name: faker.commerce.product()
            lastModification: '2015-10-11T01:02:03Z'

        before Files.deleteAll
        before Cozy.registerDevice

        before 'Create the remote tree', (done) ->
            Files.createFolder folder, (err, created) ->
                fixturePath = path.join Cozy.fixturesDir, 'chat-mignon-mod.jpg'
                Files.uploadFile child, fixturePath, done

        before 'Create the local tree', ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'
            filePath = path.join @basePath, file.path, file.name
            fs.copySync fixturePath, filePath

        before Cozy.sync

        after Cozy.clean

        it 'waits a bit to resolve the conflict', (done) ->
            setTimeout done, 3000

        it 'has the file and the folder on local', ->
            paths = fs.readdirSync @basePath
            paths = (f for f in paths when f isnt '.cozy-desktop')
            paths.length.should.equal 2
            [f1, f2] = paths.sort()
            fs.statSync(path.join @basePath, f1).isFile()
            fs.statSync(path.join @basePath, f2).isDirectory()
            f1.should.equal file.name
            parts = f2.split '-conflict-'
            parts.length.should.equal 2
            parts[0].should.equal folder.name
            children = fs.readdirSync path.join @basePath, f2
            children.length.should.equal 1
            children[0].should.equal child.name

        it 'has the file and the folder on remote', (done) ->
            Files.getAllFiles (err, files) ->
                files.length.should.equal 2
                done()


    describe 'between a local folder and a remote file', ->
        file =
            path: ''
            name: faker.commerce.department()
            lastModification: '2015-10-08T01:02:03Z'
        folder =
            path: file.path
            name: file.name
        child =
            path: path.join folder.path, folder.name
            name: faker.commerce.productMaterial()
            lastModification: '2015-10-09T01:02:03Z'

        before Files.deleteAll
        before Cozy.registerDevice

        before 'Create the remote tree', (done) ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon-mod.jpg'
            Files.uploadFile file, fixturePath, done

        before 'Create the local tree', ->
            folderPath = path.join @basePath, folder.path, folder.name
            fs.ensureDirSync folderPath
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'
            childPath = path.join @basePath, child.path, child.name
            fs.copySync fixturePath, childPath

        before Cozy.sync

        after Cozy.clean

        it 'waits a bit to resolve the conflict', (done) ->
            setTimeout done, 3000

        it 'has the file and the folder on local', ->
            paths = fs.readdirSync @basePath
            paths = (f for f in paths when f isnt '.cozy-desktop')
            paths.length.should.equal 2
            [f1, f2] = paths.sort()
            fs.statSync(path.join @basePath, f1).isDirectory()
            fs.statSync(path.join @basePath, f2).isFile()
            f1.should.equal folder.name
            parts = f2.split '-conflict-'
            parts.length.should.equal 2
            parts[0].should.equal folder.name
            children = fs.readdirSync path.join @basePath, f1
            children.length.should.equal 1
            children[0].should.equal child.name

        it 'has the file and the folder on remote', (done) ->
            Files.getAllFiles (err, files) ->
                console.log files
                files.length.should.equal 2
                files[0].path.should.equal "/#{child.path}"
                files[0].name.should.equal child.name
                files[1].path.should.equal file.path
                parts = files[1].name.split '-conflict-'
                parts.length.should.equal 2
                parts[0].should.equal file.name
                Files.getAllFolders (err, folders) ->
                    folders.length.should.equal 1
                    should.exist find folders, folder
                    done()


    describe 'when moving a file on local', ->
    describe 'when moving a file on remote', ->
    describe 'when moving a folder on local', ->
    describe 'when moving a folder on remote', ->
    describe 'between 2 remote files with distinct cases', ->
    describe 'between 2 remote folders with distinct cases', ->
    describe 'between a remote file and a remote folder', ->
