{exec} = require 'child_process'
fs = require 'fs'
path = require 'path'
should = require 'should'
helpers = require '../helpers/helpers'
cliHelpers = require '../helpers/cli'
filesHelpers = require '../helpers/files'
foldersHelpers = require '../helpers/folders'

mkdirp = require 'mkdirp'

WAIT_TIME = 5000

{syncPath} = helpers.options

describe.only "Functional Tests", ->
    @timeout 15000

    before -> console.log "ensurePreConditions"
    before helpers.ensurePreConditions

    # Prepares the local system
    before -> console.log "deleteAll"
    before filesHelpers.deleteAll
    before -> console.log "cleanFolder"
    before helpers.cleanFolder syncPath
    before -> console.log "prepareFolder"
    before helpers.prepareFolder syncPath

    # Prepares the sync and starts it
    before -> console.log "mockGetPassword"
    before cliHelpers.mockGetPassword
    before -> console.log "initConfiguration"
    before cliHelpers.initConfiguration
    before -> console.log "initSync"
    before cliHelpers.initSync
    before (done) ->
        before -> console.log "startSync"
        cliHelpers.startSync ->
            setTimeout done, 500

    # Cleans up local system
    after cliHelpers.stopSync
    # FIXME after cliHelpers.cleanConfiguration
    after cliHelpers.restoreGetPassword
    after helpers.cleanFolder syncPath
    after filesHelpers.deleteAll
    after cliHelpers.resetDatabase

    describe.only 'Remote changes', ->

        describe.only 'Empty folder changes', ->

            it "Create a folder remotely", (done) ->
                folderName = 'remote-folder'
                folderPath = "#{syncPath}/#{folderName}"
                foldersHelpers.createFolder folderName, ->
                    foldersHelpers.getFolderContent 'root', (err, elements) ->
                        folder = foldersHelpers.getElementByName(
                            folderName, elements)
                        should.exist folder
                        setTimeout ->
                            # folder should exist
                            fs.existsSync(folderPath).should.be.ok
                            done()
                        , WAIT_TIME

            it "Create a second folder remotely", (done) ->
                folderName = 'remote-folder-2'
                folderPath = "#{syncPath}/#{folderName}"
                foldersHelpers.createFolder folderName, ->
                    foldersHelpers.getFolderContent 'root', (err, elements) ->
                        folder = foldersHelpers.getElementByName folderName, elements
                        should.exist folder
                        setTimeout ->
                            # folder should exist
                            fs.existsSync(folderPath).should.be.ok
                            done()
                        , WAIT_TIME

            it "Rename folder remotely", (done) ->
                folderName = 'remote-folder-2'
                newName = 'remote-folder-bis'
                newPath = "#{syncPath}/#{newName}"
                foldersHelpers.getFolderContent 'root', (err, files) ->
                    folder = foldersHelpers.getElementByName folderName, files
                    should.exist folder
                    foldersHelpers.renameFolder folder, newName, ->
                        setTimeout ->
                            # folder should exist
                            fs.existsSync(newPath).should.be.ok
                            done()
                        , WAIT_TIME

            it "Move a folder remotely into a subfolder", (done) ->
                folderName = 'remote-folder-bis'
                folderPathName = 'remote-folder'
                newPath = "#{syncPath}/#{folderPathName}/#{folderName}"
                foldersHelpers.getFolderContent 'root', (err, files) ->
                    folder = filesHelpers.getElementByName folderName, files
                    should.exist folder
                    folderPath = foldersHelpers.getElementByName folderPathName, files
                    should.exist folderPath
                    foldersHelpers.moveFolder folder, folderPathName, ->
                        foldersHelpers.getFolderContent folderPath, (err, files) ->
                            folder = filesHelpers.getElementByName folderName, files
                            should.exist folder
                            setTimeout ->
                                # file should exist at new path
                                fs.existsSync(newPath).should.be.ok
                                done()
                            , WAIT_TIME

            it "Delete a folder remotely", (done) ->
                folderName = 'remote-folder-bis'
                folderPathName = 'remote-folder'
                folderPath = "#{syncPath}/#{folderPathName}/#{folderName}"
                fs.existsSync(folderPath).should.be.ok
                foldersHelpers.getFolderContent "root", (err, files) ->
                    folderPath = foldersHelpers.getElementByName folderPathName, files
                    should.exist folderPath
                    foldersHelpers.getFolderContent folderPath, (err, files) ->
                        folder = foldersHelpers.getElementByName folderName, files
                        should.exist folder
                        foldersHelpers.removeFolder folder, ->
                            setTimeout ->
                                # file should exist at new path
                                fs.existsSync(folderPath).should.not.be.ok
                                done()
                            , WAIT_TIME

        describe.only 'File changes', ->

            it "Create a file remotely", (done) ->
                fixturePath = path.resolve __dirname, '../fixtures/chat-mignon.jpg'
                fileName = 'chat-mignon.jpg'
                filePath = "#{syncPath}/#{fileName}"
                filesHelpers.uploadFile fileName, fixturePath, ->
                    foldersHelpers.getFolderContent 'root', (err, files) ->
                        file = filesHelpers.getElementByName fileName, files
                        should.exist file
                        setTimeout ->
                            # file should exist
                            fs.existsSync(filePath).should.be.ok
                            done()
                        , WAIT_TIME

            it "Rename a file remotely", (done) ->
                fileName = 'chat-mignon.jpg'
                newName = 'chat-mignon-renamed.jpg'
                newPath = "#{syncPath}/#{newName}"
                foldersHelpers.getFolderContent 'root', (err, files) ->
                    file = filesHelpers.getElementByName fileName, files
                    should.exist file
                    filesHelpers.renameFile file, newName, ->
                        setTimeout ->
                            # file should exist
                            fs.existsSync(newPath).should.be.ok
                            done()
                        , WAIT_TIME

            it "Move a file remotely into a subfolder", (done) ->
                fileName = 'chat-mignon-renamed.jpg'
                folderName = 'remote-folder'
                newPath = "#{syncPath}/#{folderName}/#{fileName}"
                foldersHelpers.getFolderContent 'root', (err, files) ->
                    file = filesHelpers.getElementByName fileName, files
                    should.exist file
                    folder = foldersHelpers.getElementByName folderName, files
                    should.exist folder
                    filesHelpers.moveFile file, folderName, ->
                        foldersHelpers.getFolderContent folder, (err, files) ->
                            file = filesHelpers.getElementByName fileName, files
                            should.exist file
                            setTimeout ->
                                # file should exist at new path
                                fs.existsSync(newPath).should.be.ok
                                done()
                            , WAIT_TIME

            it "Move a file remotely from a subfolder", (done) ->
                fileName = 'chat-mignon-renamed.jpg'
                folderName = 'remote-folder'
                newPath = "#{syncPath}/#{fileName}"
                foldersHelpers.getFolderContent 'root', (err, files) ->
                    folder = foldersHelpers.getElementByName folderName, files
                    should.exist folder
                    foldersHelpers.getFolderContent folder, (err, files) ->
                        file = filesHelpers.getElementByName fileName, files
                        should.exist file
                        filesHelpers.moveFile file, "", ->
                            foldersHelpers.getFolderContent "root", (err, files) ->
                                file = filesHelpers.getElementByName fileName, files
                                should.exist file
                                setTimeout ->
                                    # file should exist at new path
                                    fs.existsSync(newPath).should.be.ok
                                    done()
                                , WAIT_TIME

            it "Delete a file remotely", (done) ->
                fileName = 'chat-mignon-renamed.jpg'
                filePath = "#{syncPath}/#{fileName}"
                fs.existsSync(filePath).should.be.ok
                foldersHelpers.getFolderContent "root", (err, files) ->
                    file = filesHelpers.getElementByName fileName, files
                    should.exist file
                    filesHelpers.removeFile file, ->
                        setTimeout ->
                            # file should exist at new path
                            fs.existsSync(filePath).should.not.be.ok
                            done()
                        , WAIT_TIME

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
                        fs.existsSync(filePath).should.be.ok
                    , (hour - generationDuration) * ms

