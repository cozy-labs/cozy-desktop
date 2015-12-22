async    = require 'async'
chokidar = require 'chokidar'
crypto   = require 'crypto'
find     = require 'lodash.find'
fs       = require 'fs'
mime     = require 'mime'
path     = require 'path'
log      = require('printit')
    prefix: 'Local watcher '


# This file contains the filesystem watcher that will trigger operations when
# a file or a folder is added/removed/changed locally.
# Operations will be added to the a common operation queue along with the
# remote operations triggered by the remoteEventWatcher.
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
        @pending = Object.create null  # ES6 map would be nice!
        @checksums = 0

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
    # TODO wait 1.2s that awaitWriteFinish detects the last added files?
    stop: ->
        @watcher?.close()
        @watcher = null
        for _, pending of @pending
            pending.done()

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
        @checksum absPath, (err, checksum) ->
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

    # Returns true if a sub-folder of the given path is pending
    hasPending: (folderPath) ->
        ret = find @pending, (_, key) ->
            path.dirname(key) is folderPath
        ret?  # Coerce the returns to a boolean


    ### Actions ###

    # New file detected
    onAdd: (filePath, stats) =>
        log.debug 'File added', filePath
        @paths?.push filePath
        @pending[filePath]?.done()
        @checksums++
        @createDoc filePath, stats, (err, doc) =>
            if err
                @checksums--
                log.debug err
            else
                keys = Object.keys @pending
                if keys.length is 0
                    @checksums--
                    @prep.addFile @side, doc, @done
                else
                    # TODO path vs _id: normalize keys?
                    options =
                        keys: keys
                        include_docs: true
                    @pouch.db.allDocs options, (err, results) =>
                        @checksums--
                        if err
                            @prep.addFile @side, doc, @done
                        else
                            docs = (row.doc for row in results.rows)
                            same = find docs, checksum: doc.checksum
                            if same
                                clearTimeout @pending[same.path].timeout
                                delete @pending[same.path]
                                @prep.moveFile @side, doc, same, @done
                            else
                                @prep.addFile @side, doc, @done

    # New directory detected
    onAddDir: (folderPath, stats) =>
        unless folderPath is ''
            log.debug 'Folder added', folderPath
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
            log.debug 'File deleted', filePath
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
            log.debug 'Folder deleted', folderPath
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
