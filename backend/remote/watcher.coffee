async = require 'async'
log   = require('printit')
    prefix: 'Remote watcher'

Conflict = require '../conflict'


class RemoteWatcher
    constructor: (@couch, @normalizer, @pouch, @config) ->

    # First time replication:
    # * Match local FS with remote Cozy FS
    # * Set starting sequence at last remote sequence
    initialReplication: (callback) ->
        @couch.getLastRemoteChangeSeq (err, seq) =>
            if err
                log.error "An error occured contacting your remote Cozy"
                log.error err
                callback err
            else
                # Filtered replication is slow with a lot of documents.
                # So, we prefer to copy manually these documents for the
                # initial replication.
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
                        @config.setRemoteSeq seq
                        callback null, seq

    # Manual replication for a doctype:
    # copy the documents from a remote view to the local pouchdb
    copyDocsFromRemoteView: (model, callback) =>
        @couch.getFromRemoteView model, (err, rows) =>
            return callback err  if err
            return callback null unless rows?.length
            async.eachSeries rows, (doc, cb) =>
                doc = doc.value
                # TODO use Normalizer
                # XXX new_edits: false is used to preserve the _rev from couch
                @pouch.db.put doc, new_edits: false, (err) ->
                    if err
                        log.error 'Failed to copy one doc'
                        log.error err
                    cb()
            , (err) ->
                log.debug "#{rows.length} docs retrieved for #{model}."
                callback err

    # Start metadata sync with remote (live filtered replication)
    # TODO remove replication and use normalizer
    startReplication: =>
        if @replicator
            log.error "Replication is already running"
            return

        options = @config.augmentCouchOptions
            filter: (doc) ->
                doc.docType?.toLowerCase() is 'Folder' or
                doc.docType?.toLowerCase() is 'File'
            live: true
            retry: true
            since: @config.getRemoteSeq()

        @replicator = @pouch.db.replicate.from @couch.url, options
            .on 'change', (info) ->
                # TODO save seq number to config
                console.log 'Change', info
            .on 'error', (err) =>
                if err?.status is 409
                    Conflict.display err, info
                    log.error "Conflict, ignoring"
                else
                    log.warn 'An error occured during replication.'
                    log.error err
                    log.warn 'Try to reconnect in 5s...'
                    @replicator = null
                    setTimeout @startReplication, 5000

    # Stop the live replication
    stopReplication: ->
        @replicator?.cancel()
        @replicator = null


module.exports = RemoteWatcher
