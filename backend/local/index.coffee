async = require 'async'
fs    = require 'fs-extra'
path  = require 'path'
log   = require('printit')
    prefix: 'Local writer  '

Watcher = require './watcher'


# TODO comments, tests
class Local
    constructor: (config, @merge, @pouch, @events) ->
        @basePath = config.getDevice().path
        @tmpPath  = path.join @basePath, ".cozy-desktop"
        @watcher  = new Watcher @basePath, @merge, @pouch, @events
        @other = null

    start: (done) ->
        fs.ensureDir @basePath, =>
            @watcher.start done

    createReadStream: (doc, callback) ->
        callback new Error 'TODO'


    ### Helpers ###

    # Return a function that will update last modification date
    utimesUpdater: (doc) =>
        filePath = path.resolve @basePath, doc._id
        (callback) ->
            if doc.lastModification
                lastModification = new Date doc.lastModification
                fs.utimes filePath, new Date(), lastModification, callback
            else
                callback()

    # Check if a file corresponding to given checksum already exists
    fileExistsLocally: (checksum, callback) =>
        @pouch.byChecksum checksum, (err, docs) =>
            if err
                callback err
            else if not docs? or docs.length is 0
                callback null, false
            else
                paths = for doc in docs
                    path.resolve @basePath, doc._id
                async.detect paths, fs.exists, (foundPath) ->
                    callback null, foundPath


    ### Write operations ###

    # Steps to create a file:
    #   * Checks if the doc is valid: has a path and a name
    #   * Ensure that the temporary directory exists
    #   * Try to find a similar file based on his checksum
    #     (in that case, it just requires a local copy)
    #   * Download the linked binary from remote
    #   * Write to a temporary file
    #   * Ensure parent folder exists
    #   * Move the temporay file to its final destination
    #   * Update creation and last modification dates
    #
    # Note: this method is used for adding a new file
    # or replacing an existing one
    addFile: (doc, callback) =>
        basename = path.basename doc._id
        dirname  = path.dirname doc._id
        tmpFile  = path.join @tmpPath, basename
        parent   = path.resolve @basePath, dirname
        filePath = path.resolve @basePath, doc._id

        log.info "put file #{filePath}"

        async.waterfall [
            (next) =>
                @fileExistsLocally doc.checksum, next

            (existingFilePath, next) =>
                # TODO what if existingFilePath is filePath
                if existingFilePath
                    stream = fs.createReadStream existingFilePath
                    next null, stream
                else
                    @other.createReadStream doc, next

            # TODO verify the checksum -> remove file if not ok
            # TODO show progress
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
            fs.unlink tmpFile, ->
                callback err


    # Create a new folder
    addFolder: (doc, callback) =>
        folderPath = path.join @basePath, doc._id
        log.info "put folder #{folderPath}"
        fs.ensureDir folderPath, (err) =>
            if err
                callback err
            else
                @utimesUpdater(doc)(callback)


    # Move a file from one place to another
    # TODO verify checksum
    moveFile: (doc, old, callback) =>
        oldPath = path.join @basePath, old._id
        newPath = path.join @basePath, doc._id
        parent  = path.join @basePath, path.dirname doc._id

        async.waterfall [
            (next) ->
                fs.exists oldPath, (oldPathExists) ->
                    if oldPathExists
                        fs.ensureDir parent, ->
                            fs.rename oldPath, newPath, next
                    else
                        log.error "File #{oldPath} not found and can't be moved"
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
    # FIXME
    moveFolder: (doc, callback) =>
        oldPath = null
        newPath = path.join @basePath, doc._id

        async.waterfall [
            (next) =>
                @pouch.getPreviousRev doc._id, next

            (oldDoc, next) =>
                if oldDoc? and oldDoc.name? and oldDoc.path?
                    oldPath = path.join @basePath, oldDoc.path, oldDoc.name
                    fs.exists oldPath, (oldPathExists) ->
                        next null, oldPathExists
                else
                    next new Error "Can't move, no previous folder known"

            (oldPathExists, next) ->
                if oldPathExists
                    fs.exists newPath, (newPathExists) ->
                        next null, newPathExists
                else
                    next new Error "Folder #{oldPath} can't be moved: not found"

            (newPathExists, next) =>
                if newPathExists
                    # TODO not good!
                    fs.remove newPath, next
                else
                    fs.ensureDir path.join(@basePath, doc.path), ->
                        next()

            (next) ->
                fs.rename oldPath, newPath, next

            @utimesUpdater(doc)

        ], (err) =>
            log.error "Error while moving #{JSON.stringify doc, null, 2}"
            log.error err
            @addFolder doc, callback


    # Delete a file from the local filesystem
    deleteFile: (doc, callback) =>
        log.info "delete #{doc._id}"
        fullpath = path.join @basePath, doc._id
        fs.remove fullpath, callback

    # Delete a folder from the local filesystem
    deleteFolder: (doc, callback) =>
        # For now both operations are similar
        @deleteFile doc, callback

module.exports = Local
