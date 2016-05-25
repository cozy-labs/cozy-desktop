faker   = require 'faker'
fs      = require 'fs-extra'
path    = require 'path'
request = require 'request-json-light'
should  = require 'should'

Cozy  = require '../helpers/integration'
Files = require '../helpers/files'


# Images imported from cozy-mobile are special because they have no checksum
describe 'Image from mobile', ->
    @slow 1000
    @timeout 10000

    before Cozy.ensurePreConditions
    before Files.deleteAll
    before Cozy.registerDevice

    file =
        path: ''
        name: faker.commerce.color()
        lastModification: '2015-10-12T01:02:03Z'
        checksum: 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
    localPath = '/storage/emulated/0/DCIM/Camera/IMG_20160411_172611324.jpg'
    expectedSizes = []

    before 'Create the remote file', (done) ->
        fixturePath = path.join Cozy.fixturesDir, 'chat-mignon-mod.jpg'
        Files.uploadFile file, fixturePath, (err, created) ->
            file.remote = id: created.id
            file.size = fs.statSync(fixturePath).size
            done()

    before 'Remove the checksum and add tags + localPath', ->
        @app.instanciate()
        client = @app.remote.couch
        client.get file.remote.id, (err, doc) ->
            should.not.exist err
            delete doc.checksum
            doc.tags = ['foo', 'bar']
            doc.localPath = localPath
            client.put doc, (err, updated) ->
                should.not.exist err

    before Cozy.sync
    after Cozy.clean

    it 'waits a bit to do the synchronization', (done) ->
        setTimeout done, 5000

    it 'has the file on local', ->
        files = fs.readdirSync @syncPath
        files = (f for f in files when f isnt '.cozy-desktop')
        files.length.should.equal 1
        local = files[0]
        local.should.equal file.name
        size = fs.statSync(path.join @syncPath, local).size
        size.should.equal file.size

    it 'has the file on remote', (done) ->
        Files.getAllFiles (err, files) ->
            files.length.should.equal 1
            remote = files[0]
            remote.name.should.equal file.name
            remote.size.should.equal file.size
            remote.checksum.should.equal file.checksum
            remote.tags.should.eql ['foo', 'bar']
            done()

    it 'has kept the localPath on the remote file', (done) ->
        client = request.newClient 'http://localhost:5984/'
        client.get "cozy/#{file.remote.id}", (err, res, body) ->
            should.not.exist err
            body.localPath.should.equal localPath
            done()
