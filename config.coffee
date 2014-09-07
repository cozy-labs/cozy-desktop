path = require 'path-extra'
fs = require 'fs-extra'
process = require 'process'
log = require('printit')
    prefix: 'Data Proxy | config'

defaultDir = path.join path.homedir(), '.cozy-data-proxy'
configPath = path.join defaultDir, './config.json'
fs.ensureFileSync configPath

if fs.readFileSync(configPath).toString() is ''
    fs.writeFileSync configPath, '{ "devices": {} }'

module.exports =
    dir: defaultDir
    dbPath: path.join defaultDir, 'db'
    config: require configPath or {}

    getConfig: (deviceName) ->
        deviceName = @getDeviceName() unless deviceName?

        if @config.devices[deviceName]?
            return @config.devices[deviceName]
        else if Object.keys(@config.devices).length is 0
            return {} # No device configured
        else
            log.error "Device not set locally: #{deviceName}"
            process.exit 1

    getDeviceName: () ->
        # Get the argument after -d or --deviceName
        for arg, index in process.argv
            if arg is '-d' or arg is '--deviceName'
                return process.argv[index + 1]

        # Or return the first device name
        return Object.keys(@config.devices)[0]

    addRemoteCozy: (options) ->
        @config.devices ?= {}
        @config.devices[options.deviceName] = options
        @saveConfig()

    removeRemoteCozy: (deviceName) ->
        @config.devices ?= {}
        delete @config.devices[deviceName]
        @saveConfig()

    saveConfig: ->
        fs.writeFileSync configPath, JSON.stringify @config, null, 2
