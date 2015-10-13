chokidar = require 'chokidar'
path     = require 'path'
fs       = require 'fs'
log      = require('printit')
    prefix: 'Local watcher '

filesystem = require './filesystem'


# This file contains the filesystem watcher that will trigger operations when
# a file or a folder is added/removed/changed locally.
# Operations will be added to the a common operation queue along with the
# remote operations triggered by the remoteEventWatcher.
#
# TODO find deleted files/folders in the initial scan
class LocalWatcher

    constructor: (@basePath, @normalizer, @pouch, @events) ->

    # Start chokidar, the filesystem watcher
    # https://github.com/paulmillr/chokidar
    #
    # The callback is called when the initial scan is complete
    start: (callback) =>
        log.info 'Start watching filesystem for changes'

        @watcher = chokidar.watch '.',
            # Ignore our own .cozy-desktop directory
            ignored: /[\/\\]\.cozy-desktop/
            # Don't follow symlinks
            followSymlinks: false
            # Let paths in events be relative to this base path
            cwd: @basePath
            # Poll newly created files to detect when the write is finished
            awaitWriteFinish:
                stabilityThreshold: 1000
                pollInterval: 100
            # Filter out artifacts from editors with atomic writes
            atomic: true
            # With node 0.10 on linux, only polling is available
            interval: 1000
            binaryInterval: 2000

            .on 'add', @onAdd
            .on 'addDir', @onAddDir
            .on 'change', @onChange
            .on 'unlink', @onUnlink
            .on 'unlinkDir', @onUnlinkDir
            .on 'ready', callback
            .on 'error', (err) -> log.error err

    # New file detected
    onAdd: (filePath) =>
        if not filesystem.locked \
        and not filesystem.filesBeingCopied[filePath]?
            log.info "File added: #{filePath}"
            localEventWatcher.publisher.emit 'fileAddedLocally', filePath
            filesystem.isBeingCopied filePath, ->
                operationQueue.queue.push
                    operation: 'createFileRemotely'
                    file: filePath
                , ->

    # New directory detected
    onAddDir: (folderPath) =>
        if not filesystem.locked \
        and folderPath isnt localEventWatcher.path
            log.info "Directory added: #{folderPath}"
            localEventWatcher.publisher.emit 'folderAddedLocally', folderPath
            operationQueue.queue.push
                operation: 'createFolderRemotely'
                folder: folderPath
            , ->

    # File deletion detected
    onUnlink: (filePath) =>
        if not filesystem.locked and not fs.existsSync filePath
            log.info "File deleted: #{filePath}"
            localEventWatcher.publisher.emit 'fileDeletedLocally', filePath
            operationQueue.queue.push
                operation: 'deleteFileRemotely'
                file: filePath
            , ->

    # Folder deletion detected
    onUnlinkDir: (folderPath) =>
        if not filesystem.locked
            log.info "Folder deleted: #{folderPath}"
            localEventWatcher.publisher.emit 'folderDeletedLocally', folderPath
            operationQueue.queue.push
                operation: 'deleteFolderRemotely'
                folder: folderPath
            , ->

    # File update detected
    onChange: (filePath) =>
        filePath = path.join localEventWatcher.path, filePath
        if fs.existsSync filePath
            onChange filePath
        else
            setTimeout ->
                if fs.existsSync filePath
                    onChange filePath
            , 1000


onChange = (filePath) ->
    # Chokidar sometimes detect changes with a relative path
    # In this case we want to adjust the path to be consistent
    re = new RegExp "^#{localEventWatcher.path}"
    if not re.test filePath
        relativePath = filePath
        filePath = path.join localEventWatcher.path, filePath

    if not filesystem.locked \
    and not filesystem.filesBeingCopied[filePath]? \
    and fs.existsSync filePath
        log.info "File changed: #{filePath}"
        localEventWatcher.publisher.emit 'fileChangedLocally', filePath
        filesystem.isBeingCopied filePath, ->
            log.debug "#{relativePath} copy is finished."
            operationQueue.queue.push
                operation: 'updateFileRemotely'
                file: filePath
            , ->
                log.debug 'File uploaded remotely'


module.exports = LocalWatcher
