fs   = require 'fs-extra'
del  = require 'del'
path = require 'path'

Config = require '../../src/config'


module.exports =
    createConfig: ->
        parent = process.env.COZY_DESKTOP_DIR or 'tmp'
        @syncPath = path.resolve "#{parent}/#{+new Date}"
        fs.ensureDirSync @syncPath
        @config = new Config path.join @syncPath, '.cozy-desktop'
        @config.devices['tester'] =
            deviceName: 'tester'
            password: 'password'
            url: 'nonecozy'
            path: @syncPath

    cleanConfig: ->
        del.sync @syncPath
