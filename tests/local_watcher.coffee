fs = require 'fs-extra'
touch = require 'touch'
date = require 'date-utils'
mkdirp = require 'mkdirp'
async = require 'async'

path = require 'path'
should = require 'should'
helpers = require './helpers/helpers'
cliHelpers = require './helpers/cli'
fileHelpers = require './helpers/files'
folderHelpers = require './helpers/folders'
client = helpers.getClient()

config = require '../backend/config'
pouch = require '../backend/db'
localWatcher = require '../backend/local_event_watcher'
{syncPath} = helpers.options

describe "LocalWatcher Tests", ->
    @timeout 8000

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    describe "init", ->
        localFiles = [
            {name: 'localfile-01', parent: ''}
            {name: 'localfile-02', parent: '/localfolder-01'}
            {name: 'localfile-03', parent: '/localfolder-01/localsub-01'}
        ]
        localFolders = [
            {name: 'localfolder-01', parent: ''}
            {name: 'localsub-01', parent: '/localfolder-01'}
        ]

        # Launch local event watcher
        before (done) ->
            localWatcher.start()
            setTimeout (-> done()), 2000

        # Create local folders
        before ->
            localFolders.forEach (folder) ->
                mkdirp.sync path.join syncPath, folder.parent, folder.name

        # Create local files
        before ->
            localFiles.forEach (file) ->
                touch.sync path.join syncPath, file.parent, file.name

        # Wait for files to be uploaded
        before (done) ->
            setTimeout (-> done()), 5000


        it "all files are present remotely", (done) ->
            fileHelpers.getAll (err, files) ->
                should.not.exist err

                fileHash = {}
                files.forEach (file) ->
                    fileHash[path.join file.path, file.name] = true

                localFiles.forEach (file) ->
                    fileHash[path.join file.parent, file.name].should.be.ok

                done()

        it "and all folders are present remotely", (done) ->
            folderHelpers.getAll (err, folders) ->
                should.not.exist err

                folderHash = {}
                folders.forEach (folder) ->
                    folderHash[path.join folder.path, folder.name] = true

                localFolders.forEach (folder) ->
                    folderPath = path.join folder.parent, folder.name
                    folderHash[folderPath].should.be.ok

                done()

        it "and all files/folders are present locally", ->
            localFolders.forEach (folder) ->
                folderPath = path.join syncPath, folder.parent, folder.name
                fs.existsSync(folderPath).should.be.ok
            localFiles.forEach (file) ->
                filePath = path.join syncPath, file.parent, file.name
                fs.existsSync(filePath).should.be.ok
