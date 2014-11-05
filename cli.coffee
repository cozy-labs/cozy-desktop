#!/usr/bin/env coffee

path        = require 'path'
program     = require 'commander'
read        = require 'read'
process     = require 'process'
log         = require('printit')
              prefix: 'Data Proxy '

config      = require './backend/config'
replication = require './backend/replication'
filesystem  = require './backend/filesystem'
binary      = require './backend/binary'
pouch       = require './backend/db'


module.exports.getPassword = (callback) ->
    promptMsg = 'Please enter your password to register your device to ' + \
                'your remote Cozy: '
    read prompt: promptMsg, silent: true , callback


# Register current device to remote Cozy. Then it saves related informations
# to the config file.
module.exports.addRemote = addRemote = (url, deviceName, syncPath) ->
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

        replication.registerDevice options, saveConfig

    module.exports.getPassword register

# Unregister current device from remote Cozy. Then it removes remote from
# config file.
module.exports.removeRemote = removeRemote = (args) ->
    remoteConfig = config.getConfig()
    deviceName = args.deviceName or config.getDeviceName()

    saveConfig = (err) ->
        if err
            log.error err
            log.error 'An error occured while unregistering your device.'
        else
            config.removeRemoteCozy deviceName
            log.info 'Current device properly removed from remote cozy.'

    unregister = (err, password) ->
        options =
            url: remoteConfig.url
            deviceId: remoteConfig.deviceId
            password: password
        replication.unregisterDevice options, saveConfig

    module.exports.getPassword unregister


displayDatabase = ->
    db = require('./backend/db').db
    db.allDocs include_docs: true, (err, results) ->
        if err
            log.error err
        else
            results.rows.map (row) ->
                console.log row.doc


displayQuery = (query) ->
    db = require('./backend/db').db
    log.info "Query: #{query}"
    db.query query, (err, results) ->
        if err
            log.error err
        else
            results.rows.map (row) ->
                console.log "key: #{row.key}"
                console.log "value #{JSON.stringify row.value}"


displayConfig = ->
    console.log JSON.stringify config.config, null, 2


program
    .command('add-remote-cozy <url> <devicename> <syncPath>')
    .description('Configure current device to sync with given cozy')
    .option('-d, --deviceName [deviceName]', 'device name to deal with')
    .action addRemote

program
    .command('remove-remote-cozy')
    .description('Unsync current device with its remote cozy')
    .action removeRemote

program
    .command('sync')
    .description('Sync databases, apply and/or watch changes')
    .option('-d, --deviceName [deviceName]', 'device name to deal with')
    .option('-2, --two-way', 'apply local changes to remote as well as pulling changes')
    .option('-c, --catchup', 're-detect all the files locally (works only along --two-way)')
    .action (args) ->
        args.noBinary ?= false
        args['two-way'] ?= false
        args.catchup ?= false
        continuous = true
        rebuildFSTree = true
        fromNow = not args.catchup

        launchDaemons = ->
            # Watch local changes
            if args['two-way']
                filesystem.watchChanges continuous, fromNow

            # Replicate databases
            replication.runReplication
                fromRemote: args.fromRemote
                toRemote: args.toRemote
                continuous: true
                rebuildTree: true
                initial: not args['two-way']
                catchup: args.catchup
            , (err) ->
                log.info 'Sync ended'
                if err
                    log.error err
                    process.exit 1
                else
                    process.exit 0

        if not args['two-way']
            pouch.addAllFilters launchDaemons
        else
            launchDaemons()

program
    .command 'reset-database'
    .description 'Recreates the local database'
    .action ->
        log.info "Recreates the local database..."
        pouch.resetDatabase ->
            log.info "Database recreated"

program
    .command('display-database')
    .description('Display database content')
    .action displayDatabase

program
    .command('display-query <query>')
    .description('Display database query result')
    .action displayQuery

program
    .command('display-config')
    .description('Display device configuration and exit')
    .action displayConfig

program
    .command("*")
    .description("Display help message for an unknown command.")
    .action ->
        log.info 'Unknown command, run "cozy-monitor --help"' + \
                 ' to know the list of available commands.'

program.parse process.argv

unless process.argv.slice(2).length
    program.outputHelp()
