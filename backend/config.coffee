path    = require 'path-extra'
fs      = require 'fs-extra'
touch   = require 'touch'
process = require 'process'
log     = require('printit')
    prefix: 'Config     '

# Create config file if it doesn't exist.
defaultDir = path.join path.homedir(), '.cozy-data-proxy'
configPath = path.join defaultDir, './config.json'
fs.ensureFileSync configPath

if fs.readFileSync(configPath).toString() is ''
    fs.writeFileSync configPath, JSON.stringify devices: {}, null, 2


module.exports = config =
    dir: defaultDir
    dbPath: path.join defaultDir, 'db'
    config: require configPath or devices: {}

    # Return config related to device name.
    getConfig: (deviceName) ->
        deviceName ?= @getDeviceName()

        if @config.devices[deviceName]?
            return @config.devices[deviceName]
        else if Object.keys(@config.devices).length is 0
            return {} # No device configured
        else
            log.error "Device not set locally: #{deviceName}"
            process.exit 1


    # Get the argument after -d or --deviceName
    # Or return the first device name
    getDeviceName: () ->
        for arg, index in process.argv
            if arg is '-d' or arg is '--deviceName'
                return process.argv[index + 1]

        return Object.keys(@config.devices)[0]


    # Add remote configuration for a given device name.
    addRemoteCozy: (options) ->
        @config.devices ?= {}
        @config.devices[options.deviceName] = options
        @saveConfig()


    # Remove remote configuration for a given device name.
    removeRemoteCozy: (deviceName) ->
        @config.devices ?= {}
        delete @config.devices[deviceName]
        @saveConfig()


    # Save configuration to file system.
    saveConfig: ->
        fs.writeFileSync configPath, JSON.stringify @config, null, 2

    setSeq: (seq, deviceName) ->
        deviceName ?= @getDeviceName()
        @config.devices[deviceName].seq = seq
        @saveConfig()

    getSeq: (deviceName) ->
        deviceName ?= @getDeviceName()
        if @config.devices[deviceName].seq
            return @config.devices[deviceName].seq
        else
            @setSeq 0, deviceName
            return 0

    updateSync: (deviceConfig) ->
        device = @getConfig()
        delete @config.devices[device.deviceName]
        for key, value of deviceConfig
            device[key] = deviceConfig[key]
        @config.devices[device.deviceName] = device

        fs.writeFileSync configPath, JSON.stringify @config, null, 2
        console.log 'Configuration file successfully updated'
