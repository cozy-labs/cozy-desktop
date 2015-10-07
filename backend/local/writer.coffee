module.exports =
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


