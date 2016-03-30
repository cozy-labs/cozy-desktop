clone  = require 'lodash.clone'
faker  = require 'faker'
find   = require 'lodash.find'
fs     = require 'fs-extra'
path   = require 'path'
should = require 'should'

Cozy  = require '../helpers/integration'
Files = require '../helpers/files'
looper = require '../helpers/looper'


describe 'Push', ->
    @slow 1000
    @timeout 10000

    before Cozy.ensurePreConditions
    before Files.deleteAll
    before Cozy.registerDevice
    before Cozy.push
    after Cozy.clean

    parent =
        path: ''
        name: faker.commerce.color()
    folder =
        path: ''
        name: faker.hacker.noun()
        docType: 'folder'
    file =
        path: ''
        name: "#{faker.hacker.adjective()}.jpg"
        docType: 'file'

    it 'pushs a local folder to the remote cozy', (done) ->
        folderPath = path.join @basePath, folder.path, folder.name
        fs.ensureDirSync folderPath
        looper.check Files.getAllFolders, (err, folders) ->
            should.exist find folders, folder
            done()

    it 'renames the folder', (done) ->
        old = clone folder
        folder.name = faker.hacker.noun()
        oldPath = path.join @basePath, old.path, old.name
        newPath = path.join @basePath, folder.path, folder.name
        fs.renameSync oldPath, newPath
        looper.check Files.getAllFolders, (err, folders) ->
            should.not.exist find folders, old
            should.exist find folders, folder
            done()

    it 'moves the folder', (done) ->
        parentPath = path.join @basePath, parent.path, parent.name
        fs.ensureDirSync parentPath
        old = clone folder
        folder.path = "/#{parent.name}"
        oldPath = path.join @basePath, old.path, old.name
        newPath = path.join @basePath, folder.path, folder.name
        fs.renameSync oldPath, newPath
        looper.check Files.getAllFolders, (err, folders) ->
            should.not.exist find folders, old
            should.exist find folders, folder
            done()

    it 'removes the folder', (done) ->
        folderPath = path.join @basePath, folder.path, folder.name
        fs.rmdirSync folderPath
        looper.check Files.getAllFolders, (err, folders) ->
            should.not.exist find folders, folder
            done()

    it 'pushs a local file to the remote cozy', (done) ->
        fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'
        filePath = path.join @basePath, file.path, file.name
        fs.copySync fixturePath, filePath
        file.size = fs.statSync(fixturePath).size
        looper.check Files.getAllFiles, (err, files) ->
            should.exist find files, file
            done()

    it 'renames the file', (done) ->
        old = clone file
        delete old.size
        file.name = "#{faker.hacker.noun()}.jpg"
        oldPath = path.join @basePath, old.path, old.name
        newPath = path.join @basePath, file.path, file.name
        fs.renameSync oldPath, newPath
        looper.check Files.getAllFiles, (err, files) ->
            should.not.exist find files, old
            should.exist find files, file
            done()

    it 'moves the file', (done) ->
        old = clone file
        delete old.size
        file.path = "/#{parent.name}"
        oldPath = path.join @basePath, old.path, old.name
        newPath = path.join @basePath, file.path, file.name
        fs.renameSync oldPath, newPath
        looper.check Files.getAllFiles, (err, files) ->
            should.not.exist find files, old
            should.exist find files, file
            done()

    it 'overwrites the file', (done) ->
        fixturePath = path.join Cozy.fixturesDir, 'chat-mignon-mod.jpg'
        filePath = path.join @basePath, file.path, file.name
        fs.copySync fixturePath, filePath
        file.size = fs.statSync(fixturePath).size
        looper.check Files.getAllFiles, (err, files) ->
            should.exist find files, file
            done()

    it 'removes the file', (done) ->
        filePath = path.join @basePath, file.path, file.name
        fs.unlinkSync filePath
        looper.check Files.getAllFiles, (err, files) ->
            should.not.exist find files, file
            done()
