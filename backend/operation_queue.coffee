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
couch = require './remote_db'
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
                    couch.replicateToRemote()
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
    publisher: null

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
    # Macro function
    #
    makeFSSimilarToDB: (syncToCozy, callback) ->
        operations = [
            (cb) => @queue.push operation: 'ensureAllFoldersLocally', cb
            (cb) => @queue.push operation: 'ensureAllFilesLocally', cb
        ]
        if syncToCozy
            operations = operations.concat [
                (cb) => @queue.push operation: 'ensureAllFoldersRemotely', cb
                (cb) => @queue.push operation: 'ensureAllFilesRemotely', cb
            ]
        async.series operations, callback


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


    ### From remote_event_watcher ###

    # Retrieve database changes and apply them to the filesystem.
    # NB: PouchDB manages another sequence number for the replication.
    applyChanges: (callback) ->
        error = (err) ->
            if err?.status? and err.status is 404
                log.info "No file nor folder found remotely"
                callback()
            else
                log.error "An error occured while applying changes"
                log.error "Stop applying changes."
                callback err

        apply = (res) ->
            if pouch.replicationDelay is 0
                if res.results.length > 0
                    log.debug "Applying #{res.results.length} changes..."
                    remoteEventWatcher.publisher.emit 'applyingChanges'
                    #
                    # Add changes to queue one by one
                    #
                    async.eachSeries res.results, (operation, next) ->
                        details = util.inspect operation, colors: true
                        log.debug "Applying remote change: #{details}..."
                        remoteEventWatcher.addToQueue operation, (err) ->
                            if err
                                log.error 'Error occured while applying change.'
                                log.error err
                            else
                                log.debug "Remote change applied successfully."
                            next()
                    , ->
                        log.debug 'Changes applied.'
                        remoteEventWatcher.publisher.emit 'changesApplied'
                        callback()
            else
                setTimeout ->
                    apply res
                , 1000

        options =
            filter: (doc) ->
                doc.docType and (
                    doc.docType.toLowerCase() is 'folder' or
                    doc.docType.toLowerCase() is 'file'
                )
            since: config.getLocalSeq()
            include_docs: true

        pouch.db.changes(options)
        .on 'error', error
        .on 'complete', apply

    # Define the proper task to perform on the filesystem and add it to the
    # operation queue.
    addToQueue: (change, callback) ->
        config.setLocalSeq change.seq

        params = key: change.doc._rev
        pouch.db.query 'localrev/byRevision', params, (err, res) ->
            if res?.rows? and res.rows.length is 0

                push_operation = (operation) ->
                    log.debug "addToQueue", operation, change
                    remoteEventWatcher.queue.push
                        operation: operation
                        doc: doc
                    , (err) ->
                        if err
                            log.error "An error occured while applying a change"
                            log.error "Operation #{operation}"
                            log.error change.doc
                            log.raw err
                    callback() # TODO is it at its right place?

                doc = change.doc
                docDeleted = change.deleted
                folderAdded = doc.lastModification <= doc.creationDate
                concernsFolder = doc.docType.toLowerCase() is 'folder'

                if concernsFolder
                    if docDeleted
                        push_operation 'deleteFolderLocally'
                    else if folderAdded
                        push_operation 'createFolderLocally'
                    else
                        push_operation 'moveFolderLocally'

                else
                    if docDeleted
                        push_operation 'deleteFileLocally'
                    else
                        pouch.getPreviousRev doc._id, (err, prev) ->
                            if not prev
                                push_operation 'createFileLocally'
                            else if prev.name is doc.name and
                                    prev.path is doc.path
                                push_operation 'createFileLocally'
                            else
                                push_operation 'moveFileLocally'

module.exports = operationQueue
