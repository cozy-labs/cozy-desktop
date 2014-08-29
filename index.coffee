fs = require 'fs'
request = require 'request-json-light'
PouchDB = require 'pouchdb'
mkdirp = require 'mkdirp'
program = require 'commander'
read = require 'read'
touch = require 'touch'
log = require('printit')
    prefix: 'Data Proxy'

replication = require './replication'
config = require './config'
db = require './db'


getPassword = (callback) ->
    promptMsg = 'Please enter your password to register your device to ' + \
                'your remote Cozy: '
    read prompt: promptMsg, silent: true , callback


addRemote = (url, devicename, path) ->
    getPassword (err, password) ->
        options =
            url: url
            deviceName: devicename
            password: password

        replication.registerDevice options, (err, credentials) ->
            if err
                log.error err
                log.error 'An error occured while registering your device.'
            else
                options =
                    url: url
                    deviceName: devicename
                    path: path
                    deviceId: credentials.id
                    devicePassword: credentials.password
                config.addRemoteCozy options
                log.info 'Remote Cozy properly configured to work ' + \
                         'with current device.'


removeRemote = (devicename) ->
    remoteConfig = config.config.remotes[devicename]

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
                config.removeRemoteCozy devicename
                log.info 'Current device properly removed from remote cozy.'


runReplication = (devicename) ->
    remoteConfig = config.config.remotes[devicename]

    options =
        filter: (doc) ->
            doc.docType is 'Folder' or doc.docType is 'File'

    urlParser = require 'url'
    url = urlParser.parse remoteConfig.url
    url.auth = devicename + ':' + remoteConfig.devicePassword
    replication = db.db.replicate.from(urlParser.format(url) + 'cozy', options)
      .on 'change', (info) ->
          console.log info
      .on 'complete', (info) ->
          log.info 'Replication is complete'
      .on 'error', (err) ->
          log.error err


buildFSTree = (devicename) ->
    remoteConfig = config.config.remotes[devicename]

    # Fetch folders and files only
    map = (doc) ->
        if doc.docType is 'Folder' or doc.docType is 'File'
            emit(doc._id, doc)

    db.db.query { map: map }, (err, res) ->
        for doc in res.rows
            if doc.value.docType is 'Folder'
                # Create folder
                mkdirp.sync remoteConfig.path + doc.value.path + '/' + doc.value.name
            else
                # Create parent folder and touch file
                mkdirp.sync remoteConfig.path + doc.value.path + '/'
                touch remoteConfig.path + doc.value.path + '/' + doc.value.name


fetchBinaries = (devicename) ->
    remoteConfig = config.config.remotes[devicename]

    # Create files and directories in the FS
    buildFSTree devicename

    # Fetch only files
    map = (doc) ->
        if doc.docType is 'File'
            emit(doc._id, doc)

    db.db.query { map: map }, (err, res) ->
        # We need to authenticate as a device
        client = request.newClient remoteConfig.url
        client.setBasicAuth devicename, remoteConfig.devicePassword

        for doc in res.rows
            # Fetch every binary
            filePath = remoteConfig.path + doc.value.path + '/' + doc.value.name
            if doc.value.binary?
                binaryUri = 'cozy/' + doc.value.binary.file.id + '/file'
                client.saveFile binaryUri, filePath, (err, res, body) ->
                    if err
                        console.log err


runSync = (devicename) ->


displayConfig = ->
    console.log JSON.stringify config.config, null, 2


program
    .command('add-remote-cozy <url> <devicename> <path>')
    .description('Configure current device to sync with given cozy')
    .action addRemote

program
    .command('remove-remote-cozy <devicename>')
    .description('Unsync current device with its remote cozy')
    .action removeRemote

program
    .command('replicate <devicename>')
    .description('Replicate DB documents')
    .action runReplication

program
    .command('build-tree <devicename>')
    .description('Create empty files and directories in the filesystem')
    .action buildFSTree

program
    .command('fetch-binaries <devicename>')
    .description('Replicate DB binaries')
    .action fetchBinaries

program
    .command('sync <devicename>')
    .description('Synchronize binaries')
    .action runSync

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
