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
    before Cozy.registerDevice
    before Cozy.pull
    after Cozy.clean


    it 'creates a folder on the local fs from the remote cozy', (done) ->
        name = faker.hacker.noun()
        Files.createFolder path: '', name: name, (err, folder) =>
            setTimeout =>
                folderPath = path.join @basePath, name
                fs.existsSync(folderPath).should.be.true()
                done()
            , 4000
