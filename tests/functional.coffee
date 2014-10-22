{exec} = require 'child_process'
fs = require 'fs'
should = require 'should'
helpers = require './helpers/helpers'
cliHelpers = require './helpers/cli'
filesHelpers = require './helpers/files'

{syncPath, vaultPath} = helpers.options

describe.only "Functional Tests", ->

    before helpers.ensurePreConditions

    # Prepares the local filesystem for the tests
    before filesHelpers.deleteAll
    before helpers.cleanFolder syncPath
    before helpers.prepareFolder syncPath
    before helpers.cleanFolder vaultPath
    before helpers.prepareFolder vaultPath

    # Prepares the sync and starts it
    before cliHelpers.mockGetPassword
    before cliHelpers.cleanConfiguration
    before cliHelpers.initConfiguration
    before cliHelpers.initialReplication
    before cliHelpers.startSync

    # Cleans up things
    after helpers.cleanFolder syncPath
    after helpers.cleanFolder vaultPath
    after cliHelpers.restoreGetPassword

    it "When I create a file locally", (done) ->
        @timeout 10000

        expectedContent = "TEST ME"

        fileName = 'test.txt'
        filePath = "#{syncPath}/#{fileName}"

        command = "echo \"#{expectedContent}\" > #{fileName}"
        exec command, cwd: syncPath, (err, stderr, stdout) ->
            content = fs.readFileSync filePath, encoding: 'UTF-8'
            content.should.equal "#{expectedContent}\n"

            # waits for the replication / upload to be processed
            setTimeout ->
                filesHelpers.getRootContent (err, files) ->
                    files.length.should.equal 1
                    files[0].name.should.equal fileName
                    filesHelpers.download files[0], ->
                        vaultPath = "#{vaultPath}/#{fileName}"
                        content = fs.readFileSync filePath, encoding: 'UTF-8'
                        content.should.equal "#{expectedContent}\n"
                        done()
            , 5000

    it "Delete a file locally"
    it "Rename a file locally"
    it "Move a file locally in the same folder"
    it "Create a folder locally"
    it "Move a file locally into a subfolder"
    it "Move a file locally from a subfolder"
    it "Copy a file locally"
    it "Edit a file content"
    it "Create a big file locally"

    it "Create a file remotely"
    it "Delete a file remotely"
    it "Rename a file remotely"
    it "Move a file remotely in the same folder"
    it "Create a folder remotely"
    it "Move a file remotely into a subfolder"
    it "Move a file remotely from a subfolder"
    it "Copy a file remotely"
    it "Create a big file a file remotely"
