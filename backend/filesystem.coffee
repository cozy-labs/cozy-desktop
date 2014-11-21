fs       = require 'fs-extra'
mkdirp   = require 'mkdirp'
touch    = require 'touch'
path     = require 'path'
uuid     = require 'node-uuid'
mime     = require 'mime'
chokidar = require 'chokidar'
rimraf   = require 'rimraf'
log      = require('printit')
    prefix: 'Filesystem '

config = require './config'
pouch = require './db'
binary = require './binary'
publisher = require './publisher'
async = require 'async'
events = require 'events'


remoteConfig = config.getConfig()


# Execute the right instruction on the DB or on the filesystem depending
# on the task operation.
applyOperation = (task, callback) ->
    blockingOperations = [
        'get'
        'delete'
        'catchup'
        'reDownload'
        'applyFolderDBChanges'
        'applyFileDBChanges'
        'deleteFolder'
        'deleteFile'
        'newFolder'
        'newFile'
        'moveFile'
        'moveFolder'
    ]

    if task.operation in blockingOperations
        filesystem.watchingLocked = true
        callbackOrig = callback
        callback = (err, res) ->
            filesystem.watchingLocked = false
            callbackOrig err, res

    switch task.operation
        when 'post'
            if task.file?
                filesystem.createFileDoc task.file, true, callback
        when 'put'
            if task.file?
                filesystem.createFileDoc task.file, false, callback
        when 'newFolder'
            if task.doc?
                filesystem.makeDirectoryFromDoc task.doc, callback
        when 'newFile'
            if task.doc?
                deviceName = config.getDeviceName()
                binary.fetchFromDoc deviceName, task.doc, callback
        when 'moveFolder'
            if task.doc?
                filesystem.moveEntryFromDoc task.doc, callback
        when 'moveFile'
            if task.doc?
                filesystem.moveEntryFromDoc task.doc, callback
        when 'deleteFile'
            if task.doc?
                filesystem.removeDeletedFile task.doc._id, task.doc._rev, callback
        when 'deleteFolder'
            if task.doc?
                filesystem.removeDeletedFolder task.doc._id, task.doc._rev, callback
        when 'deleteDoc'
            if task.file?
                filesystem.deleteDoc task.file, callback
        when 'catchup'
            filesystem.applyFileDBChanges true, callback
        when 'reDownload'
            filesystem.applyFileDBChanges false, callback
        when 'applyFileDBChanges'
            filesystem.applyFileDBChanges false, callback
        when 'applyFolderDBChanges'
            filesystem.applyFolderDBChanges callback
        else
            log.error 'Task with a wrong operation for the change queue.'
            callback()



