async = require 'async'
request = require 'request-json-light'
should = require 'should'
date = require 'date-utils'

config      = require '../backend/config'
replication = require '../backend/replication'
binary      = require '../backend/binary'
pouch       = require '../backend/db'

helpers = require './helpers/helpers'
cliHelpers = require './helpers/cli'
fileHelpers = require './helpers/files'

params =
    url: 'http://localhost:9104/'


describe "Conflict Tests", ->

    before cliHelpers.resetDatabase
    after cliHelpers.resetDatabase

    createBinary = (i, callback) ->
        pouch.db.put
            _id: "binary-#{i}"
            docType: 'Binary'
            binary:
                file:
                    id: "binary-#{i}"
        , callback

    createFile = (i, callback) ->
        pouch.db.put
            _id: "file-#{i}"
            docType: 'File'
            path: 'myfolder'
            name: "filename-#{i}"
        , callback

    createFolder = (i, callback) ->
        pouch.db.put
            _id: "folder-#{i}"
            docType: 'Folder'
            path: 'myfolder'
            name: "folder-#{i}"
        , callback

    before (done) ->
        async.eachSeries [1..3], createBinary, ->
            async.eachSeries [1..3], createFile, ->
                async.eachSeries [1..3], createFolder, done


    describe 'handleConflict', ->
