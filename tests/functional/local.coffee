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

    describe.only "Locally changes", ->

        describe.only "Empty folder changes", ->

            it "Create a folder locally", (done) ->
                @timeout 20000
                folderName = 'test_folder'
                folderPath = path.join syncPath, folderName

                setTimeout ->
                    command = "mkdir #{folderName}"
                    exec command, cwd: syncPath, (err) ->

                        # folder should exist
                        fs.existsSync(folderPath).should.be.ok()

                        # waits for the replication / upload to be processed
                        setTimeout ->
                            foldersHelpers.getFolderContent 'root', (err, files) ->
                                folder = foldersHelpers.getElementByName folderName, files
                                should.exist folder
                                folder.name.should.equal folderName
                                done()
                        , 4000
                , 1500 # local watcher starts 1 second after remote watcher

            it "Create a second folder locally", (done) ->
                @timeout 15000
                folderName = 'test_folder_2'
                folderPath = "#{syncPath}/#{folderName}"

                command = "mkdir #{folderName}"
                exec command, cwd: syncPath, ->

                    # folder should exist
                    fs.existsSync(folderPath).should.be.ok()

                    # waits for the replication / upload to be processed
                    setTimeout ->
                        foldersHelpers.getFolderContent 'root', (err, files) ->
                            folder = foldersHelpers.getElementByName folderName, files
                            should.exist folder
                            folder.name.should.equal folderName
                            done()
                    , WAIT_TIME

            it "Rename a folder locally", (done) ->
                @timeout 30000

                folderName = 'test_folder_2'
                folderPath = "#{syncPath}/#{folderName}"
                newName = 'test_folder_bis'
                newFolderPath = "#{syncPath}/#{newName}"

                command = "mv #{folderPath} #{newFolderPath}"
                exec command, cwd: syncPath, ->

                    # waits for the replication / upload to be processed
                    setTimeout ->
                        foldersHelpers.getFolderContent 'root', (err, elements) ->
                            folder = filesHelpers.getElementByName newName, elements
                            should.exist folder
                            done()
                    , WAIT_TIME

            it "Move a folder locally into a subfolder", (done) ->
                @timeout 15000

                folderName = 'test_folder_bis'
                folderPathName = 'test_folder'
                oldPath = "#{syncPath}/#{folderName}/"
                newFolderPath = "#{syncPath}/#{folderPathName}/"
                newPath = "#{newFolderPath}/#{folderName}"

                command = "mv #{oldPath} #{newFolderPath}"
                exec command, cwd: syncPath, ->
                    # folder should exist at the new path
                    fs.existsSync(newPath).should.be.ok()

                    setTimeout ->
                        foldersHelpers.getFolderContent 'root', (err, files) ->
                            folder = foldersHelpers.getElementByName folderPathName, files
                            should.exist folder
                            foldersHelpers.getFolderContent folder, (err, files) ->
                                folder = foldersHelpers.getElementByName folderName, files
                                should.exist folder
                                done()
                    , WAIT_TIME

            it "Delete a folder locally", (done) ->
                @timeout 15000

                folderName = 'test_folder_bis'
                folderPathName = 'test_folder'
                folderPath = "#{syncPath}/#{folderPathName}/"
                fullPath = "#{folderPath}/#{folderName}"

                foldersHelpers.getFolderContent 'root', (err, files) ->
                    folder = foldersHelpers.getElementByName folderPathName, files
                    should.exist folder
                    foldersHelpers.getFolderContent folder, (err, files) ->
                        folder = foldersHelpers.getElementByName folderName, files
                        should.exist folder
                        command = "rm -rf #{fullPath}"
                        exec command, cwd: syncPath, ->
                            # folder should NOT exist anymore
                            fs.existsSync(fullPath).should.not.be.ok()

                            setTimeout ->
                                foldersHelpers.getFolderContent 'root', (err, files) ->
                                    folder = filesHelpers.getElementByName folderPathName, files, false
                                    should.exist folder
                                    foldersHelpers.getFolderContent folder, (err, files) ->
                                        folder = foldersHelpers.getElementByName folderName, files, false
                                        should.not.exist folder
                                        done()
                            , WAIT_TIME



        describe.only "File changes", ->

            it "When I create a file locally", (done) ->
                @timeout 30000
                expectedContent = "TEST ME"

                fileName = 'test.txt'
                filePath = "#{syncPath}/#{fileName}"

                command = "echo \"#{expectedContent}\" > #{fileName}"
                exec command, cwd: syncPath, ->
                    content = fs.readFileSync filePath, encoding: 'UTF-8'
                    content.should.equal "#{expectedContent}\n"

                    # waits for the replication / upload to be processed
                    setTimeout ->
                        foldersHelpers.getFolderContent 'root', (err, elements) ->
                            file = filesHelpers.getElementByName 'test.txt', elements
                            should.exist file
                            filesHelpers.getFileContent file, (err, content) ->
                                content.should.equal "#{expectedContent}\n"
                                done()
                    , WAIT_TIME * 2

            it "Rename a file locally", (done) ->
                @timeout 30000

                expectedContent = "TEST ME"
                fileName = "test.txt"
                filePath = "#{syncPath}/#{fileName}"
                newName = "test_changed.txt"
                newFilePath = "#{syncPath}/#{newName}"

                command = "mv #{filePath} #{newFilePath}"
                exec command, cwd: syncPath, ->

                    # waits for the replication / upload to be processed
                    setTimeout ->
                        foldersHelpers.getFolderContent 'root', (err, elements) ->
                            file = filesHelpers.getElementByName newName, elements
                            should.exist file
                            filesHelpers.getFileContent file, (err, content) ->
                                content.should.equal "#{expectedContent}\n"
                                done()
                    , WAIT_TIME * 2

            it "Move a file locally into a subfolder", (done) ->
                @timeout 15000

                expectedContent = "TEST ME"
                fileName = 'test_changed.txt'
                filePath = path.join "#{syncPath}/#{fileName}"
                folderName = 'test_folder'
                folderPath = "#{syncPath}/#{folderName}/"
                newPath = "#{folderPath}#{fileName}"

                command = "mv #{filePath} #{folderPath}"
                exec command, cwd: syncPath, ->
                    # file should exist at the new path
                    fs.existsSync(newPath).should.be.ok()

                    setTimeout ->
                        foldersHelpers.getFolderContent 'root', (err, files) ->
                            folder = foldersHelpers.getElementByName folderName, files
                            should.exist folder
                            foldersHelpers.getFolderContent folder, (err, files) ->
                                file = filesHelpers.getElementByName fileName, files
                                should.exist file
                                filesHelpers.getFileContent file, (err, content) ->
                                    content.should.equal "#{expectedContent}\n"
                                    done()
                    , WAIT_TIME * 2

            it "Move a file locally from a subfolder", (done) ->
                @timeout 15000

                expectedContent = "TEST ME"
                fileName = 'test_changed.txt'
                folderName = 'test_folder'
                filePath = "#{syncPath}/#{folderName}/#{fileName}"
                newPath = "#{syncPath}/#{fileName}"

                command = "mv #{filePath} #{syncPath}"
                exec command, cwd: syncPath, ->
                    # file should exist at the new path
                    fs.existsSync(newPath).should.be.ok()

                    setTimeout ->
                        foldersHelpers.getFolderContent 'root', (err, files) ->
                            file = filesHelpers.getElementByName fileName, files
                            should.exist file
                            filesHelpers.getFileContent file, (err, content) ->
                                content.should.equal "#{expectedContent}\n"
                                done()
                    , WAIT_TIME

            it "Copy a file locally", (done) ->
                @timeout 15000

                expectedContent = "TEST ME"
                fileName = 'test_changed.txt'
                filePath = "#{syncPath}/#{fileName}"
                newFileName =  'test_copied.txt'
                newFilePath = "#{syncPath}/#{newFileName}"

                command = "cp #{filePath} #{newFileName}"
                exec command, cwd: syncPath, ->
                    # file should exist at the new path
                    fs.existsSync(newFilePath).should.be.ok()

                    setTimeout ->
                        foldersHelpers.getFolderContent 'root', (err, files) ->
                            file = filesHelpers.getElementByName newFileName, files
                            should.exist file
                            filesHelpers.getFileContent file, (err, content) ->
                                content.should.equal "#{expectedContent}\n"
                                setTimeout ->
                                    done()
                                , 2000
                    , 6000

            it "Delete a file locally", (done) ->
                @timeout 15000

                fileName = 'test_copied.txt'
                filePath = "#{syncPath}/#{fileName}"

                foldersHelpers.getFolderContent 'root', (err, files) ->
                    file = filesHelpers.getElementByName fileName, files
                    should.exist file
                    command = "rm -f #{filePath}"
                    exec command, cwd: syncPath, ->
                        # file should NOT exist anymore
                        fs.existsSync(filePath).should.not.be.ok()

                        setTimeout ->
                            foldersHelpers.getFolderContent 'root', (err, files) ->
                                file = filesHelpers.getElementByName fileName, files, false
                                should.not.exist file
                                done()
                        , WAIT_TIME * 2
