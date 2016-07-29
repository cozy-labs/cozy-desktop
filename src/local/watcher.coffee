async    = require 'async'
chokidar = require 'chokidar'
crypto   = require 'crypto'
find     = require 'lodash.find'
fs       = require 'fs'
mime     = require 'mime'
path     = require 'path'
log      = require('printit')
    prefix: 'Local watcher '
    date: true


# This file contains the filesystem watcher that will trigger operations when
# a file or a folder is added/removed/changed locally.
# Operations will be added to the a common operation queue along with the
# remote operations triggered by the remoteEventWatcher.
class LocalWatcher
    EXECUTABLE_MASK = 1<<6

    constructor: (@syncPath, @prep, @pouch) ->
        @side = 'local'

        # Use a queue for checksums to avoid computing many checksums at the
        # same time. It's better for performance (hard disk are faster with
        # linear readings).
        @checksumer = async.queue @computeChecksum


    # Start chokidar, the filesystem watcher
    # https://github.com/paulmillr/chokidar
    #
    # The callback is called when the initial scan is complete
    start: (callback) =>
        log.info 'Start watching filesystem for changes'

        # To detect which files&folders have been removed since the last run of
        # cozy-desktop, we keep all the paths seen by chokidar during its
        # initial scan in @paths to compare them with pouchdb database.
        @paths = []

        # A map of pending operations. It's used for detecting move operations,
        # as chokidar only reports adds and deletion. The key is the path (as
        # seen on the filesystem, not normalized as an _id), and the value is
        # an object, with at least a done method and a timeout value. The done
        # method can be used to finalized the pending operation (we are sure we
        # want to save the operation as it in pouchdb), and the timeout can be
        # cleared to cancel the operation (for example, a deletion is finally
        # seen as a part of a move operation).
        @pending = Object.create null  # ES6 map would be nice!

        # A counter of how many files are been read to compute a checksum right
        # now. It's useful because we can't do some operations when a checksum
        # is running, like deleting a file, because the checksum operation is
        # slow but needed to detect move operations.
        @checksums = 0

        @watcher = chokidar.watch '.',
            # Let paths in events be relative to this base path
            cwd: @syncPath
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

    stop: (callback) ->
        @watcher?.close()
        @watcher = null
        for _, pending of @pending
            pending.done()
        # Give some time for awaitWriteFinish events to be fired
        setTimeout callback, 3000

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
        absPath = path.join @syncPath, filePath
        [mimeType, fileClass] = @getFileClass absPath
        @checksumer.push filePath: absPath, (err, checksum) ->
            doc =
                path: filePath
                docType: 'file'
                checksum: checksum
                creationDate: stats.birthtime or stats.ctime
                lastModification: stats.mtime
                size: stats.size
                class: fileClass
                mime: mimeType
            doc.executable = true if (stats.mode & EXECUTABLE_MASK) isnt 0
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

    # Put a checksum computation in the queue
    checksum: (filePath, callback) ->
        @checksumer.push filePath: filePath, callback

    # Get checksum for given file
    computeChecksum: (task, callback) ->
        stream = fs.createReadStream task.filePath
        checksum = crypto.createHash 'sha1'
        checksum.setEncoding 'hex'
        stream.on 'end', ->
            checksum.end()
            callback null, checksum.read()
        stream.on 'error', (err) ->
            checksum.end()
            callback err
        stream.pipe checksum

    # Returns true if a sub-folder of the given path is pending
    hasPending: (folderPath) ->
        ret = find @pending, (_, key) ->
            path.dirname(key) is folderPath
        ret?  # Coerce the returns to a boolean


    ### Actions ###

    # New file detected
    onAdd: (filePath, stats) =>
        log.info 'File added', filePath
        @paths?.push filePath
        @pending[filePath]?.done()
        @checksums++
        @createDoc filePath, stats, (err, doc) =>
            if err
                @checksums--
                log.info err
            else
                keys = Object.keys @pending
                if keys.length is 0
                    @checksums--
                    @prep.addFile @side, doc, @done
                else
                    # Let's see if one of the pending deleted files has the
                    # same checksum that the added file. If so, we mark them as
                    # a move.
                    @pouch.byChecksum doc.checksum, (err, docs) =>
                        @checksums--
                        if err
                            @prep.addFile @side, doc, @done
                        else
                            same = find docs, (d) -> ~keys.indexOf(d.path)
                            if same
                                log.info 'was moved from', same.path
                                clearTimeout @pending[same.path].timeout
                                delete @pending[same.path]
                                @prep.moveFile @side, doc, same, @done
                            else
                                @prep.addFile @side, doc, @done

    # New directory detected
    onAddDir: (folderPath, stats) =>
        unless folderPath is ''
            log.info 'Folder added', folderPath
            @paths?.push folderPath
            @pending[folderPath]?.done()
            doc =
                path: folderPath
                docType: 'folder'
                creationDate: stats.ctime
                lastModification: stats.mtime
            @prep.putFolder @side, doc, @done

    # File deletion detected
    #
    # It can be a file moved out. So, we wait a bit to see if a file with the
    # same checksum is added and, if not, we declare this file as deleted.
    onUnlink: (filePath) =>
        clear = =>
            clearTimeout @pending[filePath].timeout
            delete @pending[filePath]
        done = =>
            clear()
            log.info 'File deleted', filePath
            @prep.deleteFile @side, path: filePath, @done
        check = =>
            if @checksums is 0
                done()
            else
                @pending[filePath].timeout = setTimeout check, 100
        @pending[filePath] =
            clear: clear
            done: done
            check: check
            timeout: setTimeout check, 1250

    # Folder deletion detected
    #
    # We don't want to delete a folder before files inside it. So we wait a bit
    # after chokidar event to declare the folder as deleted.
    onUnlinkDir: (folderPath) =>
        clear = =>
            clearInterval @pending[folderPath].interval
            delete @pending[folderPath]
        done = =>
            clear()
            log.info 'Folder deleted', folderPath
            @prep.deleteFolder @side, path: folderPath, @done
        check = =>
            done() unless @hasPending folderPath
        @pending[folderPath] =
            clear: clear
            done: done
            check: check
            interval: setInterval done, 350

    # File update detected
    onChange: (filePath, stats) =>
        log.info 'File updated', filePath
        @createDoc filePath, stats, (err, doc) =>
            if err
                log.info err
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
                        if doc.path in @paths
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
