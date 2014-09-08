Promise = require 'bluebird'
fs = Promise.promisifyAll require('fs')
path = require 'path'
request = Promise.promisifyAll require('request-json')
mkdirp = Promise.promisifyAll require('mkdirp')
program = require 'commander'
read = require 'read'
touch = Promise.promisifyAll require('touch')
mime = require 'mime'
process = require 'process'
uuid = require 'node-uuid'
async = require 'async'
chokidar = require 'chokidar'
urlParser = require 'url'
log = require('printit')
    prefix: 'Data Proxy'

replication = Promise.promisifyAll require('./replication')
config = require './config'
db = Promise.promisifyAll require('./db').db
filesystem = require('./filesystem')
binary = require('./binary')


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


replicateFromRemote = (args) ->
    remoteConfig = config.getConfig()
    deviceName = args.deviceName or config.getDeviceName()

    options =
        filter: (doc) ->
            doc.docType is 'Folder' or doc.docType is 'File'

    url = urlParser.parse remoteConfig.url
    url.auth = deviceName + ':' + remoteConfig.devicePassword
    replication = db.replicate.from(urlParser.format(url) + 'cozy', options)
      .on 'change', (info) ->
          console.log info
      .on 'complete', (info) ->
          log.info 'Replication is complete'
      .on 'error', (err) ->
          log.error err


replicateToRemote = (args) ->
    remoteConfig = config.getConfig()
    deviceName = args.deviceName or config.getDeviceName()

    options =
        filter: (doc) ->
            doc.docType is 'Folder' or doc.docType is 'File'

    url = urlParser.parse remoteConfig.url
    url.auth = "#{deviceName}:#{remoteConfig.devicePassword}"
    replication = db.replicate.to(urlParser.format(url) + 'cozy', options)
      .on 'change', (info) ->
          console.log info
      .on 'complete', (info) ->
          log.info 'Replication is complete'
      .on 'error', (err) ->
          log.error err


runSync = (args) ->
    # Get config
    remoteConfig = config.getConfig()
    deviceName = args.deviceName or config.getDeviceName()

    watcher = chokidar.watch remoteConfig.path,
        ignored: /[\/\\]\./
        persistent: true
        ignoreInitial: not args.catchup?

    watcher
    .on 'add', (path) ->
        log.info "File added: #{path}"
        putFile deviceName, path, () ->
    .on 'addDir', (path) ->
        if path isnt remoteConfig.path
            log.info "Directory added: #{path}"
            putDirectory path, { deviceName: deviceName, recursive: false }, () ->
    .on 'change', (path) ->
        log.info "File changed: #{path}"
        putFile deviceName, path, () ->
    .on 'error', (err) ->
        log.error 'An error occured when watching changes'
        console.log err

    options =
        filter: (doc) ->
            doc.docType is 'Folder' or doc.docType is 'File'
        live: true

    url = urlParser.parse remoteConfig.url
    url.auth = deviceName + ':' + remoteConfig.devicePassword
    needTreeRebuild = false
    replication = db.sync(urlParser.format(url) + 'cozy', options)
      .on 'change', (info) ->
          if info.direction is 'pull'
              needTreeRebuild = true
          console.log info
      .on 'uptodate', (info) ->
          log.info 'Replication is complete, applying changes on the filesystem...'
          if needTreeRebuild
              if args.binary?
                  fetchBinaries deviceName, {}, () ->
                      needTreeRebuild = false
              else
                  buildFsTree deviceName, {}, () ->
                      needTreeRebuild = false
      .on 'error', (err) ->
          log.error err


watchLocalChanges = (args) ->
    # Get config
    remoteConfig = config.getConfig()
    deviceName = args.deviceName or config.getDeviceName()

    watcher = chokidar.watch remoteConfig.path,
        ignored: /[\/\\]\./
        persistent: true
        ignoreInitial: not args.catchup?

    watcher
    .on 'add', (path) ->
        log.info "File added: #{path}"
        putFile deviceName, path, () ->
    .on 'addDir', (path) ->
        if path isnt remoteConfig.path
            log.info "Directory added: #{path}"
            putDirectory deviceName, path, { deviceName: deviceName, recursive: false }, () ->
    .on 'change', (path) ->
        log.info "File changed: #{path}"
        putFile deviceName, path, () ->
    .on 'error', (err) ->
        log.error 'An error occured when watching changes'
        console.log err

    options =
        filter: (doc) ->
            doc.docType is 'Folder' or doc.docType is 'File'
        live: true

    url = urlParser.parse remoteConfig.url
    url.auth = deviceName + ':' + remoteConfig.devicePassword
    replication = db.replicate.to(urlParser.format(url) + 'cozy', options)
      .on 'change', (info) ->
          console.log info
      .on 'uptodate', (info) ->
          log.info 'Replication is complete'
      .on 'error', (err) ->
          log.error err


watchRemoteChanges = (args) ->
    # Get config
    remoteConfig = config.getConfig()
    deviceName = args.deviceName or config.getDeviceName()

    options =
        filter: (doc) ->
            doc.docType is 'Folder' or doc.docType is 'File'
        live: true

    url = urlParser.parse remoteConfig.url
    url.auth = deviceName + ':' + remoteConfig.devicePassword
    replication = db.replicate.from(urlParser.format(url) + 'cozy', options)
      .on 'change', (info) ->
          console.log info
      .on 'uptodate', (info) ->
          log.info 'Replication is complete, applying changes on the filesystem...'
          if args.binary?
              fetchBinaries deviceName, {}, () ->
          else
              buildFsTree deviceName, {}, () ->
      .on 'error', (err) ->
          log.error err


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
    .command('replicate-from-remote')
    .description('Replicate remote files/folders to local DB')
    .option('-d, --deviceName [deviceName]', 'device name to deal with')
    .action replicateFromRemote

program
    .command('replicate-to-remote')
    .description('Replicate local files/folders to remote DB')
    .option('-d, --deviceName [deviceName]', 'device name to deal with')
    .action replicateToRemote

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
    .command('watch-local')
    .description('Watch changes on the FS')
    .option('-d, --deviceName [deviceName]', 'device name to deal with')
    .option('-c, --catchup', 'catchup local changes')
    .action watchLocalChanges

program
    .command('watch-remote')
    .description('Watch changes on the remote DB')
    .option('-d, --deviceName [deviceName]', 'device name to deal with')
    .option('-b, --binary', 'automatically fetch binaries')
    .action watchRemoteChanges

program
    .command('sync')
    .description('Watch changes on the remote DB')
    .option('-d, --deviceName [deviceName]', 'device name to deal with')
    .option('-b, --binary', 'automatically fetch binaries')
    .option('-c, --catchup', 'catchup local changes')
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
