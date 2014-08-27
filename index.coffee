PouchDB = require 'pouchdb'
program = require 'commander'
read = require 'read'
log = require('printit')
    prefix: 'Data Proxy'

replication = require './replication'
config = require './config'


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
    url.auth = remoteConfig.deviceId + ':' + remoteConfig.devicePassword
    replication = PouchDB.replicate(config.dbPath, remoteConfig.url + '/cozy', options)
      .on 'change', (info) ->
          console.log info
      .on 'complete', (info) ->
          log.info 'Replication is complete'
      .on 'error', (err) ->
          log.error err

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
    .description('Configure current device to sync with given cozy')
    .action runReplication

program
    .command('sync <devicename>')
    .description('Configure current device to sync with given cozy')
    .action runReplication

program
    .command('display-config')
    .description('Configure current device to sync with given cozy')
    .action displayConfig

program
    .command("*")
    .description("Display help message for an unknown command.")
    .action ->
        console.log 'Unknown command, run "cozy-monitor --help"' + \
        ' to know the list of available commands.'

program.parse process.argv
