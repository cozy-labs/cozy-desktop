async    = require 'async'
log      = require('printit')
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

    start: ->
        pouch.replicationDelay = 0
        operationQueue = require('./operation_queue')

        remoteEventWatcher.initialReplication (err, seq) ->
            process.exit(1) if err
            log.info "Replication batch is complete (last sequence: #{seq})"

            # Ensure that previous replication is properly finished.
            # remoteEventWatcher.cancel()

            log.info 'Start building your filesystem on your device.'
            operationQueue.makeFSSimilarToDB (err) ->
                process.exit(1) if err
                publisher.emit 'firstSyncDone'
                log.info 'All your files are now available on your device.'
                int = setInterval () ->
                    if pouch.replicationDelay is 1
                        clearInterval(int)
                    else
                        remoteEventWatcher.replicateFromRemote()
                        config.saveConfig()
                , 500

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
                        config.setRemoteSeq seq
                        callback null, seq


    replicateFromRemote: ->
        url = @url || config.getUrl()
        options =
            filter: (doc) ->
                doc.docType and (doc.docType.toLowerCase() is 'folder' or doc.docType.toLowerCase() is 'file')
            live: false
            since: config.getRemoteSeq()

        if pouch.replicationDelay is 0 and (not @replicatorFrom \
        or Object.keys(@replicatorFrom._events).length is 0)

            @replicatorFrom = pouch.db.replicate.from(url, options)

            .on 'complete', (info) ->
                if info.docs_written > 0
                    config.setRemoteSeq info.last_seq
                    log.info 'Database updated, applying changes to files'
                    remoteEventWatcher.applyChanges ->

            .on 'error', (err) ->
                if err?.status is 409
                    conflict.display err
                    log.error "Conflict, ignoring"
                else
                    log.error 'An error occured during replication.'
                    log.error err


    # Retrieve database changes and apply them to the filesystem.
    # NB: PouchDB manages another sequence number for the replication.
    applyChanges: (callback) ->
        options =
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            since: config.getLocalSeq()
            include_docs: true

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
                    async.eachSeries res.results
                                   , remoteEventWatcher.addToQueue
                                   , (err) ->
                        if err
                            log.error 'An error occured during DB changes application'
                            log.error err
                            callback err
                        else
                            log.debug 'Changes applied.'
                            publisher.emit 'changesApplied'
                            callback()
            else
                setTimeout ( -> apply res ), 1000

        pouch.db.changes(options)
        .on 'error', error
        .on 'complete', apply


    #
    # Define the proper task to perform on the filesystem and add it to the
    # operation queue.
    #
    addToQueue: (change, callback) ->
        config.setLocalSeq change.seq

        pouch.db.query 'localrev/byRevision'
                     , key: change.doc._rev
                     , (err, res) ->
            if res?.rows? and res.rows.length is 0

                docDeleted = change.deleted
                docAdded = change.doc.creationDate is change.doc.lastModification
                concernsFolder = change.doc.docType.toLowerCase() is 'folder'

                # Deletion
                if docDeleted
                    if concernsFolder
                        operation = 'deleteFolderLocally'
                    else
                        operation = 'deleteFileLocally'

                # Creation
                else if docAdded
                    if concernsFolder
                        operation = 'createFolderLocally'
                    else
                        operation = 'createFileLocally'

                # Modification
                else
                    if not concernsFolder
                        operation = 'moveFileLocally'
                    else
                        operation = 'moveFolderLocally'

                if operation?
                    require('./operation_queue').queue.push
                        operation: operation
                        doc: change.doc
                    , (err) ->
                        if err
                            log.error "An error occured while applying a change."
                            log.error "Operation #{operation}"
                            log.error change.doc
                            log.raw err

            callback()


    cancel: ->
        pouch.replicationDelay = 1
        config.saveConfig()
        @replicatorFrom.cancel()    if @replicatorFrom
        pouch.replicatorTo.cancel() if pouch.replicatorTo

    replicatorFrom: null

    url: null

    startSeq: null


module.exports = remoteEventWatcher
