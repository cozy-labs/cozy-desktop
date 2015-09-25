path = require 'path-extra'
fs = require 'fs-extra'
log = require('printit')
    prefix: 'Test - cli helpers'

helpers = require './helpers'

cli = require '../../cli'
pouch = require '../../backend/db'
config = require '../../backend/config'
replication = require '../../backend/db'
deviceManager = require '../../backend/device'
filesystem = require '../../backend/filesystem'
localEventWatcher  = require '../../backend/local_event_watcher'
remoteEventWatcher = require '../../backend/remote_event_watcher'

module.exports = cliHelpers = {}

# Skips user interaction to ask password
# @TODO: replace by a sinon's stub
module.exports.mockGetPassword = ->
    @trueGetPassword = cli.getPassword
    cli.getPassword = (callback) -> callback null, options.cozyPassword

# Restores regular behaviour
module.exports.restoreGetPassword = ->
    cli.getPassword = @trueGetPassword

module.exports.initSync = (done) ->
    @timeout 60000
    remoteEventWatcher.init done


# Configures a fake device for a fake remote Cozy
module.exports.initConfiguration = (done) ->
    init = ->
        saveConfig = (err, credentials) ->
            if err
                console.log err
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

                console.log "config.addRemoteCozy"
                config.addRemoteCozy device
                done()

        opts =
            url: helpers.options.url
            deviceName: helpers.options.deviceName
            password: helpers.options.cozyPassword

        console.log "deviceManager.registerDevice"
        deviceManager.registerDevice opts, saveConfig

    console.log "cliHelpers.cleanConfiguration"
    cliHelpers.cleanConfiguration init


# Removes the configuration
module.exports.cleanConfiguration = (done) ->
    opts = config.getConfig()

    saveConfig = (err) ->
        if err
            console.log err
        else
            console.log "config.removeRemoteCozy"
            config.removeRemoteCozy helpers.options.deviceName
        done()

    unregister = ->
        opts =
            url: helpers.options.url
            deviceId: helpers.options.deviceName
            password: helpers.options.cozyPassword
        console.log "deviceManager.unregisterDevice"
        deviceManager.unregisterDevice opts, saveConfig

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
