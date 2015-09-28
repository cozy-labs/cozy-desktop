fs = require 'fs-extra'
path = require 'path-extra'
async = require 'async'
log = require('printit')
    prefix: 'Queue         '

ping = require 'ping'
url = require 'url'

#
# Local backend files
#
pouch = require './db'
publisher = require './publisher'
filesystem = require './filesystem'
config = require './config'
remoteEventWatcher = require './remote_event_watcher'
localEventWatcher  = require './local_event_watcher'

#
# This file contains the operations that are triggered by local and remote
# watchers.
# In order to avoid conflicts and interferences, every single operation is
# added to a synchronous queue that executes operations one-by-one.
#
applyOperation = (task, callback) ->
    log.debug "Operation queued: #{task.operation}"
    log.debug "File: #{task.file}" if task.file?
    log.debug task.doc if task.doc?

    # We will need to add some features before the callback
    # afterward, let's save it!
    initialCallback = callback

    #
    # Operation that will block chokidar from watching FS changes
    #
    # i.e. when files will be downloaded from remote, we don't want them
    # to be detected as "new files"
    #
    watchingBlockingOperations = [
        'createFileLocally'
        'createFolderLocally'
        'deleteFileLocally'
        'deleteFolderLocally'
        'moveFileLocally'
        'moveFolderLocally'
        'ensureAllFilesLocally'
        'ensureAllFoldersLocally'
    ]

    remoteConfig = config.getConfig()
    hostname = url.parse(remoteConfig.url).hostname
    log.debug "Ping #{hostname}..."
    ping.sys.probe hostname, (isAlive) ->
        if isAlive
            if task.operation in watchingBlockingOperations
                # TODO: Change synchronized folder's permission to "read-only"
                # while applying those operations.
                filesystem.locked = true
                callback = (err, res) ->
                    # We want to log the errors and their trace to be able
                    # to find when and where it occured.
                    operationQueue.displayErrorStack err, task.operation if err

                    # Wait a bit before unblocking FS watcher, to avoid
                    # inotify / kqueue to fire an event anyway.
                    setTimeout ->
                        filesystem.locked = false
                        initialCallback null, res
                    , 300

            #
            # Operations that will delay application of replication changes
            #
            # i.e when multiples files are added locally, we don't want those
            # additions to be interrupted by remote changes application
            #
            replicationDelayingOperations = [
                'createFileRemotely'
                'createFolderRemotely'
                'forceDeleteFileRemotely'
                'deleteFolderRemotely'
                'updateFileRemotely'
                'ensureAllFilesRemotely'
                'ensureAllFoldersRemotely'
            ]

            if task.operation in replicationDelayingOperations
                #delay = 2000
                #pouch.replicationDelay += delay
                #setTimeout ->
                    #pouch.replicationDelay -= delay
                #, delay
                callback = (err, res) ->

                    # We want to log the errors and their trace to be able
                    # to find when and where it occured.
                    if err
                        operationQueue.displayErrorStack err, task.operation

                    # Launch a replication before calling back
                    pouch.replicateToRemote()
                    initialCallback null, res

            # Apply operation
            if param = task.file or task.folder or task.doc
                operationQueue[task.operation] param, callback
            else
                operationQueue[task.operation] callback

        else
            log.debug "Network dead."
            operationQueue.waitNetwork task
            callback()

