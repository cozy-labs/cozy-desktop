path = require 'path-extra'
fs = require 'fs'

homedir = path.homedir()
configDir = path.join homedir, '.cozy-data-proxy'
configPath = path.join configDir, 'config.json'
if not fs.existsSync configPath
    fs.writeFileSync configPath, JSON.stringify devices: {}, null, 2

config = require configPath

keys = Object.keys config.devices
device = config.devices[keys[0]] if keys.length > 0
device ?= {}

configHelpers =

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
        else if not device.deviceId?
            'STEP2'
        else
            'STATE'
