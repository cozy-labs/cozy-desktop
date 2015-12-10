faker  = require 'faker'
find   = require 'lodash.find'
fs     = require 'fs-extra'
path   = require 'path'
should = require 'should'

Cozy  = require '../helpers/integration'
Files = require '../helpers/files'


describe 'Conflict when moving a folder', ->
    @slow 1000
    @timeout 10000

    before Cozy.ensurePreConditions


    # TODO Add move/rename detection to local watcher
    describe 'on local', ->
        it 'TODO'

    # TODO find how to rename a folder and its files on remote
    describe 'on remote', ->
        it 'TODO'
