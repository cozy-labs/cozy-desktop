fs   = require 'fs-extra'
del  = require 'del'
path = require 'path'

Config = require '../../backend/config'


module.exports =
    createConfig: ->
        parent = process.env.DEFAULT_DIR or 'tmp'
        @basePath = path.resolve "#{parent}/#{+new Date}"
        fs.ensureDirSync @basePath
        @config = new Config @basePath
        @config.devices['tester'] =
            deviceName: 'tester'
            password: 'password'
            url: 'nonecozy'
            path: @basePath

    cleanConfig: ->
        del.sync @basePath
