fs        = require 'fs-extra'
path      = require 'path-extra'
urlParser = require 'url'
log       = require('printit')
    prefix: 'Config        '


# Config can keep some configuration parameters in a JSON file,
# like the devices credentials or the mount path
class Config

    # Create config file if it doesn't exist.
    constructor: (basePath) ->
        defaultDir = path.join basePath, '.cozy-desktop'
        @configPath = path.join path.resolve(defaultDir), 'config.json'
        @dbPath = path.join defaultDir, 'db'
        fs.ensureDirSync @dbPath
        fs.ensureFileSync @configPath

        if fs.readFileSync(@configPath).toString() is ''
            @devices = {}
            @save()

        @devices = require @configPath

    # Save configuration to file system.
    save: ->
        fs.writeFileSync @configPath, JSON.stringify @devices, null, 2
        true

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

    # Set the pull or push mode for this device
    # It wan throw an exception if the mode is not compatible with the last
    # mode used!
    setMode: (mode, deviceName) ->
        deviceName ?= @getDefaultDeviceName()
        if deviceName and @devices[deviceName]
            old = @devices[deviceName].mode
            return true if old is mode
            throw new Error 'Incompatible mode' if old?
            @devices[deviceName].mode = mode
            @save()
        else
            false

    # Set insecure flag, for self-signed certificate mainly
    setInsecure: (bool, deviceName) ->
        deviceName ?= @getDefaultDeviceName()
        if deviceName and @devices[deviceName]?.url
            @devices[deviceName].insecure = bool
            @save()
        else
            false

    # Add some options if the insecure flag is set
    augmentCouchOptions: (options, deviceName) ->
        deviceName ?= @getDefaultDeviceName()
        if @devices[deviceName].insecure
            options.ajax =
                rejectUnauthorized: false
                requestCert: true
                agent: false
        options


module.exports = Config
