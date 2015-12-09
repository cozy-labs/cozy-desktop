faker  = require 'faker'
find   = require 'lodash.find'
fs     = require 'fs-extra'
path   = require 'path'
should = require 'should'

Cozy  = require '../helpers/integration'
Files = require '../helpers/files'


describe 'Conflict between remote docs with distinct cases', ->
    @slow 1000
    @timeout 10000

    before Cozy.ensurePreConditions


    describe '2 files', ->
        it 'TODO'

    describe '2 folders', ->
        it 'TODO'

    describe 'a file and a folder', ->
        it 'TODO'
