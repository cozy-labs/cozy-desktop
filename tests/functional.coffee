{exec} = require 'child_process'
fs = require 'fs'
should = require 'should'
helpers = require './helpers/helpers'

{syncPath} = helpers.options

describe.only "Functional Tests", ->

    before helpers.mockGetPassword
    before helpers.cleanConfiguration
    before helpers.cleanSyncFolder
    before helpers.initConfiguration
    before helpers.prepareSyncFolder
    before helpers.startSync

    after helpers.stopSync
    after helpers.cleanSyncFolder
    after helpers.restoreGetPassword

    it "When I create a file locally", (done) ->

        @timeout 10000

        expectedContent = "TEST ME"

        fileName = 'test.txt'
        filePath = "#{syncPath}/#{fileName}"

        command = "echo \"#{expectedContent}\" > #{fileName}"
        exec command, cwd: syncPath, (err, stderr, stdout) ->
            content = fs.readFileSync filePath, encoding: 'UTF-8'
            content.should.equal "#{expectedContent}\n"

            done()



    it "Delete a file locally"
    it "Rename a file locally"
    it "Move a file locally in the same folder"
    it "Move a file locally in a subfolder"
    it "Move a file locally from a subfolder"
    it "Copy a file locally"
    it "Edit a file content"
    it "Create a big file locally"

    it "Create a file remotely"
    it "Delete a file remotely"
    it "Rename a file remotely"
    it "Move a file remotely in the same folder"
    it "Move a file remotely in a subfolder"
    it "Move a file remotely from a subfolder"
    it "Copy a file remotely"
    it "Create a big file a file remotely"
