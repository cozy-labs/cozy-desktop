#!/usr/bin/env coffee

read     = require 'read'
path     = require 'path'
program  = require 'commander'
Progress = require 'progress'

pkg = require '../../package.json'
App = require '../app'
app = new App process.env.COZY_DESKTOP_DIR
log = global.console

exit = ->
    log.log 'Exiting...'
    setTimeout process.exit, 2000
    app.stopSync ->
        process.exit()

process.on 'SIGINT',  exit
process.on 'SIGTERM', exit
process.on 'SIGUSR1', ->
    app.debugWatchers()

# Helper to get cozy password from user
app.askPassword = (callback) ->
    promptMsg = """
Please enter your password to register your device on your remote Cozy:
"""
    read prompt: promptMsg, silent: true , (err, password) ->
        callback err, password

# Helper for confirmation
app.askConfirmation = (callback) ->
    promptMsg = 'Are your sure? [Y/N]'
    read prompt: promptMsg, (err, response) ->
        callback err, response.toUpperCase() is 'Y'

sync = (mode, args) ->
    log.log "Cozy-desktop v#{pkg.version} started (PID: #{process.pid})"
    if args.logfile?
        app.writeLogsTo args.logfile
    if app.config.setInsecure args.insecure?
        app.events.on 'up-to-date', ->
            log.log 'Your cozy is up to date!'
        app.events.on 'transfer-started', (info) ->
            what = if info.way is 'up' then 'Uploading' else 'Downloading'
            filename = path.basename info.path
            format = "#{what} #{filename} [:bar] :percent :etas"
            options =
                total: info.size
                width: 30
            bar = new Progress format, options
            app.events.on info.eventName, (data) ->
                if data.finished
                    app.events.removeAllListeners info.eventName
                else
                    bar.tick data.length
        app.synchronize mode, (err) ->
            process.exit 1 if err
    else
        log.log 'Your configuration file seems invalid.'
        log.log 'Have you added a remote cozy?'
        process.exit 1


program
    .command 'add-remote-cozy <url> <localSyncPath>'
    .description 'Configure current device to sync with given cozy'
    .option '-d, --deviceName [deviceName]', 'device name to deal with'
    .action (url, syncPath, args) ->
        app.addRemote url, syncPath, args.deviceName

program
    .command 'remove-remote-cozy'
    .description 'Unsync current device with its remote cozy'
    .option '-d, --deviceName [deviceName]', 'device name to deal with'
    .action (args) ->
        app.removeRemote args.deviceName

program
    .command 'sync'
    .description 'Synchronize the local filesystem and the remote cozy'
    .option('-k, --insecure', 'Turn off HTTPS certificate verification.')
    .option('-l, --logfile [logfile]', 'Write logs to this file')
    .action (args) ->
        try
            sync 'full', args
        catch err
            throw err unless err.message is 'Incompatible mode'
            log.log """
            Full sync from a mount point already used otherwise is not supported

            You should create a new mount point and use COZY_DESKTOP_DIR.
            The README has more instructions about that.
            """

program
    .command 'pull'
    .description 'Pull files & folders from a remote cozy to local filesystem'
    .option('-k, --insecure', 'Turn off HTTPS certificate verification.')
    .option('-l, --logfile [logfile]', 'Write logs to this file')
    .action (args) ->
        try
            sync 'pull', args
        catch err
            throw err unless err.message is 'Incompatible mode'
            log.log """
            Pulling from a mount point already used for pushing is not supported

            You should create a new mount point and use COZY_DESKTOP_DIR.
            The README has more instructions about that.
            """

program
    .command 'push'
    .description 'Push files & folders from local filesystem to the remote cozy'
    .option('-k, --insecure', 'Turn off HTTPS certificate verification.')
    .option('-l, --logfile [logfile]', 'Write logs to this file')
    .action (args) ->
        try
            sync 'push', args
        catch err
            log.log """
            Pushing from a mount point already used for pulling is not supported

            You should create a new mount point and use COZY_DESKTOP_DIR.
            The README has more instructions about that.
            """

program
    .command 'ls'
    .description 'List local files that are synchronized with the remote cozy'
    .option('-i, --ignored', 'List ignored files')
    .action (args) ->
        app.walkFiles args, (file) ->
            log.log file

program
    .command 'reset-database'
    .description 'Recreates the local database'
    .action app.resetDatabase

program
    .command 'display-database'
    .description 'Display database content'
    .action ->
        app.allDocs (err, results) ->
            unless err
                for row in results.rows
                    log.log row.doc

program
    .command 'display-query <query>'
    .description 'Display database query result'
    .action (query) ->
        app.query query, (err, results) ->
            unless err
                for row in results.rows
                    log.log row.doc

program
    .command 'display-config'
    .description 'Display device configuration and exit'
    .action ->
        log.log JSON.stringify app.config.devices, null, 2

program
    .command 'show-disk-space'
    .description 'Show disk space usage for the cozy'
    .action ->
        app.getDiskSpace (err, res) ->
            if err
                console.log 'Error:', err
            else
                space = res.diskSpace
                console.log "Used:  #{space.usedDiskSpace} #{space.usedUnit}b"
                console.log "Free:  #{space.freeDiskSpace} #{space.freeUnit}b"
                console.log "Total: #{space.totalDiskSpace} #{space.totalUnit}b"

program
    .command "*"
    .description "Display help message for an unknown command."
    .action ->
        log.log 'Unknown command, run "cozy-desktop --help"' +
                 ' to know the list of available commands.'

program
    .version pkg.version


program.parse process.argv
if process.argv.length <= 2
    program.outputHelp()
