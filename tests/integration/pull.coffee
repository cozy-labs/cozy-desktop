faker  = require 'faker'
fs     = require 'fs-extra'
path   = require 'path'
should = require 'should'

Cozy  = require '../helpers/integration'
Files = require '../helpers/files'


describe 'Pull', ->
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

    parent =
        path: ''
        name: faker.company.bsBuzz()
    folder =
        path: ''
        name: faker.company.bsNoun()
    file =
        path: ''
        name: faker.company.bsAdjective()

    it 'creates a folder on the local fs from the remote cozy', (done) ->
        Files.createFolder folder, (err, created) =>
            folder.id = created.id
            folderPath = path.join @basePath, folder.path, folder.name
            waitAppear folderPath, ->
                stats = fs.statSync(folderPath)
                stats.isDirectory().should.be.true()
                done()

    it 'renames the folder', (done) ->
        oldPath = path.join @basePath, folder.name
        folder.name = faker.hacker.noun()
        Files.updateFolder folder, (err, updated) =>
            folderPath = path.join @basePath, folder.path, folder.name
            waitAppear folderPath, ->
                fs.existsSync(oldPath).should.be.false()
                done()

    it 'moves the folder', (done) ->
        oldPath = path.join @basePath, folder.name
        Files.createFolder parent, (err, created) =>
            folder.path = parent.name
            Files.updateFolder folder, (err, updated) =>
                folderPath = path.join @basePath, folder.path, folder.name
                waitAppear folderPath, ->
                    fs.existsSync(oldPath).should.be.false()
                    done()

    it 'removes the folder', (done) ->
        Files.removeFolder folder, (err, removed) =>
            folderPath = path.join @basePath, folder.path, folder.name
            waitDisappear folderPath, done

    it 'creates a file on the local fs from the remote cozy', (done) ->
        fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'
        Files.uploadFile file, fixturePath, (err, created) =>
            file.id = created.id
            filePath = path.join @basePath, file.path, file.name
            waitAppear filePath, ->
                stats = fs.statSync(filePath)
                stats.isFile().should.be.true()
                stats.size.should.equal fs.statSync(fixturePath).size
                done()

    it 'renames the file', (done) ->
        oldPath = path.join @basePath, file.name
        file.name = faker.hacker.noun()
        Files.updateFile file, (err, updated) =>
            filePath = path.join @basePath, file.path, file.name
            waitAppear filePath, ->
                fs.existsSync(oldPath).should.be.false()
                done()

    it 'moves the file', (done) ->
        oldPath = path.join @basePath, file.name
        file.path = parent.name
        Files.updateFile file, (err, updated) =>
            filePath = path.join @basePath, file.path, file.name
            waitAppear filePath, ->
                fs.existsSync(oldPath).should.be.false()
                done()

    it 'removes the file', (done) ->
        Files.removeFile file, (err, removed) =>
            filePath = path.join @basePath, file.path, file.name
            waitDisappear filePath, done