operationQueue =

    queue: async.queue applyOperation, 1

    waitNetwork: (task) ->
        operationQueue.queue.pause()
        operationQueue.queue.unshift task, ->
        remoteConfig = config.getConfig()
        interval = setInterval ->
            hostname = url.parse(remoteConfig.url).hostname
            log.debug "Ping #{hostname}..."
            ping.sys.probe hostname, (isAlive) ->
                if isAlive
                    log.debug "Network alive."
                    operationQueue.queue.resume()
                    clearInterval(interval)
                else
                    log.debug "Network dead."
        , 5 * 1000

    #
    # Remote-to-local operations
    #
    # Steps:
    # * Checks if the doc is valid: has a path and a name.
    # * Ensure parent folder exists.
    # * Try to find a similar file based on his checksum. In that case, it
    #   just requires a local copy.
    # * Download the linked binary from remote.
    # * Update creation and last modification dates
    #
    createFileLocally: (doc, callback) ->

        remoteConfig = config.getConfig()
        unless doc?.path? and doc?.name? and doc.binary?.file?.id?
            log.warn "The doc is invalid: #{JSON.stringify doc}"
            callback()

        else if doc.path?.indexOf('undefined') >= 0
            pouch.db.remove doc, (err) ->
                err = new Error "The doc was invalid: #{JSON.stringify doc}"
                callback err

        else
            parent = path.join remoteConfig.path, doc.path
            filePath = path.join parent, doc.name
            binaryId = doc.binary.file.id
            checksum = doc.binary.file.checksum

            async.waterfall [

                # Ensure that the parent directory is created
                (next) ->
                    fs.ensureDir parent, next

                # Check if a file with the same checksum exists
                (res, next) ->
                    filesystem.fileExistsLocally checksum, next

                # If a similar file exists, we just have to copy it, otherwise
                # download the binary from CouchDB
                (existingFilePath, next) ->
                    if existingFilePath
                        source = filesystem.getPaths existingFilePath
                        target = filesystem.getPaths filePath
                        fs.copy source.absolute, target.absolute, next
                    else
                        filesystem.downloadBinary(
                            binaryId, filePath, doc.size, next)

                # Change utimes (creation and modification date)
                (res, next) ->
                    next ?= res
                    creationDate = new Date doc.creationDate
                    lastModification = new Date doc.lastModification
                    fs.utimes filePath, new Date(), lastModification, next

            ], callback


    createFolderLocally: (doc, callback) ->
        remoteConfig = config.getConfig()
        unless doc?.path? and doc?.name?
            log.warn "The doc is invalid: #{JSON.stringify doc}"
            callback()

        else if doc.path?.indexOf('undefined') >= 0
            pouch.db.remove doc, (err) ->
                log.warn "The doc was invalid: #{JSON.stringify doc}"
                callback()

        else
            folderPath = path.join remoteConfig.path, doc.path, doc.name
            fs.ensureDir folderPath, (err, res) ->
                return callback() if not doc.lastModification?

                # Update last modification date
                creationDate = new Date doc.creationDate
                lastModification = new Date doc.lastModification
                fs.utimes folderPath, new Date(), lastModification, callback


    deleteFileLocally: (doc, callback) ->
        pouch.getKnownPath doc, (err, filePath) ->
            if filePath?
                fs.remove filePath, callback
            else callback err


    deleteFolderLocally: (doc, callback) ->
        pouch.getKnownPath doc, (err, folderPath) ->
            if folderPath?
                fs.remove folderPath, (err) ->
                    callback(err)
            else callback err


    moveFileLocally: (doc, callback) ->
        remoteConfig = config.getConfig()
        unless doc?.path? and doc?.name?
            err = new Error "The doc is invalid: #{JSON.stringify doc}"
            return callback err

        newPath = path.join remoteConfig.path, doc.path, doc.name

        updateUtimes = (filePath, callback) ->
            if doc.lastModification
                fs.utimes filePath
                        , new Date()
                        , new Date(doc.lastModification)
                        , callback
            else
                callback()

        pouch.getKnownPath doc, (err, oldPath) ->
            return callback err if err

            if oldPath is newPath
                # Check file similarities
                # TODO: base this on the checksum too
                stats = fs.statSync newPath
                if doc.size is stats.size and not stats.isDirectory()
                    return callback()

            oldPathExists = fs.existsSync oldPath
            newPathExists = fs.existsSync newPath

            # Move the file
            if oldPathExists and not newPathExists
                if doc.binary?.file?.id?
                    pouch.db.get doc.binary.file.id, (err, doc) ->
                        doc.path = newPath
                        pouch.db.put doc, (err, res) ->
                            fs.move oldPath, newPath, (err) ->
                                return callback err if err?
                                updateUtimes newPath, callback

                else
                    fs.move oldPath, newPath, (err) ->
                        return callback err if err?
                        updateUtimes newPath, callback

            # Assume that the file has already been moved
            # TODO: base this assumption on checksum ?
            else if not oldPathExists and newPathExists
                callback()

            # No file to move, do nothing
            else if not oldPathExists
                log.error "File #{oldPath} not found, and cannot be moved."
                callback()

            # The destination file already exists, duplicate
            else if oldPathExists and newPathExists
                if doc.docType.toLowerCase() is 'folder'
                    if newPath isnt oldPath
                        fs.removeSync oldPath
                    updateUtimes newPath, callback
                else
                    log.info "File #{newPath} already exists, " +
                        "duplicating to #{newPath}.new"
                    fs.move oldPath, "#{newPath}.new", (err) ->
                        return callback err if err?
                        updateUtimes "#{newPath}.new", callback


    moveFolderLocally: (doc, callback) ->
        # For now both operations are similar.
        operationQueue.moveFileLocally doc, callback


    ensureAllFilesLocally: (callback) ->
        remoteConfig = config.getConfig()

        # Walk through all file DB documents, and download missing files if any
        pouch.files.all (err, res) ->
            return callback err if err?

            log.info "Downloading missing files from remote..."
            files = res.rows

            # Process files one by one to avoid conflicts
            async.eachSeries files, (doc, done) ->
                doc = doc.value

                # Do not mind deleted or invalid DB documents
                if not doc?.path? or not doc?.name?
                    return done()

                filePath = path.join remoteConfig.path, doc.path, doc.name
                if fs.existsSync filePath
                    done()
                else
                    log.info "Missing file detected: #{filePath}"
                    operationQueue.createFileLocally doc, done
            , callback


    ensureAllFoldersLocally: (callback) ->
        remoteConfig = config.getConfig()

        # Walk through all folder DB documents, and create missing folders
        pouch.folders.all (err, res) ->
            return callback err if err?

            log.info "Creating locally missing folders..."
            folders = res.rows

            # Process folders one by one to avoid conflicts
            async.eachSeries folders, (doc, done) ->
                doc = doc.value

                # Do not mind deleted or invalid DB documents
                if not doc?.path? or not doc?.name?
                    return done()

                folderPath = path.join remoteConfig.path, doc.path, doc.name
                if fs.existsSync folderPath
                    done()
                else
                    log.info "Missing folder detected: #{folderPath}"
                    operationQueue.createFolderLocally doc, done
            , callback


    # Create a file remotely from local file.
    # TODO: Refactor with async again
    createFileRemotely: (filePath, callback) ->
        filePaths = filesystem.getPaths filePath
        absPath = filePaths.absolute
        relPath = filePaths.relative

        log.debug "Creating file remotely #{filePath}..."

        operationQueue.prepareRemoteCreation filePaths, (err) ->
            return callback err if err

            log.debug "Parent folders of #{relPath} created..."

            # Upload binary Doc to remote
            pouch.uploadBinary absPath, null, (err, binaryDoc) ->
                return callback err if err

                # Make a doc from scratch or by merging with an
                # existing one
                pouch.makeFileDoc filePaths.absolute, (err, doc) ->
                    return callback err if err

                    log.debug "Remote doc for #{relPath} created..."

                    # Update and save the file DB document that
                    # will be replicated afterward.
                    doc.binary =
                        file:
                            id: binaryDoc.id
                            rev: binaryDoc.rev
                            checksum: binaryDoc.checksum

                    pouch.db.put doc, (err, res) ->
                        return callback err if err
                        log.debug "Binary Data for #{relPath} updated..."
                        # Flag the revision of the document as 'made
                        # locally' to avoid further conflicts
                        # reapplicating changes
                        pouch.storeLocalRev res.rev, ->
                            log.debug "File #{relPath} remotely created."
                            callback()


    # - check file existence locally, if the file doesn't exist, it is deleted
    # - create remote folder if needed.
    prepareRemoteCreation: (filePaths, callback) ->
        # Check that the file exists and is located in the sync
        # directory
        filesystem.checkLocation filePaths.absolute, (err) ->
            if err
                log.debug "File doesn't exist locally, abort."
                pouch.files.get filePaths.relative, (error, doc) ->
                    if doc?
                        pouch.db.remove doc, (error2, res) ->
                            callback err
                    else
                        callback err
            else
                absPath = filePaths.absParent
                operationQueue.createFolderRemotely absPath, callback


    createFolderRemotely: (folderPath, callback) ->
        folderPaths = filesystem.getPaths folderPath
        return callback() if folderPaths.relative is ''

        log.debug "Create remotely folder: #{folderPaths.relative}"

        # Check that the folder exists and is located in the sync directory
        filesystem.checkLocation folderPaths.absolute, (err) ->
            if err
                callback err
            else
                # Check if the folder DB document already exists
                key = "#{folderPaths.parent}/#{folderPaths.name}"
                pouch.folders.get key, (err, docExists) ->
                    if err
                        callback err

                    # No need to create the doc if it exists already
                    else if docExists?
                        callback()

                    # Otherwise ensure that the parent folder exists and
                    # continue.
                    else
                        async.waterfall [
                            (next) ->
                                operationQueue.createFolderRemotely(
                                    folderPaths.absParent, next)

                            # Make a doc from scratch or from an existing one
                            # (useful?).
                            (next) ->
                                pouch.makeFolderDoc folderPaths.absolute, next

                            # Update and save the folder DB document that will
                            # be replicated afterward.
                            (folderDoc, next) ->
                                pouch.db.put folderDoc, next

                            # Flag the revision of the document as 'made
                            # locally' to avoid further conflicts reapplicating
                            # changes
                            (res, next) ->
                                pouch.storeLocalRev res.rev, next

                        ], callback


    deleteFileRemotely: (filePath, callback) ->

        # Ugly trick to delay deletion. Pushes a 'forceDeleteFileRemotely'
        # operation with a 5sec delay, and does nothing else.
        # This enables the "createFileRemotely" operation to detect a potential
        # file move, and not plain deletion/creation everytime.
        setTimeout ->
            operationQueue.queue.push
                operation: 'forceDeleteFileRemotely'
                file: filePath, ->
        , 3000
        callback()


    forceDeleteFileRemotely: (filePath, callback) ->
        filePaths = filesystem.getPaths filePath

        key = "#{filePaths.parent}/#{filePaths.name}"

        pouch.files.get key, (err, fileDoc) ->

            # An error occured
            if err and err.status isnt 404
                callback err

            # Document already deleted
            else if (err and err.status is 404) or not fileDoc
                callback()

            else pouch.markAsDeleted fileDoc, callback


    # TODO: do the same ugly trick as for file deletion ?
    # (In order to keep tags upon folder moving)
    deleteFolderRemotely: (folderPath, callback) ->
        folderPaths = filesystem.getPaths folderPath

        key = "#{folderPaths.parent}/#{folderPaths.name}"

        pouch.folders.get key, (err, folderDoc) ->
            # An error occured
            if err and err.status isnt 404
                callback err

            # Document already deleted
            else if (err and err.status is 404) or not folderDoc?
                callback()

            else pouch.markAsDeleted folderDoc, callback


    updateFileRemotely: (filePath, callback) ->

        # The 'createFileRemotely' operation handles (for now) file update
        # since it has to handle file move too.
        operationQueue.createFileRemotely filePath, callback


    ensureAllFilesRemotely: (callback) ->
        remoteConfig = config.getConfig()

        log.info "Uploading modifications to remote..."
        publisher.emit 'uploadingLocalChanges'

        # Walk through all existing files in the synchronized folder and
        # create all the missing DB documents
        fileList = filesystem.walkFileSync remoteConfig.path
        creationCounter = 0
        async.eachSeries fileList, (file, next) ->
            relativePath = "#{file.parent}/#{file.filename}"
            absPath = path.join remoteConfig.path, relativePath
            pouch.files.get relativePath, (err, doc) ->
                if err
                    log.error err
                    log.error "Cannot find #{relativePath} in local database."
                    next()
                else if doc?.path? and doc?.name?
                    next()
                else
                    log.info "New file detected: #{absPath}."
                    creationCounter++
                    operationQueue.createFileRemotely absPath, next
        , ->
            if creationCounter is 0
                log.info "No new file to create."
            else
                log.info "#{creationCounter} missing files created."
            callback()


    ensureAllFoldersRemotely: (callback) ->
        remoteConfig = config.getConfig()

        log.info "Creating unlisted folders remotely..."

        # Walk through all existing folders in the synchronized folder and
        # create all the missing DB documents
        folderList = filesystem.walkDirSync remoteConfig.path
        async.eachSeries folderList, (folder, done) ->
            relativePath = "#{folder.parent}/#{folder.filename}"
            absPath = path.join remoteConfig.path, relativePath
            pouch.folders.get relativePath, (err, doc) ->
                if err
                    done err
                else if doc?.path? and doc?.name?
                    done()
                else
                    log.info "New folder detected: #{absPath}"
                    operationQueue.createFolderRemotely absPath, done
        , callback


    #
    # Macro function
    #
    makeFSSimilarToDB: (callback) ->
        async.series [
            (next) => @queue.push operation: 'ensureAllFoldersLocally', next
            (next) => @queue.push operation: 'ensureAllFilesLocally', next
            (next) => @queue.push operation: 'ensureAllFoldersRemotely', next
            (next) => @queue.push operation: 'ensureAllFilesRemotely', next
        ], callback


    #
    # Error handling
    #
    displayErrorStack: (err, operation) ->
        log.error "An error occured during the operation #{operation}:"
        if err.stack?
            for line in err.stack.split('\n')
                log.raw line
        else
            log.raw err


module.exports = operationQueue
