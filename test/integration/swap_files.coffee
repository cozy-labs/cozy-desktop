clone  = require 'lodash.clone'
faker  = require 'faker'
find   = require 'lodash.find'
fs     = require 'fs-extra'
path   = require 'path'
should = require 'should'

Cozy  = require '../helpers/integration'
Files = require '../helpers/files'


describe 'Swap 2 files', ->
    @slow 1000
    @timeout 10000

    before Cozy.ensurePreConditions
    before Files.deleteAll
    before Cozy.registerDevice
    before Cozy.sync
    after Cozy.clean

    one =
        path: ''
        name: faker.hacker.adjective()
        docType: 'file'
    two =
        path: ''
        name: faker.hacker.noun()
        docType: 'file'
    tmp =
        path: ''
        name: 'tmp-for-swap'
        docType: 'file'

    it 'pushs a local file to the remote cozy', (done) ->
        fixturePath = path.join Cozy.fixturesDir, 'chat-mignon.jpg'
        onePath = path.join @basePath, one.path, one.name
        fs.copySync fixturePath, onePath
        one.size = fs.statSync(fixturePath).size
        setTimeout ->
            Files.getAllFiles (err, files) ->
                found = find files, one
                should.exist found
                one.checksum = found.checksum
                done()
        , 2500

    it 'pushs another local file to the remote cozy', (done) ->
        fixturePath = path.join Cozy.fixturesDir, 'chat-mignon-mod.jpg'
        twoPath = path.join @basePath, two.path, two.name
        fs.copySync fixturePath, twoPath
        two.size = fs.statSync(fixturePath).size
        setTimeout ->
            Files.getAllFiles (err, files) ->
                found = find files, two
                should.exist found
                two.checksum = found.checksum
                done()
        , 2500

    it 'swaps the two file', (done) ->
        onePath = path.join @basePath, one.path, one.name
        twoPath = path.join @basePath, two.path, two.name
        tmpPath = path.join @basePath, tmp.path, tmp.name
        fs.renameSync onePath, tmpPath
        fs.renameSync twoPath, onePath
        fs.renameSync tmpPath, twoPath
        [one.size, two.size] = [two.size, one.size]
        [one.checksum, two.checksum] = [two.checksum, one.checksum]
        setTimeout ->
            Files.getAllFiles (err, files) ->
                should.exist find files, one
                should.exist find files, two
                should.not.exist find files, tmp
                done()
        , 3000
