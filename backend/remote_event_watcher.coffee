util  = require 'util'
async = require 'async'
log   = require('printit')
    prefix: 'Remote watcher'

#
# Local backend files
#
filesystem = require './filesystem'
config = require './config'
pouch = require './db'
publisher = require './publisher'
conflict = require './conflict'

#
# This file contains the database replicator that will trigger operations when
# a file or a folder has been added/removed/changed remotely.
# Operations will be added to the a common operation queue along with the
# local operations triggered by the localEventWatcher.
#
# See `operationQueue.coffee` for more information.
#
remoteEventWatcher =

    replicatorFrom: null
    url: null
    startSeq: null

    # Run first time replication (match FS and sequence number with remote) and
    # run replication regularly
    init: (syncToCozy, callback) ->
        operationQueue = require './operation_queue'

        log.info 'Run first synchronisation...'
        remoteEventWatcher.initialReplication (err, seq) ->
            # TODO better error management, not just process.exit
            process.exit(1) if err
            log.info "First replication is complete (last seq: #{seq})"

            log.info 'Start building your filesystem on your device.'
            operationQueue.makeFSSimilarToDB syncToCozy, (err) ->
                process.exit(1) if err
                log.info 'Filesystem built on your device.'
                publisher.emit 'firstSyncDone'

                callback()

    # Start metadata sync with remote. Sync is based on replications every 2s.
    # TODO: do not run a replication if another replication is running.
    start: (callback) ->
        pouch.replicationDelay = 0
        int = setInterval ->
            # 1 is code for cancelation
            if pouch.replicationDelay is 1
                log.debug "Replication canceled"
                clearInterval int
            else
                remoteEventWatcher.replicateFromRemote()
                config.saveConfig()
        , 2000
        callback() if callback?

    # First time replication:
    # * Match local FS with remote Cozy FS
    # * Set starting sequence at last remote sequence
    initialReplication: (callback) ->
        pouch.getLastRemoteChangeSeq (err, seq) ->
            if err
                log.error "An error occured contacting your remote Cozy"
                log.error err
                callback err if callback?
            else
                # Copy documents manually to avoid getting all the changes
                async.series [
                    (next) -> pouch.copyViewFromRemote 'folder', next
                    (next) -> pouch.copyViewFromRemote 'file', next
                ], (err) ->
                    if err
                        log.error "An error occured copying database"
                        log.error err
                        callback err if callback?
                    else
                        log.debug "All changes retrieved."
                        log.info 'All your files are available on your device.'
                        config.setRemoteSeq seq
                        callback null, seq

    replicateFromRemote: ->
        url = @url or config.getUrl()
        options =
            filter: (doc) ->
                res = false
                if doc.docType?
                    isFolder = doc.docType.toLowerCase() is 'folder'
                    isFile = doc.docType.toLowerCase() is 'file'
                    res = isFolder or isFile
                res
            live: false
            since: config.getRemoteSeq()

        options = config.augmentPouchOptions options

        if pouch.replicationDelay is 0 and (not @replicatorFrom \
        or Object.keys(@replicatorFrom._events).length is 0)
            log.debug "start replication batch from #{config.getRemoteSeq()}"
            reconnecting = false

            @replicatorFrom = pouch.db.replicate.from url, options

            .on 'complete', (info) ->
                if reconnecting
                    log.info 'Connection is back!'
                    reconnecting = false

                if info.docs_written > 0
                    config.setRemoteSeq info.last_seq
                    log.info 'Database updated, applying changes to files...'
                    remoteEventWatcher.applyChanges ->
                        log.info 'Changes applied.'
                else
                    log.debug "no change noticed"

            .on 'error', (err, info) ->
                if err?.status is 409
                    conflict.display err, info
                    log.error "Conflict, ignoring"
                else
                    # TODO handle disconnection
                    log.warn 'An error occured during replication.'

                    if err.status is 400
                        log.warn 'Connection error, try to reconnect in 5s...'
                        reconnecting = true

                    log.error err


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
                    publisher.emit 'applyingChanges'
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
                        publisher.emit 'changesApplied'
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
                    require('./operation_queue').queue.push
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

    cancel: ->
        pouch.replicationDelay = 1
        config.saveConfig()
        @replicatorFrom?.cancel()
        pouch.replicatorTo?.cancel()
        # TODO reset @replicatorFrom and pouch.replicatorTo to null?


module.exports = remoteEventWatcher
