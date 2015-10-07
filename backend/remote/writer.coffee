module.exports =
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
            couch.uploadBinary absPath, null, (err, binaryDoc) ->
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
        operationQueue.publisher.emit 'uploadingLocalChanges'

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
