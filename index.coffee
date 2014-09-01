fs = require 'fs'
path = require 'path'
request = require 'request-json'
PouchDB = require 'pouchdb'
mkdirp = require 'mkdirp'
program = require 'commander'
read = require 'read'
touch = require 'touch'
mime = require 'mime'
process = require 'process'
uuid = require 'node-uuid'
log = require('printit')
    prefix: 'Data Proxy'

replication = require './replication'
config = require './config'
db = require './db'


getPassword = (callback) ->
    promptMsg = 'Please enter your password to register your device to ' + \
                'your remote Cozy: '
    read prompt: promptMsg, silent: true , callback


addRemote = (url, devicename, syncpath) ->
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
                    path: path.resolve syncpath
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


buildFSTree = (devicename, options) ->
    remoteConfig = config.config.remotes[devicename]
    filepath = options.filepath

    # Fetch folders and files only
    map = (doc) ->
        if doc.docType is 'Folder' or doc.docType is 'File'
            emit(doc._id, doc)

    db.db.query { map: map }, (err, res) ->
        for doc in res.rows
            if not filepath? or filepath is path.join doc.value.path, doc.value.name
                name = path.join remoteConfig.path, doc.value.path, doc.value.name
                if doc.value.docType is 'Folder'
                    # Create folder
                    mkdirp.sync name
                    fs.utimesSync name,
                        new Date(doc.value.creationDate),
                        new Date(doc.value.lastModification)
                else
                    # Create parent folder and touch file
                    mkdirp.sync path.join remoteConfig.path, doc.value.path
                    touch name
                    fs.utimesSync name,
                        new Date(doc.value.creationDate),
                        new Date(doc.value.lastModification)


fetchBinaries = (devicename, options) ->
    remoteConfig = config.config.remotes[devicename]
    filepath = options.filepath

    # Create files and directories in the FS
    buildFSTree devicename, { filepath: filepath }

    # Fetch only files
    map = (doc) ->
        if doc.docType is 'File'
            emit(doc._id, doc)

    db.db.query { map: map }, (err, res) ->
        # We need to authenticate as a device
        client = request.newClient remoteConfig.url
        client.setBasicAuth devicename, remoteConfig.devicePassword

        for doc in res.rows
            if not filepath? or filepath is path.join doc.value.path, doc.value.name
                filePath = path.join remoteConfig.path, doc.value.path, doc.value.name
                if doc.value.binary?
                    binaryUri = 'cozy/' + doc.value.binary.file.id + '/file'
                    # Fetch binary via CouchDB API
                    client.saveFile binaryUri, filePath, (err, res, body) ->
                        if err
                            console.log err

                        # Rebuild FS Tree to correct utime
                        buildFSTree devicename, { filepath: path.join doc.value.path, doc.value.name }


addFile = (devicename, filePath) ->
    remoteConfig = config.config.remotes[devicename]
    absolutePath = path.resolve filePath
    relativePath = absolutePath.replace remoteConfig.path, ''

    if relativePath is absolutePath
        console.log 'file is not in the sync dir'
        process.exit 1

    fileName = path.basename filePath
    if relativePath.split('/').length > 2
        parentPath = relativePath.replace '/' + fileName, ''
    else
        parentPath = ''

    fileStats = fs.statSync(filePath)
    lastModification = fileStats.mtime
    fileSize = fileStats.size

    mimeType = mime.lookup absolutePath
    fileId = uuid.v4().split('-').join('')
    binaryId = uuid.v4().split('-').join('')

    client = request.newClient remoteConfig.url
    client.setBasicAuth devicename, remoteConfig.devicePassword

    # Create binary document
    client.put 'cozy/'+ binaryId, { docType: 'Binary' }, (err, res, body) ->
        if res.statusCode isnt 201
            console.log err
        else
            # Upload binary
            client.putFile 'cozy/' + binaryId + '/file?rev='+ body.rev, absolutePath, {}, (err, res, body) ->
                if res.statusCode isnt 201
                    console.log err
                else
                    document =
                        binary:
                            file:
                                id: body.id
                                rev: body.rev
                        class: 'document'
                        creationDate: lastModification
                        docType: 'File'
                        lastModification: lastModification
                        mime: mimeType
                        name: fileName
                        path: parentPath
                        size: fileSize

                    db.db.put document, fileId, (err, res) ->
                        console.log err
                        console.log res

watchChanges = (devicename) ->
    remoteConfig = config.config.remotes[devicename]


runSync = (devicename) ->


displayConfig = ->
    console.log JSON.stringify config.config, null, 2


program
    .command('add-remote-cozy <url> <devicename> <syncpath>')
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
    .option('-f, --filepath [filepath]', 'specify file to build FS tree')
    .action buildFSTree

program
    .command('fetch-binaries <devicename> ')
    .description('Replicate DB binaries')
    .option('-f, --filepath [filepath]', 'specify file to fetch associated binary')
    .action fetchBinaries

program
    .command('add-file <devicename> <filePath>')
    .description('Add file descriptor to PouchDB')
    .action addFile

program
    .command('sync <devicename>')
    .description('Synchronize binaries')
    .action runSync

program
    .command('watch <devicename>')
    .description('Watch changes on FS')
    .action watchChanges

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
