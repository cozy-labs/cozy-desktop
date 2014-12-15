helpers = require './helpers'

cli = require '../../cli'
pouch = require '../../backend/db'
config = require '../../backend/config'
replication = require '../../backend/db'
deviceManager = require '../../backend/device'
filesystem = require '../../backend/filesystem'
localEventWatcher  = require '../../backend/localEventWatcher'
remoteEventWatcher = require '../../backend/remoteEventWatcher'
path = require 'path-extra'
fs = require 'fs-extra'

module.exports = cliHelpers = {}

# Skips user interaction to ask password
# @TODO: replace by a sinon's stub
module.exports.mockGetPassword = ->
    @trueGetPassword = cli.getPassword
    cli.getPassword = (callback) -> callback null, options.cozyPassword

# Restores regular behaviour
module.exports.restoreGetPassword = ->
    cli.getPassword = @trueGetPassword


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
                helpers.options.deviceId = credentials.id
                helpers.options.devicePassword = credentials.password

                config.addRemoteCozy device
                done()

        opts =
            url: helpers.options.url
            deviceName: helpers.options.deviceName
            password: helpers.options.cozyPassword

        deviceManager.registerDevice opts, saveConfig

    opts = config.getConfig()
    if opts.url?
        cliHelpers.cleanConfiguration init
    else
        init()


# Removes the configuration
module.exports.cleanConfiguration = (done) ->
    opts = config.getConfig()

    saveConfig = (err) ->
        if err
            console.log err
        else
            #config.removeRemoteCozy helpers.options.deviceName
            done()

    unregister = (err, password) ->
        opts =
            url: helpers.options.url
            deviceId: opts.deviceId
            password: helpers.options.cozyPassword
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
            , 1000

            pouch.addAllFilters ->
                # Replicate databases
                remoteEventWatcher.start()

    done()

module.exports.stopSync = ->
    replication.cancelReplication()


# Recreates the local database
module.exports.resetDatabase = (done) ->
    @timeout 10000
    pouch.resetDatabase ->
        setTimeout done, 2000
