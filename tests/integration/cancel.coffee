faker  = require 'faker'
fs     = require 'fs-extra'
path   = require 'path'
should = require 'should'

Cozy  = require '../helpers/integration'
Files = require '../helpers/files'


describe 'Cancel', ->
    @slow 1000
    @timeout 10000

    before Cozy.ensurePreConditions
    before Files.deleteAll
    before Cozy.registerDevice
    before Cozy.pull
    after Cozy.clean

    waitAppear = (localPath, callback) ->
        interval = setInterval ->
            if fs.existsSync(localPath)
                clearInterval interval
                callback()
        , 20

    waitDisappear = (localPath, callback) ->
        interval = setInterval ->
            unless fs.existsSync(localPath)
                clearInterval interval
                callback()
        , 20

    describe 'Move a file, then moved it back', ->
        one =
            path: ''
            name: faker.hacker.adjective()
        two =
            path: ''
            name: faker.hacker.noun()

        onePath = twoPath = ''

        it 'sets paths', ->
            onePath = path.join @basePath, one.path, one.name
            twoPath = path.join @basePath, two.path, two.name

        it 'creates a file on the local', (done) ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'
            Files.uploadFile one, fixturePath, (err, created) ->
                one.id = two.id = created.id
                waitAppear onePath, done

        it 'moves the file', (done) ->
            Files.updateFile two, (err, updated) ->
                waitAppear twoPath, ->
                    fs.existsSync(onePath).should.be.false()
                    done()

        it 'moves back the file to its original path', (done) ->
            Files.updateFile one, (err, updated) ->
                waitAppear onePath, ->
                    fs.existsSync(twoPath).should.be.false()
                    done()


    describe 'Delete a file and recreate it', ->
        file =
            path: ''
            name: faker.hacker.adjective()

        filePath = ''
        fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'

        it 'creates a file on the local', (done) ->
            filePath = path.join @basePath, file.path, file.name
            Files.uploadFile file, fixturePath, (err, created) ->
                file.id = created.id
                waitAppear filePath, done

        it 'removes the file', (done) ->
            Files.removeFile file, (err, removed) ->
                waitDisappear filePath, done

        it 'recreates the file', (done) ->
            delete file.id
            Files.uploadFile file, fixturePath, (err, created) ->
                waitAppear filePath, done
