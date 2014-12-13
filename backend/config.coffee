path      = require 'path-extra'
fs        = require 'fs-extra'
touch     = require 'touch'
process   = require 'process'
request   = require 'request-json-light'
urlParser = require 'url'
log       = require('printit')
    prefix: 'Config        '


# Create config file if it doesn't exist.
defaultDir = path.join path.homedir(), '.cozy-desktop'
configPath = path.join defaultDir, './config.json'
fs.ensureDirSync defaultDir
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
            throw "Device not set locally: #{deviceName}"


    # Get the argument after -d or --deviceName
    # Or return the first device name
    getDeviceName: () ->
        for arg, index in process.argv
            if arg is '-d' or arg is '--deviceName'
                return process.argv[index + 1]

        return Object.keys(@config.devices)[0]


    # Get useful information about the disk space
    # (total, used and left) on the remote Cozy
    getDiskSpace: (callback) ->
        device = config.getConfig()
        client = request.newClient device.url
        client.setBasicAuth device.deviceName, device.devicePassword

        client.get "disk-space", (err, res, body) ->
            if err
                callback err
            else if body.error
                callback new Error body.error
            else
                callback null, body


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


    # Set last replication sequence in the configuration file.
    setSeq: (seq, deviceName) ->
        deviceName ?= @getDeviceName()
        @config.devices[deviceName].seq = seq
        @saveConfig()


    # Get last replication sequence from the configuration file.
    getSeq: (deviceName) ->
        deviceName ?= @getDeviceName()
        if @config.devices[deviceName].seq
            return @config.devices[deviceName].seq
        else
            @setSeq 0, deviceName
            return 0


    # Set last change sequence in the configuration file.
    setChangeSeq: (seq, deviceName) ->
        deviceName ?= @getDeviceName()
        @config.devices[deviceName].changeSeq = seq
        @saveConfig()


    # Get last change sequence from the configuration file.
    getChangeSeq: (deviceName) ->
        deviceName ?= @getDeviceName()
        if @config.devices[deviceName].changeSeq
            return @config.devices[deviceName].changeSeq
        else
            @setSeq 0, deviceName
            return 0

    getUrl: (deviceName) ->
        deviceName ?= @getDeviceName()
        remoteConfig = @getConfig(deviceName)
        if remoteConfig.url?
            url = urlParser.parse remoteConfig.url
            url.auth = "#{deviceName}:#{remoteConfig.devicePassword}"
            url = "#{urlParser.format(url)}cozy"
        else
            null

    updateSync: (deviceConfig) ->
        device = @getConfig()
        delete @config.devices[device.deviceName]
        for key, value of deviceConfig
            device[key] = deviceConfig[key]
        @config.devices[device.deviceName] = device

        fs.writeFileSync configPath, JSON.stringify @config, null, 2
        console.log 'Configuration file successfully updated'
