async = require 'async'
fs    = require 'fs-extra'
path  = require 'path'
log   = require('printit')
    prefix: 'Local writer  '
    date: true

Watcher = require './watcher'


# Local is the class that interfaces cozy-desktop with the local filesystem.
# It uses a watcher, based on chokidar, to listen for file and folder changes.
# It also applied changes from the remote cozy on the local filesystem.
class Local
    constructor: (config, @prep, @pouch) ->
        @basePath = config.getDevice().path
        @tmpPath  = path.join @basePath, ".cozy-desktop"
        @watcher  = new Watcher @basePath, @prep, @pouch
        @other    = null

    # Start initial replication + watching changes in live
    start: (done) =>
        fs.ensureDir @basePath, =>
            @watcher.start done

    # Stop watching the file system
    stop: (callback) ->
        @watcher.stop callback

    # Create a readable stream for the given doc
    createReadStream: (doc, callback) ->
        try
            filePath = path.resolve @basePath, doc.path
            stream = fs.createReadStream filePath
            callback null, stream
        catch err
            log.error err
            callback new Error 'Cannot read the file'


    ### Helpers ###

    # Return a function that will update last modification date
    # and does a chmod +x if the file is executable
    #
    # Note: UNIX has 3 timestamps for a file/folder:
    # - atime for last access
    # - ctime for change (metadata or content)
    # - utime for update (content only)
    # This function updates utime and ctime according to the last
    # modification date.
    metadataUpdater: (doc) =>
        filePath = path.resolve @basePath, doc.path
        (callback) ->
            next = (err) ->
                if doc.executable
                    fs.chmod filePath, '755', callback
                else
                    callback err
            if doc.lastModification
                lastModification = new Date doc.lastModification
                fs.utimes filePath, lastModification, lastModification, ->
                    # Ignore errors
                    next()
            else
                next()

    # Return true if the local file is up-to-date for this document
    isUpToDate: (doc) ->
        currentRev = doc.sides.local or 0
        lastRev = @pouch.extractRevNumber doc
        return currentRev is lastRev

    # Check if a file corresponding to given checksum already exists
    fileExistsLocally: (checksum, callback) =>
        @pouch.byChecksum checksum, (err, docs) =>
            if err
                callback err
            else if not docs? or docs.length is 0
                callback null, false
            else
                paths = for doc in docs when @isUpToDate doc
                    path.resolve @basePath, doc.path
                async.detect paths, fs.exists, (foundPath) ->
                    callback null, foundPath


    ### Write operations ###

    # Add a new file, or replace an existing one
    #
    # Steps to create a file:
    #   * Try to find a similar file based on his checksum
    #     (in that case, it just requires a local copy)
    #   * Or download the linked binary from remote
    #   * Write to a temporary file
    #   * Ensure parent folder exists
    #   * Move the temporay file to its final destination
    #   * Update creation and last modification dates
    #
    # Note: if no checksum was available for this file, we download the file
    # from the remote document. Later, chokidar will fire an event for this new
    # file. The checksum will then be computed and added to the document, and
    # then pushed to CouchDB.
    addFile: (doc, callback) =>
        tmpFile  = path.resolve @tmpPath, "#{path.basename doc.path}.tmp"
        filePath = path.resolve @basePath, doc.path
        parent   = path.resolve @basePath, path.dirname doc.path

        log.info "Put file #{filePath}"

        async.waterfall [
            (next) =>
                if doc.checksum?
                    @fileExistsLocally doc.checksum, next
                else
                    next null, false

            (existingFilePath, next) =>
                fs.ensureDir @tmpPath, =>
                    if existingFilePath
                        log.info "Recopy #{existingFilePath} -> #{filePath}"
                        fs.copy existingFilePath, tmpFile, next
                    else
                        @other.createReadStream doc, (err, stream) ->
                            # Don't use async callback here!
                            # Async does some magic and the stream can throw an
                            # 'error' event before the next async is called...
                            return next err if err
                            target = fs.createWriteStream tmpFile
                            stream.pipe target
                            target.on 'finish', next

            (next) =>
                if doc.checksum?
                    @watcher.checksum tmpFile, (err, checksum) ->
                        if err
                            next err
                        else if checksum is doc.checksum
                            next()
                        else
                            next new Error 'Invalid checksum'
                else
                    next()

            (next) ->
                fs.ensureDir parent, ->
                    fs.rename tmpFile, filePath, next

            @metadataUpdater(doc)

        ], (err) ->
            log.debug doc
            fs.unlink tmpFile, ->
                callback err


    # Create a new folder
    addFolder: (doc, callback) =>
        folderPath = path.join @basePath, doc.path
        log.info "Put folder #{folderPath}"
        fs.ensureDir folderPath, (err) =>
            if err
                callback err
            else
                @metadataUpdater(doc)(callback)


    # Overwrite a file
    overwriteFile: (doc, old, callback) =>
        @addFile doc, callback

    # Update the metadata of a file
    updateFileMetadata: (doc, old, callback) =>
        @metadataUpdater(doc) callback

    # Update a folder
    updateFolder: (doc, old, callback) =>
        @addFolder doc, callback


    # Move a file from one place to another
    moveFile: (doc, old, callback) =>
        log.info "Move file #{old.path} → #{doc.path}"
        oldPath = path.join @basePath, old.path
        newPath = path.join @basePath, doc.path
        parent  = path.join @basePath, path.dirname doc.path

        async.waterfall [
            (next) ->
                fs.exists oldPath, (oldPathExists) ->
                    if oldPathExists
                        fs.ensureDir parent, ->
                            fs.rename oldPath, newPath, next
                    else
                        fs.exists newPath, (newPathExists) ->
                            if newPathExists
                                next()
                            else
                                log.error "File #{oldPath} not found"
                                next new Error "#{oldPath} not found"

            @metadataUpdater(doc)

        ], (err) =>
            if err
                log.error "Error while moving #{JSON.stringify doc, null, 2}"
                log.error JSON.stringify old, null, 2
                log.error err
                @addFile doc, callback
            else
                callback null


    # Move a folder
    moveFolder: (doc, old, callback) =>
        log.info "Move folder #{old.path} → #{doc.path}"
        oldPath = path.join @basePath, old.path
        newPath = path.join @basePath, doc.path
        parent  = path.join @basePath, path.dirname doc.path

        async.waterfall [
            (next) ->
                fs.exists oldPath, (oldPathExists) ->
                    fs.exists newPath, (newPathExists) ->
                        if oldPathExists and newPathExists
                            fs.rmdir oldPath, next
                        else if oldPathExists
                            fs.ensureDir parent, ->
                                fs.rename oldPath, newPath, next
                        else if newPathExists
                            next()
                        else
                            log.error "Folder #{oldPath} not found"
                            next new Error "#{oldPath} not found"

            @metadataUpdater(doc)

        ], (err) =>
            if err
                log.error "Error while moving #{JSON.stringify doc, null, 2}"
                log.error JSON.stringify old, null, 2
                log.error err
                @addFolder doc, callback
            else
                callback null


    # Delete a file from the local filesystem
    deleteFile: (doc, callback) =>
        log.info "Delete #{doc.path}"
        fullpath = path.join @basePath, doc.path
        fs.remove fullpath, callback

    # Delete a folder from the local filesystem
    deleteFolder: (doc, callback) =>
        # For now both operations are similar
        @deleteFile doc, callback

    # Rename a file/folder to resolve a conflict
    resolveConflict: (dst, src, callback) =>
        log.info "Resolve a conflict: #{src.path} → #{dst.path}"
        srcPath = path.join @basePath, src.path
        dstPath = path.join @basePath, dst.path
        fs.rename srcPath, dstPath, callback
        # Don't fire an event for the deleted file
        setTimeout =>
            @watcher.pending[src.path]?.clear()
        , 1000


module.exports = Local
