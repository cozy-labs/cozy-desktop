faker  = require 'faker'
find   = require 'lodash.find'
fs     = require 'fs-extra'
path   = require 'path'
should = require 'should'

Cozy  = require '../helpers/integration'
Files = require '../helpers/files'


describe 'Conflict between remote docs with distinct cases', ->
    @slow 1000
    @timeout 10000

    before Cozy.ensurePreConditions


    describe '2 files', ->
        lower =
            path: ''
            name: faker.commerce.color().toLowerCase()
            lastModification: '2015-10-12T01:02:03Z'
        upper =
            path: lower.path
            name: lower.name.toUpperCase()
            lastModification: '2015-11-13T02:03:05Z'
        expectedSizes = []

        before Files.deleteAll
        before Cozy.registerDevice

        before 'force case insensitive for local', ->
            @app.instanciate()
            @app.prep.buildId = @app.prep.buildIdHFS

        before 'Create the lower file', (done) ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon-mod.jpg'
            Files.uploadFile lower, fixturePath, (err, created) ->
                lower.remote =
                    id: created.id
                    size: fs.statSync(fixturePath).size
                done()

        before Cozy.fetchRemoteMetadata

        before 'Create the upper file', (done) ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'
            Files.uploadFile upper, fixturePath, (err, created) ->
                upper.remote =
                    id: created.id
                    size: fs.statSync(fixturePath).size
                done()

        before Cozy.sync

        after Cozy.clean

        it 'waits a bit to resolve the conflict', (done) ->
            expectedSizes = [upper.remote.size, lower.remote.size]
            setTimeout done, 3500

        it 'has the two files on local', ->
            files = fs.readdirSync @basePath
            files = (f for f in files when f isnt '.cozy-desktop')
            files.length.should.equal 2
            sizes = for f in files
                fs.statSync(path.join @basePath, f).size
            sizes.should.eql expectedSizes
            names = files.sort()
            parts = names[0].split '-conflict-'
            parts.length.should.equal 2
            parts[0].should.equal upper.name
            names[1].should.equal lower.name

        it 'has the files on remote', (done) ->
            Files.getAllFiles (err, files) ->
                files.length.should.equal 2
                sizes = (f.size for f in files)
                sizes.sort().should.eql expectedSizes.sort()
                names = (f.name for f in files).sort()
                parts = names[0].split '-conflict-'
                parts.length.should.equal 2
                parts[0].should.equal upper.name
                names[1].should.equal lower.name
                done()


    describe '2 folders', ->
        it 'TODO'


    describe 'a file and a folder', ->
        it 'TODO'


    describe 'a folder and a file', ->
        lower =
            path: ''
            name: faker.commerce.product().toLowerCase()
        upper =
            path: lower.path
            name: lower.name.toUpperCase()
            lastModification: '2015-11-13T02:03:05Z'
        child =
            path: path.join lower.path, lower.name
            name: faker.commerce.color()
            lastModification: '2015-10-12T01:02:03Z'

        before Files.deleteAll
        before Cozy.registerDevice

        before 'force case insensitive for local', ->
            @app.instanciate()
            @app.prep.buildId = @app.prep.buildIdHFS

        before 'Create the lower folder', (done) ->
            Files.createFolder lower, (err, created) ->
                fixturePath = path.join Cozy.fixturesDir, 'chat-mignon-mod.jpg'
                Files.uploadFile child, fixturePath, (err, created) ->
                    child.remote =
                        id: created.id
                        size: fs.statSync(fixturePath).size
                    done()

        before Cozy.fetchRemoteMetadata

        before 'Create the upper file', (done) ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'
            Files.uploadFile upper, fixturePath, (err, created) ->
                upper.remote =
                    id: created.id
                    size: fs.statSync(fixturePath).size
                done()

        before Cozy.sync

        after Cozy.clean

        it 'waits a bit to resolve the conflict', (done) ->
            setTimeout done, 3500

        it 'has the two files on local', ->
            paths = fs.readdirSync @basePath
            paths = (f for f in paths when f isnt '.cozy-desktop')
            paths.length.should.equal 2
            [file, folder] = paths
            size = fs.statSync(path.join @basePath, file).size
            size.should.eql upper.remote.size
            parts = file.split '-conflict-'
            parts.length.should.equal 2
            parts[0].should.equal upper.name
            folder.should.equal lower.name
            children = fs.readdirSync path.join @basePath, folder
            children.length.should.equal 1
            children[0].should.equal child.name

        it 'has the files on remote', (done) ->
            Files.getAllFolders (err, folders) ->
                folders.length.should.equal 1
                folders[0].should.have.properties lower
                Files.getAllFiles (err, files) ->
                    files.length.should.equal 2
                    files[0]._id.should.equal child.remote.id
                    files[0].path.should.equal "/#{child.path}"
                    files[0].name.should.equal child.name
                    files[0].size.should.equal child.remote.size
                    parts = files[1].name.split '-conflict-'
                    parts.length.should.equal 2
                    parts[0].should.equal upper.name
                    files[1].path.should.equal upper.path
                    files[1].size.should.equal upper.remote.size
                    done()
