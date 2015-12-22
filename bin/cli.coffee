#!/usr/bin/env coffee

read    = require 'read'
program = require 'commander'

pkg = require '../package.json'
App = require '../backend/app'
app = new App process.env.COZY_DESKTOP_DIR

exit = ->
    console.log 'Exiting...'
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
    console.log "Cozy-desktop v#{pkg.version} started (PID: #{process.pid})"
    if app.config.setInsecure args.insecure?
        app.synchronize mode, (err) ->
            process.exit 1 if err
    else
        console.log 'Your configuration file seems invalid.'
        console.log 'Have you added a remote cozy?'
        process.exit 1


program
    .command 'add-remote-cozy <url> <syncPath>'
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
    .option('-k, --insecure',
            'Turn off HTTPS certificate verification.')
    .action (args) ->
        try
            sync 'full', args
        catch err
            throw err unless err.message is 'Incompatible mode'
            console.log """
            Full sync from a mount point already used otherwise is not supported

            You should create a new mount point and use COZY_DESKTOP_DIR.
            The README has more instructions about that.
            """

program
    .command 'pull'
    .description 'Pull files & folders from a remote cozy to local filesystem'
    .option('-k, --insecure',
            'Turn off HTTPS certificate verification.')
    .action (args) ->
        try
            sync 'pull', args
        catch err
            throw err unless err.message is 'Incompatible mode'
            console.log """
            Pulling from a mount point already used for pushing is not supported

            You should create a new mount point and use COZY_DESKTOP_DIR.
            The README has more instructions about that.
            """

program
    .command 'push'
    .description 'Push files & folders from local filesystem to the remote cozy'
    .option('-k, --insecure',
            'Turn off HTTPS certificate verification.')
    .action (args) ->
        try
            sync 'push', args
        catch err
            console.log """
            Pushing from a mount point already used for pulling is not supported

            You should create a new mount point and use COZY_DESKTOP_DIR.
            The README has more instructions about that.
            """

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
                    console.log row.doc

program
    .command 'display-query <query>'
    .description 'Display database query result'
    .action (query) ->
        app.query query, (err, results) ->
            unless err
                for row in results.rows
                    console.log row.doc

program
    .command 'display-config'
    .description 'Display device configuration and exit'
    .action ->
        console.log JSON.stringify app.config.devices, null, 2

program
    .command "*"
    .description "Display help message for an unknown command."
    .action ->
        console.log 'Unknown command, run "cozy-desktop --help"' +
                 ' to know the list of available commands.'

program
    .version pkg.version


program.parse process.argv
if process.argv.length <= 2
    program.outputHelp()
