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


addRemote = (url, devicename, syncPath) ->
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
                    path: path.resolve syncPath
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


buildFsTree = (devicename, options, callback) ->
    # Fix callback
    if not callback?
        callback = () ->

    # Get config
    remoteConfig = config.config.remotes[devicename]
    filePath = options.filePath

    # Fetch folders and files only
    db.db.query { map: (doc) ->

        if doc.docType is 'Folder' or doc.docType is 'File'
            emit doc._id, doc

    }, (err, res) ->
        for doc in res.rows
            if not filePath? or filePath is path.join doc.value.path, doc.value.name
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
        return callback err, res


fetchBinaries = (devicename, options, callback) ->
    # Fix callback
    if not callback?
        callback = () ->

    # Get config
    remoteConfig = config.config.remotes[devicename]
    filePath = options.filePath

    # Initialize remote HTTP client
    client = request.newClient remoteConfig.url
    client.setBasicAuth devicename, remoteConfig.devicePassword

    # Create files and directories in the FS
    buildFsTree devicename, { filePath: filePath }, (err, res) ->

        # Fetch only files
        db.db.query { map: (doc) ->

            if doc.docType is 'File'
                emit doc._id, doc

        }, (err, res) ->
            for doc in res.rows
                doc = doc.value
                if not filePath? or filePath is path.join doc.path, doc.name
                    filePath = path.join remoteConfig.path, doc.path, doc.name
                    if doc.binary?
                        binaryUri = "cozy/#{doc.binary.file.id}/file"
                        # Fetch binary via CouchDB API
                        client.saveFile binaryUri, filePath, (err, res, body) ->
                            if err
                                console.log err

                            # Rebuild FS Tree to correct utime
                            buildFsTree devicename, { filePath: path.join doc.path, doc.name }, callback


putDirectory = (devicename, directoryPath, recursive, callback) ->
    # Fix callback
    if not callback?
        callback = () ->

    # Get config
    remoteConfig = config.config.remotes[devicename]

    # Get dir name
    dirName = path.basename directoryPath

    # Find directory's parent directory
    absolutePath = path.resolve directoryPath
    relativePath = absolutePath.replace remoteConfig.path, ''
    if relativePath is absolutePath
        log.error "Directory is not located on the synchronized directory: #{dirPath}"
        callback
    if relativePath.split('/').length > 2
        dirPath = relativePath.replace "/#{dirName}", ''
    else
        dirPath = ''

    # Get size and modification time
    stats = fs.statSync(absolutePath)
    dirLastModification = stats.mtime

    # Lookup for existing directory
    db.db.query { map: (doc) ->

        if doc.docType is 'Folder'
            emit doc._id, doc

    }, (err, res) ->
        for doc in res.rows
            doc = doc.value
            if doc.path is dirPath and doc.name is dirName
                log.info "Directory already exists: #{doc.path}/#{doc.name}"
                if recursive
                    return putSubFiles callback
                else
                    return callback err, res

        log.info "Creating directory doc: #{dirPath}/#{dirName}"
        newId = uuid.v4().split('-').join('')
        document =
            creationDate: dirLastModification
            docType: 'Folder'
            lastModification: dirLastModification
            name: dirName
            path: dirPath
            tags: []

        db.db.put document, newId, (err, res) ->
            if recursive
                return putSubFiles callback
            else
                return callback err, res

    putSubFiles = (callback) ->
        # List files in directory
        fs.readdir absolutePath, (err, res) ->
            for file in res
                fileName = "#{absolutePath}/#{file}"
                # Upload file if it is a file
                if fs.lstatSync(fileName).isFile()
                    putFile devicename, fileName, callback(err, res)
                # Upload directory recursively if it is a directory
                else if fs.lstatSync(fileName).isDirectory()
                    putDirectory devicename, fileName, recursive, callback(err, res)
            if res.length is 0
                log.info "No file to upload in: #{relativePath}"
                callback err, res


