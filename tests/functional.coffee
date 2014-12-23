{exec} = require 'child_process'
fs = require 'fs'
path = require 'path'
should = require 'should'
helpers = require './helpers/helpers'
cliHelpers = require './helpers/cli'
filesHelpers = require './helpers/files'
foldersHelpers = require './helpers/folders'

{syncPath} = helpers.options

describe.only "Functional Tests", ->

    before helpers.ensurePreConditions

    # Prepares the local system
    before filesHelpers.deleteAll
    before helpers.cleanFolder syncPath
    before helpers.prepareFolder syncPath

    # Prepares the sync and starts it
    before cliHelpers.mockGetPassword
    before cliHelpers.cleanConfiguration
    before cliHelpers.initConfiguration
    before cliHelpers.startSync

    # Cleans up local system
    after cliHelpers.stopSync
    after cliHelpers.cleanConfiguration
    after cliHelpers.restoreGetPassword
    after helpers.cleanFolder syncPath
    after filesHelpers.deleteAll
    after cliHelpers.resetDatabase

    describe.only "Locally changes", ->

        describe.only "Empty folder changes", ->

            it "Create a folder locally", (done) ->
                @timeout 15000
                folderName = 'test_folder'
                folderPath = "#{syncPath}/#{folderName}"

                command = "mkdir #{folderName}"
                exec command, cwd: syncPath, ->

                    # folder should exist
                    fs.existsSync(folderPath).should.be.ok

                    # waits for the replication / upload to be processed
                    setTimeout ->
                        foldersHelpers.getFolderContent 'root', (err, files) ->
                            folder = foldersHelpers.getElementByName folderName, files
                            should.exist folder
                            folder.name.should.equal folderName
                            done()
                    , 6000

            it "Create a second folder locally", (done) ->
                @timeout 15000
                folderName = 'test_folder_2'
                folderPath = "#{syncPath}/#{folderName}"

                command = "mkdir #{folderName}"
                exec command, cwd: syncPath, ->

                    # folder should exist
                    fs.existsSync(folderPath).should.be.ok

                    # waits for the replication / upload to be processed
                    setTimeout ->
                        foldersHelpers.getFolderContent 'root', (err, files) ->
                            folder = foldersHelpers.getElementByName folderName, files
                            should.exist folder
                            folder.name.should.equal folderName
                            done()
                    , 6000

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
                    , 10000

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
                    fs.existsSync(newPath).should.be.ok

                    setTimeout ->
                        foldersHelpers.getFolderContent 'root', (err, files) ->
                            folder = foldersHelpers.getElementByName folderPathName, files
                            should.exist folder
                            foldersHelpers.getFolderContent folder, (err, files) ->
                                folder = foldersHelpers.getElementByName folderName, files
                                should.exist folder
                                done()
                    , 6000

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
                            fs.existsSync(fullPath).should.not.be.ok

                            setTimeout ->
                                foldersHelpers.getFolderContent 'root', (err, files) ->
                                    folder = filesHelpers.getElementByName folderPathName, files, false
                                    should.exist folder
                                    foldersHelpers.getFolderContent folder, (err, files) ->
                                        folder = foldersHelpers.getElementByName folderName, files, false
                                        should.not.exist folder
                                        done()
                            , 6000



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
                    , 15000

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
                    , 10000

            it "Move a file locally into a subfolder", (done) ->
                @timeout 15000

                expectedContent = "TEST ME"
                fileName = 'test_changed.txt'
                filePath = "#{syncPath}/#{fileName}"
                folderName = 'test_folder'
                folderPath = "#{syncPath}/#{folderName}/"
                newPath = "#{folderPath}#{fileName}"

                command = "mv #{filePath} #{folderPath}"
                exec command, cwd: syncPath, ->
                    # file should exist at the new path
                    fs.existsSync(newPath).should.be.ok

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
                    , 6000

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
                    fs.existsSync(newPath).should.be.ok

                    setTimeout ->
                        foldersHelpers.getFolderContent 'root', (err, files) ->
                            file = filesHelpers.getElementByName fileName, files
                            should.exist file
                            filesHelpers.getFileContent file, (err, content) ->
                                content.should.equal "#{expectedContent}\n"
                                done()
                    , 6000

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
                    fs.existsSync(newFilePath).should.be.ok

                    setTimeout ->
                        foldersHelpers.getFolderContent 'root', (err, files) ->
                            file = filesHelpers.getElementByName newFileName, files
                            should.exist file
                            filesHelpers.getFileContent file, (err, content) ->
                                content.should.equal "#{expectedContent}\n"
                                done()
                    , 6000

            it "Edit a file content locally", (done) ->
                @timeout 15000

                newContent = "MY FRIEND"
                expectedContent = "TEST ME\n#{newContent}"
                fileName = 'test_changed.txt'
                filePath = "#{syncPath}/#{fileName}"

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
                    , 6000

            it "Delete a file locally", (done) ->
                @timeout 15000

                fileName = 'test_copied.txt'
                filePath = "#{syncPath}/#{fileName}"

                foldersHelpers.getFolderContent 'root', (err, files) ->
                    file = filesHelpers.getElementByName fileName, files
                    should.exist file
                    command = "rm -rf #{filePath}"
                    exec command, cwd: syncPath, ->
                        # file should NOT exist anymore
                        fs.existsSync(filePath).should.not.be.ok

                        setTimeout ->
                            foldersHelpers.getFolderContent 'root', (err, files) ->
                                file = filesHelpers.getElementByName fileName, files, false
                                should.not.exist file
                                done()
                        , 6000

    describe.only 'Remotely changes', ->

        describe.only 'Empty folder changes', ->

            it "Create a folder remotely", (done) ->
                @timeout 15000
                folderName = 'remote-folder'
                folderPath = "#{syncPath}/#{folderName}"
                foldersHelpers.createFolder folderName, ->
                    foldersHelpers.getFolderContent 'root', (err, elements) ->
                        folder = foldersHelpers.getElementByName folderName, elements
                        should.exist folder
                        setTimeout ->
                            # folder should exist
                            fs.existsSync(folderPath).should.be.ok
                            done()
                        , 7000

            it "Create a second folder remotely", (done) ->
                @timeout 15000
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
                        , 7000

            it "Rename folder remotely", (done) ->
                @timeout 15000
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
                        , 7000

            it "Move a folder remotely into a subfolder", (done) ->
                @timeout 15000
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
                            , 7000

            it "Delete a folder remotely", (done) ->
                @timeout 15000

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
                            , 7000

        describe.only 'File changes', ->

            it "Create a file remotely", (done) ->
                @timeout 15000
                fixturePath = path.resolve __dirname, './fixtures/chat-mignon.jpg'
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
                        , 7000

            it "Rename a file remotely", (done) ->
                @timeout 15000
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
                        , 7000

            it "Move a file remotely into a subfolder", (done) ->
                @timeout 15000
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
                            , 7000

            it "Move a file remotely from a subfolder", (done) ->
                @timeout 15000
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
                                , 7000

            it "Delete a file remotely", (done) ->
                @timeout 15000

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
                        , 7000

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
            fs.existsSync(filePath).should.be.ok
            setTimeout ->
                foldersHelpers.getFolderContent 'root', (err, files) ->
                    file = filesHelpers.getElementByName fileName, files
                    should.exist file
                    done()
            , (hour - generationDuration) * ms

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

