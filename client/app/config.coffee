path = require 'path-extra'
fs = require 'fs-extra'

# This module loads the current configuration, sets up the global variables
# related to configuration and provide helpers to modify it.

homedir = path.homedir()
configDir = path.join homedir, '.cozy-desktop'
configPath = path.join configDir, 'config.json'

fs.ensureDirSync configDir
fs.ensureFileSync configPath

if fs.readFileSync(configPath).toString() is ''
    fs.writeFileSync configPath, JSON.stringify devices: {}, null, 2

config = require configPath

keys = Object.keys config.devices
device = config.devices[keys[0]] if keys.length > 0
device ?= {}

configHelpers =

    # Update device config fields in the config file.
    saveConfigSync: (deviceConfig) ->
        delete config.devices[device.deviceName]
        for key, value of deviceConfig
            device[key] = deviceConfig[key]
        config.devices[device.deviceName] = device

        fs.writeFileSync configPath, JSON.stringify config, null, 2
        console.log 'Configuration file successfully updated'

    getState: ->
        if not device.deviceName?
            'INTRO'
        else if not device.path?
            'STEP1'
        else if not device.url? or not device.deviceId?
            'STEP2'
        else
            'STATE'


