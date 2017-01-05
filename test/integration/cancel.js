faker  = require 'faker'
fs     = require 'fs-extra'
path   = require 'path'
should = require 'should'

Cozy  = require '../helpers/integration'
Files = require '../helpers/files'


describe 'Cancel', ->
    @slow 1000
    @timeout 10000

    # This integration test is unstable on travis (too often red).
    # It's disabled for the moment, but we should find a way to make it
    # more stable on travis, and enable it again.
    if process.env.TRAVIS
        it 'is unstable on travis'
        return

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
            onePath = path.join @syncPath, one.path, one.name
            twoPath = path.join @syncPath, two.path, two.name

        it 'creates a file on the local', (done) ->
            fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'
            Files.uploadFile one, fixturePath, (err, created) ->
                one.id = two.id = created.id
                waitAppear onePath, done

        it 'moves the file', (done) ->
            setTimeout ->
                Files.updateFile two, (err, updated) ->
                    should.not.exist err
                    waitAppear twoPath, ->
                        fs.existsSync(onePath).should.be.false()
                        done()
            , 800

        it 'moves back the file to its original path', (done) ->
            setTimeout ->
                Files.updateFile one, (err, updated) ->
                    should.not.exist err
                    waitAppear onePath, ->
                        fs.existsSync(twoPath).should.be.false()
                        done()
            , 800


    describe 'Delete a file and recreate it', ->
        file =
            path: ''
            name: faker.hacker.verb()

        filePath = ''
        fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'

        it 'creates a file on the local', (done) ->
            filePath = path.join @syncPath, file.path, file.name
            Files.uploadFile file, fixturePath, (err, created) ->
                file.id = created.id
                waitAppear filePath, done

        it 'removes the file', (done) ->
            setTimeout ->
                Files.removeFile file, (err, removed) ->
                    waitDisappear filePath, done
            , 500

        it 'recreates the file', (done) ->
            setTimeout ->
                delete file.id
                Files.uploadFile file, fixturePath, (err, created) ->
                    waitAppear filePath, done
            , 500
