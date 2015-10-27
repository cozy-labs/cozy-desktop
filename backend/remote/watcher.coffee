async = require 'async'
path  = require 'path'
log   = require('printit')
    prefix: 'Remote watcher'


# Watch for changes from the remote couchdb and give them to the normalizer
#
# TODO add comments
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
                @onChange row.value, (err) ->
                    if err
                        log.error 'Failed to copy one doc'
                        log.error err
                    cb()
            , (err) ->
                log.debug "#{rows.length} docs retrieved for #{model}."
                callback err

    # Listen to the Couchdb changes feed for files and folders updates
    # TODO use a view instead of a filter
    # TODO add integration tests
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
            @changes
                .on 'change', (change) =>
                    @onChange change.doc, @changed(change)
                .on 'error', (err) =>
                    @changes = null
                    log.warn 'An error occured during replication.'
                    log.error err
                    callback err
                .on 'complete', =>
                    @changes = null
                    callback()

    # Take one change from the changes feed and give it to normalizer.
    #
    # TODO should we check was.remote._rev and doc._rev for conflict
    # like local has move file and remote overwrite it?
    onChange: (doc, callback) =>
        log.debug doc
        @pouch.byRemoteId doc._id, (err, was) =>
            if err and err.status isnt 404
                callback err
            else if doc._deleted
                if err
                    # It's fine if the file was deleted on local and on remote
                    callback()
                else
                    @normalizer.deleteDoc was, callback
            else
                doc.remote =
                    _id: doc._id
                    _rev: doc._rev
                doc._id = path.join doc.path, doc.name
                delete doc._rev
                delete doc.path
                delete doc.name
                if not was or was._id is doc._id
                    @normalizer.putDoc doc, callback
                else if was.checksum is doc.checksum
                    @normalizer.moveDoc doc, was, callback
                else
                    @normalizer.deleteDoc was, (err) =>
                        log.error err if err
                        @normalizer.putDoc doc, callback

    # Keep track of the sequence number and log errors
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
