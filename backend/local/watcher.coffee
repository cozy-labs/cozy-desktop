async    = require 'async'
chokidar = require 'chokidar'
crypto   = require 'crypto'
fs       = require 'fs'
mime     = require 'mime'
path     = require 'path'
log      = require('printit')
    prefix: 'Local watcher '


# This file contains the filesystem watcher that will trigger operations when
# a file or a folder is added/removed/changed locally.
# Operations will be added to the a common operation queue along with the
# remote operations triggered by the remoteEventWatcher.
#
# TODO detects move/rename (for files only):
# TODO - https://github.com/paulmillr/chokidar/issues/303#issuecomment-127039892
# TODO - Inotify.IN_MOVED_FROM & Inotify.IN_MOVED_TO
# TODO - track inodes
class LocalWatcher
    EXECUTABLE_MASK = 1<<6

    constructor: (@basePath, @prep, @pouch) ->
        @side = 'local'

    # Start chokidar, the filesystem watcher
    # https://github.com/paulmillr/chokidar
    #
    # The callback is called when the initial scan is complete
    start: (callback) =>
        log.info 'Start watching filesystem for changes'
        @paths = []

        @watcher = chokidar.watch '.',
            # Let paths in events be relative to this base path
            cwd: @basePath
            # Ignore our own .cozy-desktop directory
            ignored: /[\/\\]\.cozy-desktop/
            # Don't follow symlinks
            followSymlinks: false
            # The stats object is used in methods below
            alwaysStat: true
            # Filter out artifacts from editors with atomic writes
            atomic: true
            # Poll newly created files to detect when the write is finished
            awaitWriteFinish:
                pollInterval: 200
                stabilityThreshold: 1000
            # With node 0.10 on linux, only polling is available
            interval: 1000
            binaryInterval: 2000

        @watcher
            .on 'add', @onAdd
            .on 'addDir', @onAddDir
            .on 'change', @onChange
            .on 'unlink', @onUnlink
            .on 'unlinkDir', @onUnlinkDir
            .on 'ready', @onReady(callback)
            .on 'error', (err) ->
                if err.message is 'watch ENOSPC'
                    log.error 'Sorry, the kernel is out of inotify watches!'
                    log.error 'See doc/inotify.md for how to solve this issue.'
                else
                    log.error err

    # Stop chokidar watcher
    stop: ->
        @watcher?.close()
        @watcher = null

    # Show watched paths
    debug: ->
        if @watcher
            log.info 'This is the list of the paths watched by chokidar:'
            for dir, files of @watcher.getWatched()
                if dir is '..'
                    for file in files
                        log.info "- #{dir}/#{file}"
                else
                    log.info "- #{dir}" unless dir is '.'
                    for file in files
                        log.info "  * #{file}"
            log.info '--------------------------------------------------'
        else
            log.warn 'The file system is not currrently watched'


    ### Helpers ###

    # An helper to create a document for a file
    # with checksum and mime informations
    createDoc: (filePath, stats, callback) =>
        absPath = path.join @basePath, filePath
        [mimeType, fileClass] = @getFileClass absPath
        executable = (stats.mode & EXECUTABLE_MASK) isnt 0
        @checksum absPath, (err, checksum) ->
            doc =
                path: filePath
                docType: 'file'
                checksum: checksum
                creationDate: stats.ctime
                lastModification: stats.mtime
                size: stats.size
                class: fileClass
                mime: mimeType
                executable: executable
            callback err, doc

    # Return mimetypes and class (like in classification) of a file
    # It's only based on the filename, not using libmagic
    # ex: pic.png returns 'image/png' and 'image'
    getFileClass: (filename, callback) ->
        mimeType = mime.lookup filename
        fileClass = switch mimeType.split('/')[0]
            when 'image'       then "image"
            when 'application' then "document"
            when 'text'        then "document"
            when 'audio'       then "music"
            when 'video'       then "video"
            else                    "file"
        return [mimeType, fileClass]

    # Get checksum for given file
    checksum: (filePath, callback) ->
        stream = fs.createReadStream filePath
        checksum = crypto.createHash 'sha1'
        checksum.setEncoding 'hex'
        stream.on 'end', ->
            checksum.end()
            callback null, checksum.read()
        stream.on 'error', (err) ->
            checksum.end()
            callback err
        stream.pipe checksum


    ### Actions ###

    # New file detected
    onAdd: (filePath, stats) =>
        log.debug 'File added', filePath
        @paths?.push filePath
        @createDoc filePath, stats, (err, doc) =>
            if err
                log.debug err
            else
                @prep.addFile @side, doc, @done

    # New directory detected
    onAddDir: (folderPath, stats) =>
        unless folderPath is ''
            log.debug 'Folder added', folderPath
            @paths?.push folderPath
            doc =
                path: folderPath
                docType: 'folder'
                creationDate: stats.ctime
                lastModification: stats.mtime
            @prep.putFolder @side, doc, @done

    # File deletion detected
    onUnlink: (filePath) =>
        log.debug 'File deleted', filePath
        @prep.deleteFile @side, path: filePath, @done

    # Folder deletion detected
    onUnlinkDir: (folderPath) =>
        log.debug 'Folder deleted', folderPath
        @prep.deleteFolder @side, path: folderPath, @done

    # File update detected
    onChange: (filePath, stats) =>
        log.debug 'File updated', filePath
        @createDoc filePath, stats, (err, doc) =>
            if err
                log.debug err
            else
                @prep.updateFile @side, doc, @done

    # Try to detect removed files&folders
    # after chokidar has finished its initial scan
    onReady: (callback) =>
        =>
            @pouch.byRecursivePath '', (err, docs) =>
                if err
                    callback err
                else
                    async.eachSeries docs.reverse(), (doc, next) =>
                        # TODO _id vs path -> normalize @paths
                        if doc._id in @paths
                            next()
                        else
                            @prep.deleteDoc @side, doc, next
                    , (err) =>
                        @paths = null
                        callback err

    # A callback that logs errors
    done: (err) ->
        log.error err if err


module.exports = LocalWatcher
