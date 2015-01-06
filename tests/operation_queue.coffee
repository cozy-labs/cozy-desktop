fs = require 'fs-extra'
touch = require 'touch'
date = require 'date-utils'
mkdirp = require 'mkdirp'

path = require 'path'
should = require 'should'
helpers = require './helpers/helpers'
cliHelpers = require './helpers/cli'
fileHelpers = require './helpers/files'
folderHelpers = require './helpers/folders'
client = helpers.getClient()

config = require '../backend/config'
pouch = require '../backend/db'
filesystem = require '../backend/filesystem'
{syncPath} = helpers.options

describe "Operation Queue Tests", ->
    @timeout 4000

    before cliHelpers.resetDatabase
    before cliHelpers.initConfiguration
    before fileHelpers.deleteAll
    after cliHelpers.resetDatabase

    describe "waitNetwork", ->
    describe "createFileLocally", ->
    describe "createFolderLocally", ->
    describe "deleteFolderLocally", ->
    describe "moveFileLocally", ->
    describe "moveFolderLocally", ->
    describe "ensureAllFilesLocally", ->
    describe "ensureAllFoldersLocally", ->
    describe "prepareRemoteCreation", ->
    describe "createFileRemotely", ->
    describe "createFolderRemotely", ->
    describe "deleteFileRemotely", ->
    describe "forceDeleteFileRemotely", ->
    describe "deleteFolderRemotely", ->
    describe "updateFileRemotely", ->
    describe "ensureAllFilesRemotely", ->
    describe "ensureAllFoldersRemotely", ->
    describe "makeFSSimilarToDB", ->
    describe "displayErrorStack", ->
