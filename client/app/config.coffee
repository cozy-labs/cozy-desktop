path = require 'path-extra'
fs = require 'fs'

homedir = path.homedir()
configDir = path.join homedir, '.cozy-data-proxy'
configPath = path.join configDir, 'config.json'
config = require configPath

device = {}
keys = Object.keys config.devices
device = config.devices[keys[0]] if keys.length > 0

configHelpers =
    saveConfigSync: (deviceConfig) ->
        console.log deviceConfig
        config.devices[deviceConfig.deviceName] = deviceConfig
        console.log configPath
        fs.writeFileSync(configPath, JSON.stringify config, null, 2)
        console.log 'Configuration file successfully updated'
