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

describe.only "Functional Tests", ->

    before helpers.ensurePreConditions

    # Prepares the local system
    before filesHelpers.deleteAll
    before helpers.cleanFolder syncPath
    before helpers.prepareFolder syncPath

    # Prepares the sync and starts it
    before cliHelpers.cleanConfiguration
    before cliHelpers.initConfiguration
    before cliHelpers.initSync
    before (done) ->
        cliHelpers.startSync ->
            setTimeout done, 500

    # Cleans up local system
    after cliHelpers.stopSync
    after cliHelpers.cleanConfiguration
    after helpers.cleanFolder syncPath
    after filesHelpers.deleteAll
    after cliHelpers.resetDatabase

    describe "Big file tests", ->
        it.skip "Create a big file locally", (done) ->
            ms = 1000
            hour = 3600
            generationDuration = 35
            @timeout hour * ms

            fileSize = 1.2 * 1024 * 1024 * 1024
            fileName = 'big_file.bin'
            filePath = "#{syncPath}/#{fileName}"
            command = "dd if=/dev/zero bs=1 count=0 seek=2000000000 " + \
                      "of=#{filePath} > /dev/null 2>&1"

            # this command takes approximately 30s to be run
            exec command, cwd: syncPath, ->
                # file should exist
                fs.existsSync(filePath).should.be.ok()
                setTimeout ->
                    foldersHelpers.getFolderContent 'root', (err, files) ->
                        file = filesHelpers.getElementByName fileName, files
                        should.exist file
                        done()
                , (hour - generationDuration) * ms
