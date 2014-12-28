{exec} = require 'child_process'
fs = require 'fs'
path = require 'path'
should = require 'should'
log = require('printit')
    prefix: 'functional test'

helpers = require '../helpers/helpers'
cliHelpers = require '../helpers/cli'
filesHelpers = require '../helpers/files'
foldersHelpers = require '../helpers/folders'


mkdirp = require 'mkdirp'

WAIT_TIME = 6000

{syncPath} = helpers.options


describe.only "Local change", ->
    before helpers.ensurePreConditions

    # Prepares the local system
    before filesHelpers.deleteAll
    before helpers.cleanFolder syncPath
    before helpers.prepareFolder syncPath

    # Prepares the sync and starts it
    before cliHelpers.mockGetPassword
    before cliHelpers.cleanConfiguration
    before cliHelpers.initConfiguration
    before (done) ->
        cliHelpers.startSync ->
            setTimeout done, 500

    # Cleans up local system
    after cliHelpers.stopSync
    after helpers.cleanFolder syncPath
    after filesHelpers.deleteAll
    after cliHelpers.resetDatabase


    it "Edit a file content locally", (done) ->
        @timeout 15000

        fileName = 'test_changed.txt'
        filePath = "#{syncPath}/#{fileName}"
        content = "TEST ME\n"

        fs.writeFileSync filePath, content

        newContent = "MY FRIEND"
        expectedContent = "TEST ME\n#{newContent}"

        command = "echo \"#{newContent}\" >> #{filePath}"
        exec command, cwd: syncPath, ->
            # file should exist
            fs.existsSync(filePath).should.be.ok

            setTimeout ->
                foldersHelpers.getFolderContent 'root', (err, files) ->
                    file = filesHelpers.getElementByName fileName, files
                    should.exist file
                    filesHelpers.getFileContent file, (err, content) ->
                        content.should.equal "#{expectedContent}\n"
                    done()
            , WAIT_TIME
