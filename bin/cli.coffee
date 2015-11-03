#!/usr/bin/env coffee

read    = require 'read'
program = require 'commander'

pkg = require '../package.json'
App = require '../backend/app'
app = new App process.env.DEFAULT_DIR

# Helper to get cozy password from user
app.askPassword = (callback) ->
    promptMsg = """
Please enter your password to register your device to 'your remote Cozy:
"""
    read prompt: promptMsg, silent: true , (err, password, isDefault) ->
        callback err, password


# TODO make devicename optional, and use `hostname` for the default
program
    .command 'add-remote-cozy <url> <devicename> <syncPath>'
    .description 'Configure current device to sync with given cozy'
    .action app.addRemote

program
    .command 'remove-remote-cozy'
    .description 'Unsync current device with its remote cozy'
    .option '-d, --deviceName [deviceName]', 'device name to deal with'
    .action (args) ->
        app.removeRemote args.deviceName

program
    .command 'sync'
    .description 'Sync databases, apply and/or watch changes'
    # FIXME readonly is the only supported mode for the moment
    # .option('-r, --readonly',
    #        'only apply remote changes to local folder')
    .option('-f, --force',
            'Run sync from the beginning of all the Cozy changes.')
    .option('-k, --insecure',
            'Turn off HTTPS certificate verification.')
    .action (args) ->
        if app.config.setInsecure args.insecure?
            app.sync 'readonly'
        else
            console.log 'Your configuration file seems invalid.'
            console.log 'Have you added a remote cozy?'
            process.exit 1

program
    .command 'reset-database'
    .description 'Recreates the local database'
    .action app.resetDatabase
    # TODO ask confirmation

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
