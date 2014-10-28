#!/usr/bin/env coffee

path        = require 'path'
program     = require 'commander'
read        = require 'read'
process     = require 'process'
log         = require('printit')
              prefix: 'Data Proxy'

config      = require './backend/config'
replication = require './backend/replication'
filesystem  = require './backend/filesystem'
binary      = require './backend/binary'
pouch       = require './backend/db'


getPassword = (callback) ->
    promptMsg = 'Please enter your password to register your device to ' + \
                'your remote Cozy: '
    read prompt: promptMsg, silent: true , callback


# Register current device to remote Cozy. Then it saves related informations
# to the config file.
addRemote = (url, deviceName, syncPath) ->
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

    getPassword register

# Unregister current device from remote Cozy. Then it removes remote from
# config file.
removeRemote = (args) ->
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

    getPassword unregister


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
    .option('-n, --noBinary', 'ignore binary fetching')
    .option('-i, --initial', 're-download all missing files')
    .option('-c, --catchup', 're-detect all the files')
    .option('-f, --fromRemote', 'replicate from remote database')
    .option('-t, --toRemote', 'replicate to remote database')
    .action (args) ->
        args.noBinary ?= false
        args.initial ?= false
        args.catchup ?= false
        continuous = true
        rebuildFSTree = true
        fetchBinary = not args.noBinary
        fromNow = not args.initial

        # Watch local changes
        if args.toRemote or (not args.toRemote and not args.fromRemote)
            filesystem.watchChanges continuous, fromNow

        # Replicate databases
        replication.runReplication
            fromRemote: args.fromRemote
            toRemote: args.toRemote
            continuous: true
            rebuildTree: true
            fetchBinary: fetchBinary
            initial: args.initial
            catchup: args.catchup
        , (err) ->
            log.info 'Sync ended'
            if err
                log.error err
                process.exit 1
            else
                process.exit 0

program
    .command('replicate')
    .description('Replicate file/folder database documents')
    .option('-d, --deviceName [deviceName]', 'device name to deal with')
    .option('-f, --fromRemote', 'replicate from remote database')
    .option('-t, --toRemote', 'replicate to remote database')
    .option('-c, --continuous', 'keep sync alive when finished')
    .action (args) ->
        replication.runReplication
            fromRemote: args.fromRemote
            toRemote: args.toRemote
            continuous: args.continuous
            rebuildTree: true
            fetchBinary: true
        , (err) ->
            log.info 'Replication ended'
            if err
                log.error 'An error occured while replicating data and files'
                log.error err
                process.exit 1
            else
                process.exit 0

program
    .command('show-binaries')
    .description('Show local binary DB documents (debug function)')
    .action () ->
        pouch.db.query 'binary/all', (err, res) ->
            console.log doc.value.path for doc in res.rows

program
    .command('build-tree')
    .description('Create empty files and directories in the filesystem')
    .option('-d, --deviceName [deviceName]', 'device name to deal with')
    .option('-f, --filePath [filePath]', 'specify file to build FS tree')
    .action (args) ->
        filesystem.buildTree args.filePath, () ->

program
    .command('fetch-binary')
    .description('Replicate DB binaries')
    .option('-d, --deviceName [deviceName]', 'device name to deal with')
    .option('-f, --filePath [filePath]', 'specify file to fetch associated binary')
    .action (args) ->
        if args.filePath?
            binary.fetchOne args.deviceName, args.filePath, () ->
        else
            binary.fetchAll args.deviceName, () ->

program
    .command('put-file <filePath>')
    .description('Add file descriptor to PouchDB')
    .option('-d, --deviceName [deviceName]', 'device name to deal with')
    .action (filePath, args) ->
        filesystem.createFileDoc filePath, ->

program
    .command('put-dir <dirPath>')
    .description('Add folder descriptor to PouchDB')
    .option('-d, --deviceName [deviceName]', 'device name to deal with')
    .option('-r, --recursive', 'add every file/folder inside')
    .action (dirPath, args) ->
        if args.recursive?
            filesystem.createDirectoryContentDoc dirPath, ->
        else
            filesystem.createDirectoryDoc dirPath, ->

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
        console.log 'Unknown command, run "cozy-monitor --help"' + \
                    ' to know the list of available commands.'

program.parse process.argv

unless process.argv.slice(2).length
    program.outputHelp()
