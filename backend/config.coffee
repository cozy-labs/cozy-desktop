path      = require 'path-extra'
fs        = require 'fs-extra'
touch     = require 'touch'
process   = require 'process'
request   = require 'request-json-light'
urlParser = require 'url'
log       = require('printit')
    prefix: 'Config        '


class Config

    # Create config file if it doesn't exist.
    constructor: (basePath) ->
        defaultDir = path.join basePath, '.cozy-desktop'
        @configPath = path.join path.resolve(defaultDir), 'config.json'
        fs.ensureDirSync defaultDir
        fs.ensureFileSync @configPath

        if fs.readFileSync(@configPath).toString() is ''
            @devices = {}
            @save()

        @dir = defaultDir
        @dbPath = path.join defaultDir, 'db'
        @devices = require @configPath

    # Save configuration to file system.
    save: ->
        fs.writeFileSync @configPath, JSON.stringify @devices, null, 2

    # Get the argument after -d or --deviceName
    # Or return the first device name
    getDefaultDeviceName: ->
        for arg, index in process.argv
            if arg is '-d' or arg is '--deviceName'
                return process.argv[index + 1]

        return Object.keys(@devices)[0]

    # Return config related to device name.
    getDevice: (deviceName) ->
        deviceName ?= @getDefaultDeviceName()

        if @devices[deviceName]?
            return @devices[deviceName]
        else if Object.keys(@devices).length is 0
            return {} # No device configured
        else
            log.error "Device not set locally: #{deviceName}"
            throw new Error "Device not set locally: #{deviceName}"

    # Update synchronously configuration for given device.
    updateSync: (deviceConfig) ->
        device = @getDevice deviceConfig.deviceName
        for key, value of deviceConfig
            device[key] = deviceConfig[key]
        @devices[device.deviceName] = device
        @save()
        log.info 'Configuration file successfully updated'

    # Add remote configuration for a given device name.
    addRemoteCozy: (options) ->
        @devices[options.deviceName] = options
        @save()

    # Remove remote configuration for a given device name.
    removeRemoteCozy: (deviceName) ->
        delete @devices[deviceName]
        @save()

    # Set last remote replication sequence in the configuration file.
    setRemoteSeq: (seq, deviceName) ->
        deviceName ?= @getDefaultDeviceName()
        @devices[deviceName].remoteSeq = seq
        @save()

    # Get last remote replication sequence from the configuration file.
    getRemoteSeq: (deviceName) ->
        deviceName ?= @getDefaultDeviceName()
        if @devices[deviceName].remoteSeq
            return @devices[deviceName].remoteSeq
        else
            @setRemoteSeq 0, deviceName
            return 0

    # Set last remote replication sequence in the configuration file.
    setLocalSeq: (seq, deviceName) ->
        deviceName ?= @getDefaultDeviceName()
        @devices[deviceName].localSeq = seq
        @save()

    # Get last remote replication sequence from the configuration file.
    getLocalSeq: (deviceName) ->
        deviceName ?= @getDefaultDeviceName()
        if @devices[deviceName].localSeq
            return @devices[deviceName].localSeq
        else
            @setLocalSeq 0, deviceName
            return 0

    # Get Couch URL for given device name.
    getUrl: (deviceName) ->
        deviceName ?= @getDefaultDeviceName()
        device = @getDevice deviceName
        if device.url?
            url = urlParser.parse device.url
            url.auth = "#{deviceName}:#{device.password}"
            "#{urlParser.format(url)}cozy"
        else
            null

    setInsecure: (bool, deviceName) ->
        deviceName ?= @getDefaultDeviceName()
        @devices[deviceName].insecure = bool
        @save()

    augmentCouchOptions: (options, deviceName) ->
        deviceName ?= @getDefaultDeviceName()
        if @devices[deviceName].insecure
            options.ajax =
                rejectUnauthorized: false
                requestCert: true
                agent: false
        options


module.exports = Config
