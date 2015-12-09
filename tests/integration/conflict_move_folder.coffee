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


    describe 'on local', ->
        it 'TODO'

    describe 'on remote', ->
        it 'TODO'
