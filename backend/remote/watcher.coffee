async = require 'async'
log   = require('printit')
    prefix: 'Remote watcher'

Conflict = require '../conflict'


# Watch for changes from the remote couchdb and give them to the normalizer
class RemoteWatcher
    constructor: (@couch, @normalizer, @pouch) ->

    # First time replication
    #
    # Filtered replication or changes feed is slow with a lot of documents and
    # revisions. We prefer to copy manually these documents for the initial
    # replication.
    #
    # TODO use a single view
    # TODO add integration tests
    initialReplication: (callback) ->
        @couch.getLastRemoteChangeSeq (err, seq) =>
            if err
                log.error "An error occured contacting your remote Cozy"
                log.error err
                callback err
            else
                async.series [
                    (next) => @copyDocsFromRemoteView 'folder', next
                    (next) => @copyDocsFromRemoteView 'file', next
                ], (err) =>
                    if err
                        log.error "An error occured copying database"
                        log.error err
                        callback err
                    else
                        log.info 'All your files are available on your device.'
                        @pouch.setRemoteSeq seq, callback

    # Manual replication for a doctype:
    # copy the documents from a remote view to the local pouchdb
    copyDocsFromRemoteView: (model, callback) =>
        @couch.getFromRemoteView model, (err, rows) =>
            return callback err  if err
            return callback null unless rows?.length
            async.eachSeries rows, (row, cb) =>
                @normalizer.putDoc row.value, (err) ->
                    if err
                        log.error 'Failed to copy one doc'
                        log.error err
                    cb()
            , (err) ->
                log.debug "#{rows.length} docs retrieved for #{model}."
                callback err

    # Listen to the Couchdb changes feed for files and folders updates
    # TODO add integration tests
    # TODO use a view instead of a filter
    listenToChanges: (options, callback) =>
        @pouch.getRemoteSeq (err, seq) =>
            return callback err if err
            @changes = @couch.client.changes
                filter: (doc) ->
                    doc.docType?.toLowerCase() in ['file', 'folder']
                live: options.live
                retry: true
                since: seq
                include_docs: true
            @changes.on 'change', @onChange
                .on 'error', (err) =>
                    @changes = null
                    log.warn 'An error occured during replication.'
                    log.error err
                    callback err
                .on 'complete', =>
                    @changes = null
                    callback()

    # Take one change from the changes feed and give it to normalizer.
    # Also, keep track of the sequence number.
    # TODO add unit tests
    onChange: (change) =>
        # TODO move
        if change.deleted
            @normalizer.deleteDoc change.doc, @changed(change)
        else
            @normalizer.putDoc change.doc, @changed(change)

    changed: (change) =>
        (err) =>
            if err
                log.error err
                log.debug change
            else
                @pouch.setRemoteSeq change.seq, (err) ->
                    if err
                        log.warn 'Cannot save the remote sequence number'
                        log.error err


module.exports = RemoteWatcher
