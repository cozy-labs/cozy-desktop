Promise  = require 'bluebird'
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
events = require 'events'


remoteConfig = config.getConfig()


changeHandler =  (task, callback) =>
    deviceName = config.getDeviceName()

    switch task.operation
        when 'put'
            if task.file?
                filesystem.createFileDoc task.file, callback
        when 'get'
            if task.file?
                binary.fetchOne deviceName, task.file, callback
            else
                binary.fetchAll deviceName, callback
        else
            # rebuild
            if task.file?
                filesystem.buildTree task.file, callback
            else
                filesystem.buildTree null, callback


filesystem =

    # Changes is the queue of operations, it contains
    # files that are being downloaded, and files to upload.
    changes: async.queue changeHandler, 1

    watchingLocked: false

    infoPublisher: new events.EventEmitter

    makeDirectoryFromDoc: (doc, callback) ->
        doc = doc.value
        absPath = path.join remoteConfig.path, doc.path, doc.name
        dirPaths = module.exports.getPaths absPath

        # Create directory
        updateDates = (err) =>
            if err
                callback err
            else
                module.exports.infoPublisher.emit 'directoryCreated', absPath

                # Update directory information
                creationDate = new Date(doc.creationDate)
                modificationDate = new Date(doc.lastModification)
                absPath = dirPaths.absolute
                fs.utimes absPath, creationDate, modificationDate, callback

        mkdirp dirPaths.absolute, updateDates


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
        touchFile = (err, binaryDoc) =>
            if err and err.status isnt 404
                callback err
            else
                # Move binary if exists, otherwise touch the file
                if binaryDoc? and fs.existsSync binaryDoc.path
                    binary.moveFromDoc binaryDoc, filePaths.absolute, changeUtimes
                else
                    module.exports.infoPublisher.emit 'fileTouched', absPath
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
            log.info "Updating file info: #{filePaths.relative}"
        else
            filePaths = @getPaths remoteConfig.path
            log.info "Rebuilding filesystem tree"

        makeFiles = (err, result) =>
            if err then callback err
            docs = result['rows']
            async.eachSeries docs, @touchFileFromDoc, callback

        getFiles = (err) =>
            if err
                callback err
            else
                #pouch.db.query 'file/all', makeFiles
                pouch.allFiles false, makeFiles

        createFileFilters = (err) =>
            if err then throw new Error err
            pouch.addFilter 'file', (err) =>
                if err
                    callback err
                else
                    pouch.addFilter 'binary', getFiles

        makeDirectories =  (err, result) =>
            if err then callback err
            docs = result['rows']
            async.eachSeries docs, @makeDirectoryFromDoc, createFileFilters

        getFolders = (err) =>
            if err
                callback err
            else
                #pouch.db.query 'folder/all', makeDirectories
                pouch.allFolders false, makeDirectories

        createFolderFilter = () ->
            pouch.addFilter 'folder', getFolders

        createFolderFilter()


    createDirectoryContentDoc: (dirPath, callback) ->
        dirPaths = @getPaths dirPath

        #log.info "Add directory and its content: #{dirPaths.relative}"
        log.info "Add directory and its content: #{dirPaths.relative}"

        # Create the directory itself first
        @createDirectoryDocAsync(dirPaths.absolute).bind(@)

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
                    @changes.push { operation: 'put', file: filePath }, ->

        .nodeify callback


    createDirectoryDoc: (dirPath, callback) ->
        dirPaths = @getPaths dirPath

        putDirectoryDocument = (newDoc) ->
            pouch.db.put newDoc, (err, res) ->
                if err
                    callback err
                else
                    callback null, res

        updateDirectoryInformation = (existingDoc, newDoc) ->
            newDoc._id = existingDoc._id
            newDoc._rev = existingDoc._rev
            newDoc.creationDate = existingDoc.creationDate
            newDoc.tags = existingDoc.tags
            if new Date(existingDoc.lastModification) \
             > new Date(newDoc.lastModification)
                newDoc.lastModification = existingDoc.lastModification
            return newDoc

        checkDirectoryExistence = (newDoc) ->
            pouch.allFolders false, (err, existingDocs) ->
                if err and err.status isnt 404
                    callback err
                else
                    if existingDocs
                        # Loop through existing directories
                        for existingDoc in existingDocs.rows
                            existingDoc = existingDoc.value
                            if  existingDoc.name is newDoc.name \
                            and existingDoc.path is newDoc.path
                                # Directory already exists
                                newDoc = updateDirectoryInformation existingDoc, newDoc

                    # Create or update directory document
                    putDirectoryDocument newDoc

        updateDirectoryStats = (newDoc) ->
            fs.stat dirPaths.absolute, (err, stats) ->
                newDoc.creationDate = stats.mtime
                newDoc.lastModification = stats.mtime

                checkDirectoryExistence newDoc

        createParentDirectory = (newDoc) =>
            @createDirectoryDoc dirPaths.absParent, (err, res) ->
                if err
                    log.error "An error occured at parent directory's creation"
                    callback err
                else
                    log.info "Add directory: #{dirPaths.relative}"
                    updateDirectoryStats newDoc

        checkDirectoryLocation = () =>
            if not @isInSyncDir(dirPath) or not fs.existsSync(dirPaths.absolute)
               unless dirPath is '' or dirPath is remoteConfig.path
                   log.error "Directory is not located in the
                              synchronized directory: #{dirPaths.absolute}"
                # Do not throw error
                callback null
            else
                createParentDirectory
                    _id: uuid.v4().split('-').join('')
                    docType: 'Folder'
                    name: dirPaths.name
                    path: dirPaths.parent
                    tags: []

        checkDirectoryLocation()


    createFileDoc: (filePath, callback) ->
        filePaths = @getPaths filePath

        putFileDocument = (newDoc) ->

            # Finally, update local file document
            pouch.db.put newDoc, (err, res) ->
                if err
                    callback err
                else
                    callback null, res

        saveBinaryDocument = (newDoc) ->

            # Save location and checksum locally to
            # facilitate further operations
            binary.saveLocation filePaths.absolute
                                , newDoc.binary.file.id
                                , newDoc.binary.file.rev
                                , (err, doc) ->
                if err
                    callback err
                else
                    newDoc.binary.file.checksum = doc.checksum
                    putFileDocument newDoc


        uploadBinary = (newDoc, binaryDoc) ->
            binary.uploadAsAttachment binaryDoc.id
                                    , binaryDoc.rev
                                    , filePaths.absolute
                                    , (err, newBinaryDoc) ->
                if err
                    callback err
                else
                    newDoc.binary =
                        file:
                            id: newBinaryDoc.id
                            rev: newBinaryDoc.rev

                    saveBinaryDocument newDoc

        updateFileInformation = (existingDoc, newDoc) ->

            # Fullfill document information
            newDoc._id = existingDoc._id
            newDoc._rev = existingDoc._rev
            newDoc.creationDate = existingDoc.creationDate
            newDoc.tags = existingDoc.tags
            newDoc.binary = existingDoc.binary
            if new Date(existingDoc.lastModification) \
             > new Date(newDoc.lastModification)
                newDoc.lastModification = existingDoc.lastModification
            return newDoc

        populateBinaryInformation = (newDoc) ->
            if newDoc.binary?
                # Get the ID and the revision of the remote binary document
                # (since binary documents are not synchronized with the local
                # pouchDB)
                binary.getRemoteDoc newDoc.binary.file.id, (err, binaryDoc) ->
                    uploadBinary newDoc, binaryDoc
            else
                # If binary does not exist remotely yet, we have to
                # create an empty binary document remotely to have
                # an ID and a revision
                binary.createEmptyRemoteDoc (err, binaryDoc) ->
                    uploadBinary newDoc, binaryDoc

        checkBinaryExistence = (newDoc) ->
            # Check if the binary doc exists, using its checksum
            # It would mean that binary is already uploaded
            binary.docAlreadyExists filePaths.absolute, (err, doc) ->
                if err
                    callback err
                else if doc
                    # Binary document exists
                    newDoc.binary =
                        file:
                            id: doc._id
                            rev: doc._rev
                    saveBinaryDocument newDoc
                else
                    populateBinaryInformation newDoc

        checkFileExistence = (newDoc) ->

            # Get the existing file (if exists) to prefill
            # document with its information
            pouch.allFiles false, (err, existingDocs) ->
                if err and err.status isnt 404
                    callback err
                else
                    if existingDocs
                        # Loop through existing files
                        for existingDoc in existingDocs.rows
                            existingDoc = existingDoc.value
                            if  existingDoc.name is newDoc.name \
                            and existingDoc.path is newDoc.path
                                # File already exists
                                newDoc = updateFileInformation existingDoc, newDoc

                    checkBinaryExistence newDoc

        updateFileStats = (newDoc) ->

            # Update size and dates using the value of the FS
            fs.stat filePaths.absolute, (err, stats) ->
                newDoc.creationDate = stats.mtime
                newDoc.lastModification = stats.mtime
                newDoc.size = stats.size

                checkFileExistence newDoc

        createParentDirectory = (newDoc) =>
            @createDirectoryDoc filePaths.absParent, (err, res) ->
                if err
                    log.error "An error occured at parent directory's creation"
                    callback err
                else
                    updateFileStats newDoc

        checkFileLocation = () =>
            if not @isInSyncDir(filePath) or not fs.existsSync(filePaths.absolute)
               unless filePath is '' or filePath is remoteConfig.path
                   log.error "File is not located in the
                              synchronized directory: #{filePaths.absolute}"
                # Do not throw error
                callback null
            else
                # We pass the new document through every local functions
                createParentDirectory
                    _id: uuid.v4().split('-').join('')
                    docType: 'File'
                    class: 'document'
                    name: filePaths.name
                    path: filePaths.parent
                    mime: mime.lookup filePaths.name
                    tags: []

        checkFileLocation()


    deleteDoc: (filePath, callback) ->
        filePaths = @getPaths filePath

        removeDoc = (id, rev) ->

            # Remove the document locally
            # (as in couchDB, it keeps a _deleted version of the doc)
            pouch.db.remove id, rev, (err, res) ->
                if err
                    callback err
                else
                    callback null, res

        markAsDeleted = (deletedDoc) ->

            # Use the same pethod as in DS:
            # https://github.com/cozy/cozy-data-system/blob/master/server/lib/db_remove_helper.coffee#L7
            emptyDoc =
                _id: deletedDoc._id
                _rev: deletedDoc._rev
                _deleted: true
                docType: deletedDoc.docType

            # Since we use the same function to delete a file and a folder
            # we have to check if the binary key exists
            if deletedDoc.binary?
                emptyDoc.binary = deletedDoc.binary

            pouch.db.put emptyDoc, (err, res) ->
                if err
                    callback err
                else
                    removeDoc res.id, res.rev

        getDoc = (deletedFileName, deletedFilePath) ->

            # We want to search through files and folders
            pouch.db.allDocs { include_docs: true }, (err, existingDocs) ->
                if err and err.status isnt 404
                    callback err
                else
                    if existingDocs
                        # Loop through existing documents
                        for existingDoc in existingDocs.rows
                            existingDoc = existingDoc.doc
                            if  existingDoc.name is deletedFileName \
                            and existingDoc.path is deletedFilePath
                                # Only one of them should show up,
                                # but delete all of them anyway
                                markAsDeleted existingDoc

        getDoc filePaths.name, filePaths.parent


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
            if not @watchingLocked and not filesBeingCopied[filePath]?
                log.info "File added: #{filePath}"
                fileIsCopied filePath, =>
                    @changes.push { operation: 'put', file: filePath }, ->

        # New directory detected
        .on 'addDir', (dirPath) =>
            if not @watchingLocked
                if dirPath isnt remoteConfig.path
                    #log.info "Directory added: #{dirPath}"
                    log.info "Directory added: #{dirPath}"
                    @createDirectoryDoc dirPath, ->

        # File deletion detected
        .on 'unlink', (filePath) =>
            log.info "File deleted: #{filePath}"
            @changes.push { operation: 'delete', file: filePath }, ->

        # Folder deletion detected
        .on 'unlinkDir', (dirPath) =>
            log.info "Folder deleted: #{dirPath}"
            @changes.push { operation: 'delete', file: dirPath }, ->

        # File update detected
        .on 'change', (filePath) =>
            if not @watchingLocked and not filesBeingCopied[filePath]?
                log.info "File changed: #{filePath}"
                fileIsCopied filePath, =>
                    @changes.push { operation: 'put', file: filePath }, ->

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


    deleteAll: (dirPath, callback) ->
        del = require 'del'
        del "#{dirPath}/*", force: true, callback

    isInSyncDir: (filePath) ->
        paths = @getPaths filePath
        return paths.relative isnt '' \
           and paths.relative.substring(0,2) isnt '..'


module.exports = filesystem
