async = require 'async'
fs    = require 'fs-extra'
path  = require 'path'
log   = require('printit')
    prefix: 'Local writer  '

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
    utimesUpdater: (doc) =>
        filePath = path.resolve @basePath, doc.path
        (callback) ->
            if doc.lastModification
                lastModification = new Date doc.lastModification
                fs.utimes filePath, new Date(), lastModification, callback
            else
                callback()

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
    #
    # TODO verify the checksum -> remove file if not ok
    addFile: (doc, callback) =>
        tmpFile  = path.resolve @tmpPath, path.basename doc.path
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
                if existingFilePath
                    log.info "Recopy #{existingFilePath} -> #{filePath}"
                    stream = fs.createReadStream existingFilePath
                    next null, stream
                else
                    @other.createReadStream doc, next

            (stream, next) =>
                fs.ensureDir @tmpPath, ->
                    target = fs.createWriteStream tmpFile
                    stream.on 'end', next
                    stream.pipe target

            (next) ->
                fs.ensureDir parent, ->
                    fs.rename tmpFile, filePath, next

            @utimesUpdater(doc)

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
                @utimesUpdater(doc)(callback)


    # Overwrite a file
    overwriteFile: (doc, old, callback) =>
        @addFile doc, callback

    # Update the metadata of a file
    updateFileMetadata: (doc, old, callback) =>
        @utimesUpdater(doc) callback

    # Update a folder
    updateFolder: (doc, old, callback) =>
        @addFolder doc, callback


    # Move a file from one place to another
    # TODO verify checksum
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

            @utimesUpdater(doc)

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

            @utimesUpdater(doc)

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


module.exports = Local
