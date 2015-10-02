path = require 'path-extra'
fs = require 'fs-extra'
log = require('printit')
    prefix: 'Test - cli helpers'

helpers = require './helpers'

pouch = require '../../backend/db'
config = require '../../backend/config'
replication = require '../../backend/db'
deviceManager = require '../../backend/device'
filesystem = require '../../backend/filesystem'
localEventWatcher  = require '../../backend/local_event_watcher'
remoteEventWatcher = require '../../backend/remote_event_watcher'

module.exports = cliHelpers = {}

module.exports.initSync = (done) ->
    @timeout 60000
    remoteEventWatcher.init true, done

withTimeout = (timeout, fn, opts, callback) ->
    timer = setTimeout ->
        timer = null
        callback 'timeout'
    , timeout
    fn opts, (err, res) ->
        if timer
            clearTimeout timer
            callback err, res

# Configures a fake device for a fake remote Cozy
module.exports.initConfiguration = (done) ->
    init = ->
        saveConfig = (err, credentials) ->
            if err
                log.info err
                done()
            else
                device =
                    url: helpers.options.url
                    deviceName: helpers.options.deviceName
                    path: helpers.options.syncPath
                    deviceId: credentials.id
                    devicePassword: credentials.password
                # TODO deviceId and deviceName have been merged
                helpers.options.deviceId = credentials.id
                helpers.options.devicePassword = credentials.password

                config.addRemoteCozy device
                done()

        opts =
            url: helpers.options.url
            deviceName: helpers.options.deviceName
            password: helpers.options.cozyPassword

        withTimeout 5000, deviceManager.registerDevice, opts, saveConfig

    cliHelpers.cleanConfiguration init


# Removes the configuration
module.exports.cleanConfiguration = (done) ->
    opts = config.getConfig()

    saveConfig = (err) ->
        if err
            log.info err
        else
            config.removeRemoteCozy helpers.options.deviceName
        done()

    unregister = ->
        opts =
            url: helpers.options.url
            deviceId: helpers.options.deviceName
            password: helpers.options.cozyPassword
        withTimeout 5000, deviceManager.unregisterDevice, opts, saveConfig

    if opts.url?
        unregister()
    else
        done()


# Replicates the remote Couch into the local Pouch and
# starts the sync process.
module.exports.startSync = (done) ->
    opts = config.getConfig()

    if not (opts.deviceName? and opts.url? and opts.path?)
        log.error """
No configuration found, please run add-remote-cozy command before running
a synchronization.
"""
    else
        fs.ensureDir opts.path, ->
            # Watch local changes
            setTimeout ->
                localEventWatcher.start()
                done()
            , 1000

            pouch.addAllFilters ->
                # Replicate databases
                remoteEventWatcher.start()

module.exports.stopSync = ->
    localEventWatcher.watcher?.close()
    remoteEventWatcher.cancel()


# Recreates the local database
module.exports.resetDatabase = (done) ->
    @timeout 10000
    pouch.resetDatabase ->
        setTimeout done, 2000
