path        = require 'path'
program     = require 'commander'
read        = require 'read'
process     = require 'process'
log         = require('printit')
              prefix: 'Data Proxy'

config      = require './config'
replication = require './replication'
filesystem  = require './filesystem'
binary      = require './binary'
pouch       = require './db'


getPassword = (callback) ->
    promptMsg = 'Please enter your password to register your device to ' + \
                'your remote Cozy: '
    read prompt: promptMsg, silent: true , callback


addRemote = (url, deviceName, syncPath) ->
    getPassword (err, password) ->
        options =
            url: url
            deviceName: deviceName
            password: password

        replication.registerDevice options, (err, credentials) ->
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


removeRemote = (args) ->
    remoteConfig = config.getConfig()
    deviceName = args.deviceName or config.getDeviceName()

    getPassword (err, password) ->
        options =
            url: remoteConfig.url
            deviceId: remoteConfig.deviceId
            password: password

        replication.unregisterDevice options, (err) ->
            if err
                log.error err
                log.error 'An error occured while unregistering your device.'
            else
                config.removeRemoteCozy deviceName
                log.info 'Current device properly removed from remote cozy.'


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
    .option('-i, --initial', 're-detect all the files')
    .option('-f, --fromRemote', 'replicate from remote database')
    .option('-t, --toRemote', 'replicate to remote database')
    .action (args) ->
        args.noBinary ?= false
        fetchBinary = not args.noBinary
        args.initial ?= false
        fromNow = not args.initial

        # Watch local changes
        if args.toRemote or (not args.toRemote and not args.fromRemote)
            filesystem.watchChanges true # Continuous
                                  , fromNow

        # Replicate databases
        replication.runReplication args.fromRemote
                                 , args.toRemote
                                 , true # Continuous
                                 , true # Rebuild FS tree
                                 , fetchBinary
                                 , ->


program
    .command('replicate')
    .description('Replicate file/folder database documents')
    .option('-d, --deviceName [deviceName]', 'device name to deal with')
    .option('-f, --fromRemote', 'replicate from remote database')
    .option('-t, --toRemote', 'replicate to remote database')
    .option('-c, --continuous', 'replicate to remote database')
    .action (args) ->
        replication.runReplication args.fromRemote
                                 , args.toRemote
                                 , args.continuous
                                 , false, false # Do not rebuild FS tree or fetch binary
                                 , ->

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
