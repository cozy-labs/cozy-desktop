fs   = require 'fs-extra'
path = require 'path-extra'
log  = require('printit')
    prefix: 'Cozy Desktop  '

filesystem = require '../backend/filesystem'
pouch = require '../backend/db'
device = require '../backend/device'
localEventWatcher = require '../backend/local_event_watcher'
remoteEventWatcher = require '../backend/remote_event_watcher'


# App is the entry point for the CLI and GUI.
# They both can do actions and be notified by events via an App instance.
#
# basePath is the directory where the config and pouch are saved
App = (basePath) ->
    @lang = 'fr'
    @basePath = basePath or path.homedir()
    @config = require '../backend/config'
    # TODO @config.init @basePath


# This method is here to be surcharged by the UI to ask its password to the user
#
# callback is a function that takes two parameters: error and password
App::askPassword = (callback) ->
    callback 'Not implemented', null


# Register current device to remote Cozy and then save related informations
# to the config file
App::addRemote = (url, deviceName, syncPath) =>
    saveConfig = (err, credentials) ->
        if err
            log.error err
            log.error 'An error occured while registering your device.'
        else
            options =
                url: url
                deviceName: deviceName
                path: path.resolve syncPath
                deviceId: credentials.id
                devicePassword: credentials.password

            config.addRemoteCozy options
            log.info 'Remote Cozy properly configured to work ' + \
                     'with current device.'

    register = (err, password) ->
        options =
            url: url
            deviceName: deviceName
            password: password

        device.registerDevice options, saveConfig

    @askPassword register


# Unregister current device from remote Cozy and then remove remote from
# the config file
App::removeRemote = (deviceName) =>
    remoteConfig = @config.getConfig()
    deviceName = deviceName or @config.getDeviceName()

    saveConfig = (err) ->
        if err
            log.error err
            log.error 'An error occured while unregistering your device.'
        else
            @config.removeRemoteCozy deviceName
            log.info 'Current device properly removed from remote cozy.'

    unregister = (err, password) ->
        options =
            url: remoteConfig.url
            deviceId: remoteConfig.deviceId
            password: password
        device.unregisterDevice options, saveConfig

    @askPassword unregister


# Start database sync process and setup file change watcher.
App::sync = (mode) =>
    syncToDesktop = true
    switch mode
        when 'readonly' then toDesktop = false
        else
            log.error "Unknown mode for sync: #{mode}"
            return

    config = @config.getConfig()

    if config.deviceName? and config.url? and config.path?
        fs.ensureDir config.path, ->
            pouch.addAllFilters ->
                remoteEventWatcher.init args.readonly, ->
                    log.info "Init done"
                    remoteEventWatcher.start ->
                        if syncToDesktop
                            localEventWatcher.start()
    else
        log.error 'No configuration found, please run add-remote-cozy' + \
            'command before running a synchronization.'


# Recreate the local pouch database
App::resetDatabase = (callback) ->
    log.info "Recreates the local database..."
    pouch.resetDatabase ->
        log.info "Database recreated"
        callback?()


# Return the whole content of the database
App::allDocs = (callback) ->
    pouch.db.allDocs include_docs: true, (err, results) ->
        log.info err if err
        callback err, results


# Return all docs for a given query
App::query = (query, callback) ->
    log.info "Query: #{query}"
    pouch.db.query query, (err, results) ->
        log.error err if err
        callback err, results


# Get useful information about the disk space
# (total, used and left) on the remote Cozy
App::getDiskSpace = (callback) =>
    remoteConfig = @config.getConfig()
    options =
        url:      remoteConfig.url
        user:     remoteConfig.deviceName
        password: remoteConfig.devicePassword
    device.getDiskSpace options, callback


module.exports = App
