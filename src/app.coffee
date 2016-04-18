async     = require 'async'
fs        = require 'fs'
os        = require 'os'
path      = require 'path-extra'
readdirp  = require 'readdirp'
url       = require 'url'
filterSDK = require('cozy-device-sdk').filteredReplication
device    = require('cozy-device-sdk').device
log       = require('printit')
    prefix: 'Cozy Desktop  '
    date: true

EventEmitter = require('events').EventEmitter

Config  = require './config'
Pouch   = require './pouch'
Ignore  = require './ignore'
Merge   = require './merge'
Prep    = require './prep'
Local   = require './local'
Remote  = require './remote'
Sync    = require './sync'


# App is the entry point for the CLI and GUI.
# They both can do actions and be notified by events via an App instance.
class App

    # basePath is the directory where the config and pouch are saved
    constructor: (basePath) ->
        @lang = 'fr'
        @basePath = basePath or path.homedir()
        @config = new Config @basePath
        @pouch  = new Pouch @config
        @events = new EventEmitter


    # This method is here to be surcharged by the UI
    # to ask its password to the user
    #
    # callback is a function that takes two parameters: error and password
    askPassword: (callback) ->
        callback new Error('Not implemented'), null


    # This method is here to be surcharged by the UI
    # to ask for a confirmation before doing something that can't be cancelled
    #
    # callback is a function that takes two parameters: error and a boolean
    askConfirmation: (callback) ->
        callback new Error('Not implemented'), null


    # Parse the URL
    parseCozyUrl: (cozyUrl) ->
        if cozyUrl.indexOf(':') is -1
            if cozyUrl.indexOf('.') is -1
                cozyUrl += ".cozycloud.cc"
            cozyUrl = "https://#{cozyUrl}"
        return url.parse cozyUrl


    # Check that the URL belongs to a cozy
    pingCozy: (cozyUrl, callback) =>
        parsed = @parseCozyUrl cozyUrl
        unless parsed.protocol in ['http:', 'https:'] and parsed.hostname
            err = new Error "Your URL looks invalid"
            log.warn err
            callback? err
            return
        cozyUrl = url.format parsed
        device.pingCozy cozyUrl, (err) ->
            callback err, cozyUrl


    # Register a device on the remote cozy
    registerRemote: (cozyUrl, deviceName, callback) =>
        parsed = @parseCozyUrl cozyUrl
        cozyUrl = url.format parsed
        unless parsed.protocol in ['http:', 'https:'] and parsed.hostname
            err = new Error "Your URL looks invalid: #{cozyUrl}"
            log.warn err
            callback err
            return
        deviceName ?= os.hostname() or 'desktop'
        @askPassword (err, password) ->
            register = device.registerDeviceSafe
            register cozyUrl, deviceName, password, (err, credentials) ->
                return callback err if err
                config = file: true
                deviceName = credentials.deviceName
                log.debug 'setDesignDoc', cozyUrl, deviceName, config
                setDesignDoc = filterSDK.setDesignDoc.bind filterSDK
                setDesignDoc cozyUrl, deviceName, password, config, (err) ->
                    log.debug 'arguments'
                    callback err, credentials


    # Save the config with all the informations for synchonization
    saveConfig: (cozyUrl, syncPath, deviceName, password) =>
        options =
            path: path.resolve syncPath
            url: cozyUrl
            deviceName: deviceName
            password: password
        @config.addRemoteCozy options
        log.info 'The remote Cozy has properly been configured ' +
            'to work with current device.'


    # Register current device to remote Cozy and then save related informations
    # to the config file (used by CLI, not GUI)
    addRemote: (cozyUrl, syncPath, deviceName, callback) =>
        @registerRemote cozyUrl, deviceName, (err, credentials) =>
            if err
                log.error 'An error occured while registering your device.'
                if err.code is 'ENOTFOUND'
                    log.warn "The DNS resolution for #{parsed.hostname} failed."
                    log.warn 'Are you sure the domain is OK?'
                else if err is 'Bad credentials'
                    log.warn err
                    log.warn "Are you sure you didn't a typo on the password?"
                else
                    log.error err
                    if parsed.protocol is 'http:'
                        log.warn 'Did you try with an httpS URL?'
            else
                deviceName = credentials.deviceName
                password   = credentials.password
                @saveConfig cozyUrl, syncPath, deviceName, password
            callback? err, credentials


    # Unregister current device from remote Cozy and then remove remote from
    # the config file
    removeRemote: (deviceName, callback) =>
        cozyUrl = @config.getDevice(deviceName).url
        async.waterfall [
            @askPassword,
            (password, next) ->
                device.unregisterDevice cozyUrl, deviceName, password, next
        ], (err) =>
            if err
                log.error err
                log.error 'An error occured while unregistering your device.'
            else
                @config.removeRemoteCozy deviceName
                log.info 'Current device properly removed from remote cozy.'
            callback? err


    # Load ignore rules
    loadIgnore: ->
        try
            syncPath = @config.getDevice().path
            ignored = fs.readFileSync(path.join syncPath, '.cozyignore')
            ignored = ignored.toString().split('\n')
        catch error
            ignored = []
        @ignore = new Ignore(ignored).addDefaultRules()


    # Instanciate some objects before sync
    instanciate: ->
        @loadIgnore()
        @merge  = new Merge @pouch
        @prep   = new Prep @merge, @ignore
        @local  = @merge.local  = new Local  @config, @prep, @pouch, @events
        @remote = @merge.remote = new Remote @config, @prep, @pouch, @events
        @sync   = new Sync @pouch, @local, @remote, @ignore, @events


    # Start the synchronization
    startSync: (mode, callback) ->
        @config.setMode mode
        log.info 'Run first synchronisation...'
        @sync.start mode, (err) ->
            if err
                log.error err
                log.error err.stack if err.stack
            callback? err


    # Stop the synchronisation
    stopSync: (callback=->) ->
        @sync?.stop callback


    # Start database sync process and setup file change watcher
    synchronize: (mode, callback) =>
        @instanciate()
        conf = @config.getDevice()
        if conf.deviceName? and conf.url? and conf.path?
            @startSync mode, callback
        else
            log.error 'No configuration found, please run add-remote-cozy' +
                'command before running a synchronization.'
            callback? new Error 'No config'


    # Display a list of watchers for debugging purpose
    debugWatchers: ->
        @local?.watcher.debug()


    # Call the callback for each file
    walkFiles: (args, callback) ->
        @loadIgnore()
        options =
            root: @basePath
            directoryFilter: '!.cozy-desktop'
            entryType: 'both'
        readdirp options
            .on 'warn',  (err) -> log.warn err
            .on 'error', (err) -> log.error err
            .on 'data', (data) =>
                doc =
                    _id: data.path
                    docType: if data.stat.isFile() then 'file' else 'folder'
                if @ignore.isIgnored(doc) is args.ignored?
                    callback data.path


    # Recreate the local pouch database
    resetDatabase: (callback) =>
        @askConfirmation (err, ok) =>
            if err
                log.error err
            else if ok
                log.info "Recreates the local database..."
                @pouch.resetDatabase ->
                    log.info "Database recreated"
                    callback?()
            else
                log.info "Abort!"


    # Return the whole content of the database
    allDocs: (callback) =>
        @pouch.db.allDocs include_docs: true, callback


    # Return all docs for a given query
    query: (query, callback) =>
        @pouch.db.query query, include_docs: true, callback


    # Get useful information about the disk space
    # (total, used and left) on the remote Cozy
    getDiskSpace: (callback) =>
        {url, deviceName, password} = @config.getDevice
        device.getDiskSpace url, deviceName, password, callback


module.exports = App
