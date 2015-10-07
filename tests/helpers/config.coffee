EventEmitter = require('events').EventEmitter
del = require 'del'

Config = require '../../backend/config'


module.exports =
    createConfig: ->
        @basePath = process.env['DEFAULT_DIR'] or 'tmp'
        @config = new Config @basePath
        @config.devices['tester'] =
            deviceName: 'tester'
            password: 'password'
            url: 'nonecozy'

    cleanConfig: ->
        del.sync @config.configPath

    createEvents: ->
        @events = new EventEmitter
