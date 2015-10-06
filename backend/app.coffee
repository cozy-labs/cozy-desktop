EventEmitter = require('events').EventEmitter
fs    = require 'fs-extra'
path  = require 'path-extra'
async = require 'async'
log   = require('printit')
    prefix: 'Cozy Desktop  '

Config  = require './config'
Devices = require './devices'
pouch   = require './pouch'
local   = require './local'
remote  = require './remote'
progress = require './progress'


# App is the entry point for the CLI and GUI.
# They both can do actions and be notified by events via an App instance.
#
# basePath is the directory where the config and pouch are saved
class App
    constructor: (basePath) ->
        @lang = 'fr'
        @basePath = basePath or path.homedir()
        @config = new Config @basePath
        @events = new EventEmitter

    # This method is here to be surcharged by the UI
    # to ask its password to the user
    #
    # callback is a function that takes two parameters: error and password
    askPassword: (callback) ->
        callback 'Not implemented', null


    # Register current device to remote Cozy and then save related informations
    # to the config file
    #
    # TODO validation of url, deviceName and syncPath
    addRemote: (url, deviceName, syncPath) =>
        async.waterfall [
            @askPassword,

            (password, next) ->
                options =
                    url: url
                    deviceName: deviceName
                    password: password
                Devices.registerDevice options, next

        ], (err, credentials) =>
            if err
                log.error err
                log.error 'An error occured while registering your device.'
            else
                options =
                    url: url
                    deviceName: deviceName
                    path: path.resolve syncPath
                    deviceId: credentials.id
                    password: credentials.password
                @config.addRemoteCozy options
                log.info 'The remote Cozy has properly been configured ' +
                    'to work with current device.'


    # Unregister current device from remote Cozy and then remove remote from
    # the config file
    removeRemote: (deviceName) =>
        device = @config.getDevice deviceName

        async.waterfall [
            @askPassword,

            (password, next) ->
                options =
                    url: device.url
                    deviceId: device.deviceId
                    password: password
                Devices.unregisterDevice options, next

        ], (err) =>
            if err
                log.error err
                log.error 'An error occured while unregistering your device.'
            else
                @config.removeRemoteCozy deviceName
                log.info 'Current device properly removed from remote cozy.'


    # Start database sync process and setup file change watcher
    sync: (mode) =>
        syncToCozy = true
        switch mode
            when 'readonly' then syncToCozy = false
            else
                log.error "Unknown mode for sync: #{mode}"
                return

        device  = @config.getDevice()
        queue   = require './operation_queue'
        @local  = new Local  @config, queue, @events
        @remote = new Remote @config, queue, @events

        progress.events = @events
        queue.events = @events

        if device.deviceName? and device.url? and device.path?
            # TODO async, error handling
            # TODO what order for initial sync (performance wise)?
            pouch.addAllFilters ->
                log.info 'Run first synchronisation...'
                @local.start (err) ->
                    process.exit(1) if err
                    @remote.start (err) ->
                        process.exit(1) if err
                        seq = "TODO"
                        log.info "First replication is complete (last seq: #{seq})"
                        events.emit 'firstSyncDone'
                        log.info 'Start building your filesystem on your device.'
                        queue.makeFSSimilarToDB syncToCozy, (err) ->
                            process.exit(1) if err
                            log.info 'Filesystem built on your device.'
                            publisher.emit 'firstSyncDone'
        else
            log.error 'No configuration found, please run add-remote-cozy' +
                'command before running a synchronization.'


    # Recreate the local pouch database
    resetDatabase: (callback) ->
        log.info "Recreates the local database..."
        pouch.resetDatabase ->
            log.info "Database recreated"
            callback?()


    # Return the whole content of the database
    allDocs: (callback) ->
        pouch.db.allDocs include_docs: true, (err, results) ->
            log.error err if err
            callback err, results


    # Return all docs for a given query
    query: (query, callback) ->
        log.info "Query: #{query}"
        pouch.db.query query, (err, results) ->
            log.error err if err
            callback err, results


    # Get useful information about the disk space
    # (total, used and left) on the remote Cozy
    getDiskSpace: (callback) =>
        device = @config.getDevice
        Devices.getDiskSpace device, callback


module.exports = App
