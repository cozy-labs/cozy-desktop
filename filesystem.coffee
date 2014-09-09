fs       = require 'fs'
mkdirp   = require 'mkdirp'
touch    = require 'touch'
path     = require 'path'
uuid     = require 'node-uuid'
mime     = require 'mime'
chokidar = require 'chokidar'
log      = require('printit')
           prefix: 'Data Proxy | filesystem'

config   = require './config'
pouch    = require './db'
binary   = require './binary'

Promise  = require 'bluebird'
Promise.longStackTraces()
Promise.promisifyAll lib for lib in [fs, mkdirp, touch, pouch, binary]

# Promisify specific functions
mkdirpAsync = Promise.promisify mkdirp.mkdirp
touchAsync  = Promise.promisify touch

remoteConfig = config.getConfig()

module.exports =

    watchingLocked: false

    makeDirectoryFromDoc: (doc, callback) ->
        dirPaths = @getPaths(path.join remoteConfig.path, doc.path, doc.name)

        log.info "Creating directory: #{dirPaths.relative}"

        # Create directory
        mkdirpAsync(dirPaths.absolute)

        # Update directory information
        .then -> fs.utimesAsync dirPaths.absolute
                              , new Date(doc.creationDate)
                              , new Date(doc.lastModification)

        .then -> callback null

        .catch (err) ->
            log.error err.toString()
            console.error err
            callback err


    touchFileFromDoc: (doc, callback) ->
        filePaths = @getPaths(path.join remoteConfig.path, doc.path, doc.name)

        # Ensure parent directory exists
        mkdirpAsync(filePaths.absParent)

        # Get binary document from DB
        .then -> pouch.db.getAsync doc.binary.file.id
        .catch (err) ->
            return null if err.status is 404

        # Move binary if exists, otherwise touch the file
        .then (binaryDoc) ->
            if binaryDoc? and fs.existsSync binaryDoc.path
                # log.info "File exists: #{binaryDoc.path}"
                binary.moveFromDocAsync binaryDoc
                                      , filePaths.absolute
            else
                log.info "Creating file: #{filePaths.relative}"
                touchAsync filePaths.absolute

        # Update file information
        .then -> fs.utimesAsync filePaths.absolute
                              , new Date(doc.creationDate)
                              , new Date(doc.lastModification)

        .then -> callback null

        .catch (err) ->
            log.error err.toString()
            console.error err
            callback err


    buildTree: (filePath, callback) ->
        # If filePath argument is set, rebuild FS information for this file only
        if filePath?
            filePaths = @getPaths filePath
            log.info "Updating file info: #{filePaths.relative}"
        else
            filePaths = @getPaths remoteConfig.path
            log.info "Rebuilding filesystem tree"

        # Add folder filter if not exists
        pouch.addFilterAsync('folder').bind(@)

        # Query database
        .then -> pouch.db.queryAsync 'folder/all'

        # Filter interesting folder(s)
        .get('rows').filter (doc) ->
            return not filePath? \
                or (filePaths.name is doc.value.name \
                and filePaths.parent is doc.value.path)

        # Create folder(s)
        .each (doc) ->
            @makeDirectoryFromDocAsync doc.value

        .catch (err) ->
            throw err unless err.status is 404

        # Add file and binary filter if not exist
        .then -> pouch.addFilterAsync 'file'
        .then -> pouch.addFilterAsync 'binary'

        # Query database
        .then -> pouch.db.queryAsync 'file/all'

        # Filter interesting file(s)
        .get('rows').filter (doc) ->
            return not filePath? \
                or (filePaths.name is doc.value.name \
                and filePaths.parent is doc.value.path)

        # Create file(s)
        .each (doc) ->
            @touchFileFromDocAsync doc.value

        .catch (err) ->
            throw err unless err.status is 404

        .then -> callback null

        .catch (err) ->
            log.error err.toString()
            console.error err
            callback err


    createDirectoryContentDoc: (dirPath, callback) ->
        dirPaths = @getPaths dirPath

        log.info "Add directory and its content: #{dirPaths.relative}"

        # Create the directory itself first
        @createDirectoryDocAsync(dirPaths.absolute).bind(@)

        # List directory content
        .then -> fs.readdirAsync dirPaths.absolute

        .each (file) ->
            filePath = path.join dirPaths.absolute, file

            # Get stats
            fs.lstatAsync(filePath).bind(@)

            # Create directory or file document
            .then (stats) ->
                if stats.isDirectory()
                    @createDirectoryContentDocAsync filePath
                else if stats.isFile()
                    @createFileDocAsync filePath

        .then -> callback null
        .catch (err) ->
            log.error err.toString()
            console.error err
            callback err


    createDirectoryDoc: (dirPath, callback) ->
        dirPaths = @getPaths dirPath

        # Check directory's location
        unless @isInSyncDir(dirPath) and fs.existsSync(dirPaths.absolute)
            unless dirPath is '' or dirPath is remoteConfig.path
                log.error "Directory is not located in the 
                           synchronized directory: #{dirPaths.absolute}"
            return callback null


        # Initialize document Object
        document =
            _id: uuid.v4().split('-').join('')
            docType: 'Folder'
            name: dirPaths.name
            path: dirPaths.parent
            tags: []

        # Ensure parent directory is saved
        @createDirectoryDocAsync(dirPaths.absParent)

        # Add directory stats
        .then ->
            log.info "Add directory: #{dirPaths.relative}"
            fs.statAsync(dirPaths.absolute)
        .then (stats) ->
            document.creationDate     = stats.mtime
            document.lastModification = stats.mtime

            pouch.db.queryAsync 'folder/all'

        # Look for directory with the same path/name
        .get('rows').filter (doc) ->
            return doc.value.name is document.name \
               and doc.value.path is document.path

        # If exists, update document information
        .each (doc) ->
            document._id          = doc.value._id
            document._rev         = doc.value._rev
            document.creationDate = doc.value.creationDate
            document.tags         = doc.value.tags
            if new Date(doc.value.lastModification) \
             > new Date(document.lastModification)
                document.lastModification = doc.value.lastModification

        # Otherwise do not mind if directory doc is not found
        .catch (err) ->
            throw err unless err.status is 404

        # Create or update directory document
        .then -> pouch.db.putAsync document

        .then -> callback null

        .catch (err) ->
            log.error err.toString()
            console.error err
            callback err


    createFileDoc: (filePath, callback) ->
        filePaths = @getPaths filePath

        # Check file's location
        unless @isInSyncDir(filePath) and fs.existsSync(filePaths.absolute)
            log.error "File is not located in the 
                       synchronized directory: #{filePaths.absolute}"
            return callback null


        # Initialize document Object
        document =
            _id: uuid.v4().split('-').join('')
            docType: 'File'
            class: 'document'
            name: filePaths.name
            path: filePaths.parent
            mime: mime.lookup filePaths.name
            tags: []


        # Ensure parent directory is saved
        @createDirectoryDocAsync(filePaths.absParent)

        # Add file stats
        .then ->
            log.info "Add file: #{filePaths.relative}"
            fs.statAsync(filePaths.absolute)
        .then (stats) ->
            document.creationDate     = stats.mtime
            document.lastModification = stats.mtime
            document.size             = stats.size

            pouch.db.queryAsync 'file/all'

        # Look for file with the same path/name
        .get('rows').filter (doc) ->
            return doc.value.name is document.name \
               and doc.value.path is document.path

        # No document match
        .then (docs) ->
            throw status: 404 if docs.length is 0
            return docs[0].value

        # If exists, update document information
        .then (doc) ->
            document._id = doc._id
            document._rev = doc._rev
            document.creationDate = doc.creationDate
            document.tags = doc.tags
            document.binary = doc.binary

            if new Date(doc.lastModification) \
             > new Date(document.lastModification)
                document.lastModification = doc.lastModification

            # And get remote binary document
            binary.getRemoteDocAsync doc.binary.file.id

        # Otherwise do not mind if file doc is not found
        .catch (err) ->
            throw err unless err.status is 404

            # And create a remote binary document
            binary.createEmptyRemoteDocAsync()

        # Upload binary
        .then (doc) ->
            binary.uploadAsAttachmentAsync doc.id
                                         , doc.rev
                                         , filePaths.absolute

        # Update file document's information about binary
        .then (doc) ->
            document.binary =
                file:
                    id: doc.id
                    rev: doc.rev

            # And save binary location in a local document
            binary.saveLocationAsync filePaths.absolute
                                   , doc.id
                                   , doc.rev

        # Finally, create or update file document
        .then -> pouch.db.putAsync document

        .then -> callback null

        .catch (err) ->
            log.error err.toString()
            console.error err
            callback err


    watchChanges: (continuous, fromNow) ->
        fromNow ?= false
        continuous ?= fromNow

        # Use chokidar since the standard watch() function from
        # fs module has some issues.
        # More info on https://github.com/paulmillr/chokidar
        watcher = chokidar.watch remoteConfig.path,
            ignored: /[\/\\]\./
            persistent: continuous
            ignoreInitial: fromNow

        # New file detected
        .on 'add', (filePath) =>
            unless @watchingLocked
                log.info "File added: #{filePath}"
                @createFileDoc filePath, ->

        # New directory detected
        .on 'addDir', (dirPath) =>
            unless @watchingLocked
                if path isnt remoteConfig.path
                    log.info "Directory added: #{dirPath}"
                    @createDirectoryDoc dirPath, ->

        # File update detected
        .on 'change', (filePath) =>
            unless @watchingLocked
                log.info "File changed: #{filePath}"
                @createFileDoc filePath, ->

        .on 'error', (err) ->
            log.error 'An error occured when watching changes'
            console.error err


    getPaths: (filePath) ->
        # Assuming filePath is 'hello/world.html':
        absolute  = path.resolve filePath                      # /home/sync/hello/world.html
        relative  = path.relative remoteConfig.path, absolute  # hello/world.html
        name      = path.basename filePath                     # world.html
        parent    = path.dirname path.join path.sep, relative  # /hello
        absParent = path.dirname absolute                      # /home/sync/hello

        # Do not keep '/'
        parent    = '' if parent is '/'


        absolute: absolute
        relative: relative
        name: name
        parent: parent
        absParent: absParent


    isInSyncDir: (filePath) ->
        paths = @getPaths filePath
        return paths.relative isnt '' \
           and paths.relative.substring(0,2) isnt '..'


# Promisify above functions
Promise.promisifyAll module.exports