putFile = (devicename, filePath, callback) ->
    # Fix callback
    if not callback?
        callback = () ->

    # Get config
    remoteConfig = config.config.remotes[devicename]

    # Initialize remote HTTP client
    client = request.newClient remoteConfig.url
    client.setBasicAuth devicename, remoteConfig.devicePassword

    # Get file name
    fileName = path.basename filePath

    # Find file's parent directory
    absolutePath = path.resolve filePath
    relativePath = absolutePath.replace remoteConfig.path, ''
    if relativePath is absolutePath
        log.error "File is not located on the synchronized directory: #{filePath}"
        return callback
    if relativePath.split('/').length > 2
        filePath = relativePath.replace "/#{fileName}", ''
    else
        filePath = ''

    # Lookup MIME type
    fileMimeType = mime.lookup absolutePath

    # Get size and modification time
    stats = fs.statSync absolutePath
    fileLastModification = stats.mtime
    fileSize = stats.size

    # Ensure that directory exists
    putDirectory devicename, ".#{filePath}", false, (err, res) ->

        # Fetch only files with the same path/filename
        db.db.query { map: (doc) ->

            if doc.docType is 'File'
                emit doc._id, doc

        }, (err, res) ->
            for doc in res.rows
                doc = doc.value
                if doc.name is fileName and doc.path is filePath
                    existingFileId    = doc._id
                    existingFileRev   = doc._rev
                    existingBinaryId  = doc.binary.file.id
                    if new Date(doc.lastModification) >= new Date(fileLastModification)
                        log.info "Unchanged file: #{doc.path}/#{doc.name}"
                        return callback err, res

            if existingBinaryId?
                # Fetch last revision from remote
                client.get "cozy/#{existingBinaryId}", (err, res, body) ->
                    if res.statusCode isnt 200
                        log.error "#{body.error}: #{body.reason}"
                    else
                        return uploadBinary body.id, body.rev, absolutePath, putFileDoc
            else
                # Create the doc and get revision
                newBinaryId = uuid.v4().split('-').join('')
                client.put "cozy/#{newBinaryId}", { docType: 'Binary' }, (err, res, body) ->
                    if res.statusCode isnt 201
                        log.error "#{body.error}: #{body.reason}"
                    else
                        return uploadBinary body.id, body.rev, absolutePath, putFileDoc

            uploadBinary = (id, rev, absolutePath, callback) ->
                log.info "Uploading binary: #{absolutePath}"
                client.putFile "cozy/#{id}/file?rev=#{rev}", absolutePath, {}, (err, res, body) ->
                    if res.statusCode isnt 201
                        log.error "#{body.error}: #{body.reason}"
                    else
                        body = JSON.parse body
                        return callback existingFileId, existingFileRev, body.id, body.rev

            putFileDoc = (id, rev, binaryId, binaryRev, callback) ->
                doc =
                    binary:
                        file:
                            id: binaryId
                            rev: binaryRev
                    class: 'document'
                    creationDate: fileLastModification
                    docType: 'File'
                    lastModification: fileLastModification
                    mime: fileMimeType
                    name: fileName
                    path: filePath
                    size: fileSize
                    tags: []

                if id?
                    log.info "Updating file doc: #{absolutePath}"
                    db.db.put doc, id, rev, (err, res) ->
                        if err
                            console.log err
                        return

                else
                    newId = uuid.v4().split('-').join('')
                    log.info "Creating file doc: #{absolutePath}"
                    db.db.put doc, newId, (err, res) ->
                        if err
                            console.log err
                        return


watchChanges = (devicename) ->
    remoteConfig = config.config.remotes[devicename]


runSync = (devicename) ->
    remoteConfig = config.config.remotes[devicename]

    options =
        filter: (doc) ->
            doc.docType is 'Folder' or doc.docType is 'File'

    urlParser = require 'url'
    url = urlParser.parse remoteConfig.url
    url.auth = "#{devicename}:#{remoteConfig.devicePassword}"
    replication = db.db.replicate.to(urlParser.format(url) + 'cozy', options)
      .on 'change', (info) ->
          console.log info
      .on 'complete', (info) ->
          log.info 'Replication is complete'
      .on 'error', (err) ->
          log.error err


displayConfig = ->
    console.log JSON.stringify config.config, null, 2


program
    .command('add-remote-cozy <url> <devicename> <syncPath>')
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
    .option('-f, --filePath [filePath]', 'specify file to build FS tree')
    .action buildFsTree

program
    .command('fetch-binaries <devicename> ')
    .description('Replicate DB binaries')
    .option('-f, --filePath [filePath]', 'specify file to fetch associated binary')
    .action fetchBinaries

program
    .command('put-file <devicename> <filePath>')
    .description('Add file descriptor to PouchDB')
    .action putFile

program
    .command('put-dir <devicename> <dirPath>')
    .description('Add folder descriptor to PouchDB')
    .option('-r, --recursive', 'add every file/folder inside')
    .action putDirectory

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
