EventEmitter = require('events').EventEmitter
del          = require 'del'
path         = require 'path'
mkdirp       = require 'mkdirp'

Config = require '../../backend/config'


module.exports =
    createConfig: ->
        parent = process.env['DEFAULT_DIR'] or 'tmp'
        @basePath = "#{parent}/#{+new Date}"
        mkdirp.sync @basePath
        @config = new Config @basePath
        @config.devices['tester'] =
            deviceName: 'tester'
            password: 'password'
            url: 'nonecozy'
            path: @basePath

    cleanConfig: ->
        del.sync @basePath

    createEvents: ->
        @events = new EventEmitter
