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
async = require 'async'

remoteConfig = config.getConfig()


module.exports =

    watchingLocked: false


    makeDirectoryFromDoc: (doc, callback) ->
        doc = doc.value
        absPath = path.join remoteConfig.path, doc.path, doc.name
        dirPaths = module.exports.getPaths absPath

        #log.info "Creating directory: #{dirPaths.relative}"
        console.log "Creating directory: #{dirPaths.relative}"

        # Create directory
        mkdirp dirPaths.absolute, (err) ->
            if err
                callback err
            else
                # Update directory information
                creationDate = new Date(doc.creationDate)
                modificationDate = new Date(doc.lastModification)
                absPath = dirPaths.absolute
                fs.utimes absPath, creationDate, modificationDate, callback


    touchFileFromDoc: (doc, callback) ->
        doc = doc.value
        absPath = path.join remoteConfig.path, doc.path, doc.name
        filePaths = module.exports.getPaths absPath

        # Update file information
        changeUtimes = (err) ->
            creationDate = new Date(doc.creationDate)
            modificationDate = new Date(doc.lastModification)
            absPath = filePaths.absolute
            fs.utimes absPath, creationDate, modificationDate, ->
                callback()

        # Create empty file
        touchFile = (err, binaryDoc) ->
            if err and err.status isnt 404
                callback err
            else
                # Move binary if exists, otherwise touch the file
                if binaryDoc? and fs.existsSync binaryDoc.path
                    # log.info "File exists: #{binaryDoc.path}"
                    console.log "File exists: #{binaryDoc.path}"
                    binary.moveFromDoc binaryDoc, filePaths.absolute, changeUtimes
                else
                    #log.info "Creating file: #{filePaths.relative}"
                    console.log "Creating file: #{filePaths.relative}"
                    touch filePaths.absolute, changeUtimes

        # Get binary metadata
        getBinary = (err) ->
            if err
                callback err
            else
                pouch.db.get doc.binary.file.id, touchFile

        # Ensure parent directory exists
        mkdirp filePaths.absParent, getBinary


    buildTree: (filePath, callback) ->

        # If filePath argument is set, rebuild FS information for this file only
        if filePath?
            filePaths = @getPaths filePath
            #log.info "Updating file info: #{filePaths.relative}"
            console.log "Updating file info: #{filePaths.relative}"
        else
            filePaths = @getPaths remoteConfig.path
            #log.info "Rebuilding filesystem tree"
            console.log "Rebuilding filesystem tree"

        makeFiles = (err, result) =>
            if err then throw new Error err
            docs = result['rows']
            async.eachSeries docs, @touchFileFromDoc, callback

        getFiles = (err) =>
            if err then throw new Error err
            pouch.db.query 'file/all', makeFiles

        createFilters = (err) =>
            if err then throw new Error err
            pouch.addFilter 'file', (err) =>
                if err
                    callback err
                else
                   pouch.addFilter 'binary', getFiles

        makeDirectories =  (err, result) =>
            if err then throw new Error err
            docs = result['rows']
            async.eachSeries docs, @makeDirectoryFromDoc, createFilters

        getFolders = (err) =>
            if err then throw new Error err
            pouch.db.query 'folder/all', makeDirectories

        pouch.addFilter 'folder', getFolders


    createDirectoryContentDoc: (dirPath, callback) ->
        dirPaths = @getPaths dirPath

        #log.info "Add directory and its content: #{dirPaths.relative}"
        console.log "Add directory and its content: #{dirPaths.relative}"

        # Create the directory itself first
        @createDirectoryDoc(dirPaths.absolute).bind(@)

        # List directory content
        .then -> fs.readdir dirPaths.absolute

        .each (file) ->
            filePath = path.join dirPaths.absolute, file

            # Get stats
            fs.lstat(filePath).bind(@)

            # Create directory or file document
            .then (stats) ->
                if stats.isDirectory()
                    @createDirectoryContentDoc filePath
                else if stats.isFile()
                    @createFileDoc filePath

        .nodeify callback


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
        @createDirectoryDoc(dirPaths.absParent)

        # Add directory stats
        .then ->
            #log.info "Add directory: #{dirPaths.relative}"
            console.log "Add directory: #{dirPaths.relative}"
            fs.stat(dirPaths.absolute)
        .then (stats) ->
            document.creationDate = stats.mtime
            document.lastModification = stats.mtime

            pouch.db.query 'folder/all'

        # Look for directory with the same path/name
        .get('rows').filter (doc) ->
            return doc.value.name is document.name \
               and doc.value.path is document.path

        # If exists, update document information
        .each (doc) ->
            document._id = doc.value._id
            document._rev = doc.value._rev
            document.creationDate = doc.value.creationDate
            document.tags = doc.value.tags
            if new Date(doc.value.lastModification) \
             > new Date(document.lastModification)
                document.lastModification = doc.value.lastModification

        # Otherwise do not mind if directory doc is not found
        .catch (err) ->
            throw err unless err.status is 404

        # Create or update directory document
        .then -> pouch.db.put document

        .nodeify callback


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
        @createDirectoryDoc(filePaths.absParent).bind(@)

        # Add file stats
        .then ->
            #log.info "Add file: #{filePaths.relative}"
            console.log "Add file: #{filePaths.relative}"
            fs.stat(filePaths.absolute)
        .then (stats) ->
            document.creationDate     = stats.mtime
            document.lastModification = stats.mtime
            document.size             = stats.size

            pouch.db.query 'file/all'

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
            binary.getRemoteDoc doc.binary.file.id

        # Otherwise do not mind if file doc is not found
        .catch (err) ->
            throw err unless err.status is 404

            # And create a remote binary document
            binary.createEmptyRemoteDoc()

        # Upload binary
        .then (doc) ->
            binary.uploadAsAttachment doc.id
                                         , doc.rev
                                         , filePaths.absolute

        # Update file document's information about binary
        .then (doc) ->
            document.binary =
                file:
                    id: doc.id
                    rev: doc.rev

            # And save binary location in a local document
            binary.saveLocation filePaths.absolute
                                   , doc.id
                                   , doc.rev

        # Finally, create or update file document
        .then -> pouch.db.put document

        .nodeify callback


    watchChanges: (continuous, fromNow) ->
        fromNow ?= false
        continuous ?= fromNow

        filesBeingCopied = {}

        # Function to check if file is being copied
        # to avoid chokidar to detect file multiple times
        fileIsCopied = (filePath, callback) ->
            unless filePath in filesBeingCopied
                filesBeingCopied[filePath] = true
            getSize = (filePath, callback) ->
                fs.stat filePath, (err, stats) ->
                    callback err, stats.size

            # Check if the size of the file has changed during
            # the last second
            getSize filePath, (err, earlySize) ->
                setTimeout () ->
                    getSize filePath, (err, lateSize) ->
                        if earlySize is lateSize
                            delete filesBeingCopied[filePath]
                            callback()
                        else
                            fileIsCopied filePath, callback
                , 1000

        # Use chokidar since the standard watch() function from
        # fs module has some issues.
        # More info on https://github.com/paulmillr/chokidar
        watcher = chokidar.watch remoteConfig.path,
            ignored: /[\/\\]\./
            persistent: continuous
            ignoreInitial: fromNow

        # New file detected
        .on 'add', (filePath) =>
            unless @watchingLocked or filePath in filesBeingCopied
                log.info "File added: #{filePath}"
                fileIsCopied filePath, =>
                    @previousUpload = @previousUpload.then =>
                        @createFileDoc filePath, ->

        # New directory detected
        .on 'addDir', (dirPath) =>
            unless @watchingLocked
                if path isnt remoteConfig.path
                    #log.info "Directory added: #{dirPath}"
                    console.log "Directory added: #{dirPath}"
                    @createDirectoryDoc dirPath, ->

        # File update detected
        .on 'change', (filePath) =>
            unless @watchingLocked or filePath in filesBeingCopied
                log.info "File changed: #{filePath}"
                fileIsCopied filePath, =>
                    @previousUpload = @previousUpload.then =>
                        @createFileDoc filePath, ->

        .on 'error', (err) ->
            log.error 'An error occured while watching changes:'
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
