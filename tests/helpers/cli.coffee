{options} = require './helpers'

cli = require '../../cli'
pouch = require '../../backend/db'
replication = require '../../backend/replication'
filesystem = require '../../backend/filesystem'

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
    @timeout 1500

    {url, syncPath} = options
    deviceName = 'tester'
    cli.addRemote url, deviceName, syncPath
    setTimeout done, 1000

# Removes the configuration
module.exports.cleanConfiguration = (done) ->
    @timeout 1500
    cli.removeRemote {}
    setTimeout done, 1000

# Replicates the remote Couch into the local Pouch and
# starts the sync process.
module.exports.startSync = (done) ->
    @timeout 5000

    pouch.addAllFilters ->

        replication.runReplication
            fromRemote: true
            toRemote: true
            initial: true
            catchup: false
            continuous: true
        , done

        filesystem.watchChanges true, true

        setTimeout done, 3000

module.exports.stopSync = ->
    replication.cancelReplication()

# Recreates the local database
module.exports.resetDatabase = (done) ->
    @timeout 10000
    setTimeout pouch.resetDatabase.bind(pouch, done), 5000