filesystem =


    # Ensure that given file is located in the Cozy dir.
    isInSyncDir: (filePath) ->
        paths = @getPaths filePath
        return paths.relative isnt '' \
           and paths.relative.substring(0,2) isnt '..'


    # Delete all file for a given path.
    deleteAll: (dirPath, callback) ->
        del = require 'del'
        del "#{dirPath}/*", force: true, callback


    # Build usefule path from a given path.
    # (absolute, relative, filename, parent path, and parent absolute path).
    getPaths: (filePath) ->
        remoteConfig = config.getConfig()

        # Assuming filePath is 'hello/world.html':
        absolute  = path.resolve filePath # /home/sync/hello/world.html
        relative = path.relative remoteConfig.path, absolute # hello/world.html
        name = path.basename filePath # world.html
        parent = path.dirname path.join path.sep, relative # /hello
        absParent = path.dirname absolute # /home/sync/hello

        # Do not keep '/'
        parent = '' if parent is '/'

        {absolute, relative, name, parent, absParent}


    # Create a folder from database data.
    makeDirectoryFromDoc: (doc, callback) ->
        remoteConfig = config.getConfig()
        doc = doc.value if not doc.path?
        if doc? and doc.path? and doc.name?
            absPath = path.join remoteConfig.path, doc.path, doc.name
            dirPaths = filesystem.getPaths absPath

            mkdirp dirPaths.absolute, (err) ->
                if err
                    callback err
                else
                    log.info "Directory ensured: #{absPath}"
                    publisher.emit 'directoryEnsured', absPath

                    creationDate = new Date doc.creationDate
                    modificationDate = new Date doc.lastModification
                    absPath = dirPaths.absolute
                    fs.utimes absPath, creationDate, modificationDate, callback

        else
            callback()


    # Changes is the queue of operations, it contains
    # files that are being downloaded, and files to upload.
    changes: async.queue applyOperation, 1


    # Move a folder or a folder to a new location. The target is the path of
    # the current doc. The source is the path of the previous revision of
    # the doc.
    # TODO write test for this function
    # TODO handle date modification
    moveEntryFromDoc: (doc, callback) ->
        pouch.getPreviousRev doc._id, (err, previousDocRev) ->
            if err
                log.error 'Cannot find previous revision'
                log.error doc
                callback err
            else
                newPath = path.join remoteConfig.path, doc.path, doc.name
                previousPath = path.join(
                    remoteConfig.path,
                    previousDocRev.path,
                    previousDocRev.name
                )
                isExistPrevious = fs.existsSync previousPath
                isExistNew = fs.existsSync newPath
                isMoved = newPath isnt previousPath

                if isMoved and isExistPrevious and not isExistNew
                    fs.move previousPath, newPath, (err) ->
                        if err
                            log.error err
                        log.info "Entry moved: #{previousPath} -> #{newPath}"

                        if doc.docType is 'Folder'
                            publisher.emit 'folderMoved', {previousPath, newPath}
                        else
                            publisher.emit 'fileMoved', {previousPath, newPath}

                        callback()

                # That case only happens with folder. It occurs when a
                # subfolder was moved before its parents. So parent target
                # is created before the parent is moved.
                else if isMoved and isExistPrevious and isExistNew
                    task =
                        operation: 'deleteFolder'
                        id: doc._id
                        rev: doc._rev
                    filesystem.changes.push task, (err) ->
                        log.error err if err
                    callback()
                else
                    callback()


    # Get old revision of deleted doc to get path info then remove it from file
    # system.
    # TODO add test
    removeDeletedFolder: (id, rev, callback) ->
        pouch.getPreviousRev id, (err, doc) ->
            if err
                callback err
            else
                folderPath = path.join remoteConfig.path, doc.path, doc.name
                fs.remove folderPath, (err) ->
                    if err
                        callback err
                    else
                        log.info "Folder deleted: #{folderPath}"
                        publisher.emit 'folderDeleted', folderPath
                        callback()


    # Delete file require the related binary id, not the file object id.
    # This function removes from the disk given binary.
    removeDeletedFile: (id, rev, callback) ->
        pouch.getPreviousRev id, (err, doc) ->
            if err
                callback err if callback?
            else if doc.path? and doc.name?
                filePath = path.join remoteConfig.path, doc.path, doc.name
                fs.remove filePath, (err) ->
                    if err
                        callback err
                    else
                        log.info "File deleted: #{filePath}"
                        publisher.emit 'fileDeleted', filePath
                        callback() if callback?
            else
                callback() if callback?


    # Return folder list in given dir. Parent path, filename and full path
    # are stored for each file.
    # TODO: add test
    walkDirSync: (dir, filelist) =>
        files = fs.readdirSync dir
        filelist ?= []
        for filename in files
            filePath = path.join dir, filename
            if fs.statSync(filePath).isDirectory()
                parent = path.relative remoteConfig.path, dir
                parent = path.join path.sep, parent if parent isnt ''
                filelist.push {parent, filename, filePath}
                filelist = filesystem.walkDirSync filePath, filelist
        return filelist


    # Return file list in given dir. Parent path, filename and full path
    # are stored for each file.
    # TODO: add test
    walkFileSync: (dir, filelist) =>
        files = fs.readdirSync dir
        filelist ?= []
        for filename in files
            filePath = path.join dir, filename
            if not fs.statSync(filePath).isDirectory()
                parent = path.relative remoteConfig.path, dir
                parent = path.join path.sep, parent if parent isnt ''
                filelist.push {parent, filename, filePath}
            else
                filelist = filesystem.walkFileSync filePath, filelist
        return filelist


    # TODO: add test
    deleteFolderIfNotListed: (dir, callback) ->
        fullPath = dir.filePath
        relativePath = "#{dir.parent}/#{dir.filename}"
        pouch.db.query 'folder/byFullPath', key: relativePath, (err, res) ->
            if err
                callback err
            else if res.rows.length is 0 and fs.existsSync fullPath
                log.info "Removing directory: #{relativePath} (not remotely listed)"
                fs.remove fullPath, callback
            else
                callback()


    # TODO: add test
    deleteFileIfNotListed: (file, callback) ->
        fullPath = file.filePath
        relativePath = "#{file.parent}/#{file.filename}"
        pouch.db.query 'file/byFullPath', key: relativePath, (err, res) ->
            if res.rows.length is 0 and fs.existsSync fullPath
                log.info "Removing file: #{relativePath} (not remotely listed)"
                fs.remove fullPath, callback
            else
                callback()


    # TODO: add test
    downloadIfNotExists: (doc, callback) =>
        doc = doc.value
        if doc.path? and doc.name?
            filePath = path.resolve remoteConfig.path, doc.path, doc.name

            # TODO Should test if checksum is right
            if fs.existsSync filePath
                callback()
            else
                # Else download file
                binary.fetchFromDoc remoteConfig.deviceName, doc, callback
        else
            callback()
            #pouch.db.remove doc, (err) ->
                #log.warn err if err
                #callback()


    # Make sure that filesystem folder tree matches with information stored in
    # the database.
    applyFolderDBChanges: (callback) ->
        pouch.folders.all (err, result) ->
            if err
                callback err
            else
                folders = result.rows

                dirList = filesystem.walkDirSync remoteConfig.path
                async.eachSeries dirList, filesystem.deleteFolderIfNotListed, (err) ->
                    if err
                        callback err
                    else
                        async.eachSeries(folders,
                                         filesystem.makeDirectoryFromDoc,
                                         callback)


    # Make sure that filesystem files matches with information stored in the
    # database.
    applyFileDBChanges: (keepLocalDeletions, callback) ->
        pouch.files.all (err, result) ->
            if err and err.status isnt 404 or result is undefined
                callback err
            else
                files = result.rows
                async.eachSeries files, filesystem.downloadIfNotExists, (err) ->
                    if err
                        callback err
                    else
                        fileList = filesystem.walkFileSync remoteConfig.path
                        async.eachSeries(fileList,
                                         filesystem.deleteFileIfNotListed,
                                         callback)


    # Check for directoy existence. If it exists, it
    createDirectoryDoc: (dirPath, ignoreExisting, callback) ->
        dirPaths = filesystem.getPaths dirPath
        remoteConfig = config.getConfig()

        isInDir = filesystem.isInSyncDir dirPath
        isExist = isInDir and fs.existsSync(dirPaths.absolute)

        if not isExist
            unless dirPath is '' or dirPath is remoteConfig.path
                log.error """
Directory is not located in the synchronized directory: #{dirPaths.absolute}
"""
            callback()

        else
            absParent = dirPaths.absParent
            filesystem.createDirectoryDoc absParent, true, (err, res) ->
                if err
                    log.error "An error occured at parent directory's creation"
                    callback err
                else
                    newDoc =
                        _id: uuid.v4().split('-').join('')
                        docType: 'Folder'
                        name: dirPaths.name
                        path: dirPaths.parent
                        tags: []
                    absPath = dirPaths.absolute
                    filesystem.updateDirStats absPath, newDoc, (err, newDoc) ->
                        if err
                            callback err
                        else
                            pouch.folders.upsert newDoc, ->
                                callback null, newDoc


    updateDirStats: (absPath, newDoc, callback) ->
        fs.stat absPath, (err, stats) ->
            if err
                callback err
            else
                newDoc.creationDate = stats.mtime
                newDoc.lastModification = stats.mtime
                callback null, newDoc


    # TODO refactor it in smaller functions.
    createFileDoc: (filePath, ignoreExisting, callback) ->
        filePaths = @getPaths filePath

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
                    pouch.db.put newDoc, callback


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
                    if err
                        callback err
                    else
                        uploadBinary newDoc, binaryDoc
            else
                # If binary does not exist remotely yet, we have to
                # create an empty binary document remotely to have
                # an ID and a revision
                binary.createEmptyRemoteDoc (err, binaryDoc) ->
                    if err
                        callback err
                    else
                        uploadBinary newDoc, binaryDoc

        checkBinaryExistence = (newDoc, checksum) ->
            # Check if the binary doc exists, using its checksum
            # It would mean that binary is already uploaded
            binary.docAlreadyExists checksum, (err, doc) ->
                if err
                    callback err
                #else if doc
                #    # Binary document exists
                #    newDoc.binary =
                #        file:
                #            id: doc._id
                #            rev: doc._rev
                #    saveBinaryDocument newDoc
                else
                    populateBinaryInformation newDoc

        checkDocExistence = (newDoc) ->

            binary.checksum filePaths.absolute, (err, checksum) ->
                # Get the existing file (if exists) to prefill
                # document with its information
                pouch.db.query 'file/byFullPath',
                    key: "#{filePaths.parent}/#{filePaths.name}"
                , (err, res) ->
                    if err and err.status isnt 404
                        return callback err
                    else if not err and res.rows.length isnt 0
                        existingDoc = res.rows[0].value
                        newDoc = updateFileInformation existingDoc, newDoc

                    checkBinaryExistence newDoc, checksum

        updateFileStats = (newDoc) ->

            # Update size and dates using the value of the FS
            fs.stat filePaths.absolute, (err, stats) ->
                newDoc.lastModification = stats.mtime
                newDoc.creationDate = stats.mtime
                newDoc.size = stats.size

                checkDocExistence newDoc

        createParentDirectory = (newDoc) =>
            @createDirectoryDoc filePaths.absParent, true, (err, res) ->
                if err
                    log.error "An error occured at parent directory's creation"
                    callback err
                else
                    updateFileStats newDoc

        checkFileLocation = () =>
            remoteConfig = config.getConfig()
            if not @isInSyncDir(filePath) \
            or not fs.existsSync(filePaths.absolute)
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

        key = "#{filePaths.parent}/#{filePaths.name}"

        pouch.files.get key, (err, docFile) ->
            if docFile? and not err
                pouch.markAsDeleted docFile, callback
            else
                pouch.folders.get key, (err, docFolder) ->
                    if err
                        callback err
                        log.raw err
                    else if docFolder?
                        pouch.markAsDeleted docFolder, callback
                    else
                        # Document is already deleted
                        callback()


    # TODO refactor it in smaller functions.
    watchChanges: (continuous, fromNow) ->
        log.info 'Start watching file system for changes'
        remoteConfig = config.getConfig()
        fromNow ?= false
        continuous ?= fromNow

        filesBeingCopied = {}

        # Function to check if file is being copied
        # to avoid chokidar to detect file multiple times
        fileIsCopied = (filePath, callback) ->
            unless filePath in filesBeingCopied
                filesBeingCopied[filePath] = true
            getSize = (filePath, callback) ->
                if fs.existsSync filePath
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
                , 2000

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
                    @changes.push { operation: 'post', file: filePath }, ->

        # New directory detected
        .on 'addDir', (dirPath) =>
            if not @watchingLocked
                if dirPath isnt remoteConfig.path
                    log.info "Directory added: #{dirPath}"
                    @createDirectoryDoc dirPath, true, ->

        # File deletion detected
        .on 'unlink', (filePath) =>
            log.info "File deleted: #{filePath}"
            @changes.push { operation: 'deleteDoc', file: filePath }, ->

        # Folder deletion detected
        .on 'unlinkDir', (dirPath) =>
            log.info "Folder deleted: #{dirPath}"
            @changes.push { operation: 'deleteDoc', file: dirPath }, ->

        # File update detected
        .on 'change', (filePath) =>
            if not @watchingLocked and not filesBeingCopied[filePath]?
                log.info "File changed: #{filePath}"
                fileIsCopied filePath, =>
                    @changes.push { operation: 'put', file: filePath }, ->

        .on 'error', (err) ->
            log.error 'An error occured while watching changes:'
            console.error err


module.exports = filesystem
