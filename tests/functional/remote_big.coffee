{exec} = require 'child_process'
fs = require 'fs'
path = require 'path'
should = require 'should'
helpers = require '../helpers/helpers'
cliHelpers = require '../helpers/cli'
filesHelpers = require '../helpers/files'
foldersHelpers = require '../helpers/folders'

mkdirp = require 'mkdirp'

WAIT_TIME = 3000

{syncPath} = helpers.options

describe "Functional Tests", ->

    before helpers.ensurePreConditions

    # Prepares the local system
    before filesHelpers.deleteAll
    before helpers.cleanFolder syncPath
    before helpers.prepareFolder syncPath

    # Prepares the sync and starts it
    before cliHelpers.mockGetPassword
    before cliHelpers.cleanConfiguration
    before cliHelpers.initConfiguration
    before cliHelpers.initSync
    before (done) ->
        cliHelpers.startSync ->
            setTimeout done, 500

    # Cleans up local system
    after cliHelpers.stopSync
    after cliHelpers.cleanConfiguration
    after cliHelpers.restoreGetPassword
    after helpers.cleanFolder syncPath
    after filesHelpers.deleteAll
    after cliHelpers.resetDatabase

    describe 'Remote big file', ->

        it.skip "Create a big file a file remotely", (done) ->
            ms = 1000
            hour = 3600
            generationDuration = 35
            @timeout hour * ms

            fileSize = 1.2 * 1024 * 1024 * 1024
            fileName = 'big_file.bin'
            filePath = "/tmp/#{fileName}"
            command = "dd if=/dev/zero bs=1 count=0 seek=2000000000 " + \
                      "of=#{filePath} > /dev/null 2>&1"

            # this command takes approximately 30s to be run
            exec command, cwd: "/tmp", ->
                filesHelpers.uploadFile 'big_file.bin', filePath, ->
                    foldersHelpers.getFolderContent 'root', (err, files) ->
                        file = filesHelpers.getElementByName fileName, files
                        should.exist file
                        setTimeout ->
                            # file should exists
                            fs.existsSync(filePath).should.be.ok()
                        , (hour - generationDuration) * ms

