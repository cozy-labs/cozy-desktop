{exec, spawn} = require 'child_process'
mkdirp = require 'mkdirp'
{options} = require './helpers'

cli = require '../../cli'

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
    @timeout 5500

    {url, syncPath} = options
    deviceName = 'tester'
    cli.addRemote url, deviceName, syncPath
    setTimeout done, 5000

# Removes the configuration
module.exports.cleanConfiguration = (done) ->
    @timeout 5500
    cli.removeRemote {}
    setTimeout done, 5000

# Creates the sync folder
module.exports.prepareSyncFolder = -> mkdirp.sync options.syncPath

# Removes the sync folder
module.exports.cleanSyncFolder = (done) ->
    command = "rm -rf #{options.syncPath}"
    exec command, {}, (err, stderr, stdout) -> done()

# Starts the sync process
module.exports.startSync = ->
    @syncProcess = spawn 'coffee', ['cli.coffee', 'sync'], {}
    @syncProcess.stdout.on 'data', (data) -> console.log "data: #{data}"
    @syncProcess.stderr.on 'data', (data) -> console.log "error: #{data}"
    @syncProcess.on 'close', -> console.log 'process closed'

# Stops the sync process
module.exports.stopSync = -> @syncProcess.kill()

# replicates the remote Couch into the local Pouch
module.exports.initialReplication = (done) ->
    replication = require '../../backend/replication'
    replication.runReplication
        fromRemote: true
        toRemote: false
        continuous: false
        rebuildTree: true
        fetchBinary: true
    , done
