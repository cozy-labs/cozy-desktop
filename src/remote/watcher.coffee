async = require 'async'
clone = require 'lodash.clone'
path  = require 'path'
filterSDK = require('cozy-device-sdk').filteredReplication
log   = require('printit')
    prefix: 'Remote watcher'
    date: true


# Watch for changes from the remote couchdb and give them to the merge
#
# TODO add comments
# TODO refactor unit tests
class RemoteWatcher
    constructor: (@couch, @prep, @pouch, @deviceName) ->
        @side = 'remote'
        @errors  = 0
        @pending = 0

    # Stop listening to couchdb
    stopListening: ->
        @changes?.cancel()
        @changes = null

    # First time replication (when the databases is blank)
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
                log.info "#{rows.length} docs retrieved for #{model}."
                callback err

    # Listen to the Couchdb changes feed for files and folders updates
    # TODO use a view instead of a filter
    listenToChanges: (options, callback) =>
        @pouch.getRemoteSeq (err, seq) =>
            if err
                callback err
            else if seq is 0
                @initialReplication (err) =>
                    if err
                        callback err
                    else
                        @whenReady callback
            else
                @changes = @couch.client.changes
                    filter: filterSDK.getFilterName @deviceName
                    live: options.live
                    retry: true
                    since: seq
                    include_docs: true
                    heartbeat: 9500
                @changes
                    .on 'change', (change) =>
                        @errors = 0
                        @onChange change.doc, @changed(change)
                    .on 'error', (err) =>
                        @changes = null
                        retry = =>
                            @listenToChanges options, callback
                        @couch.ping (available) =>
                            if available
                                @backoff err, callback, retry
                            else
                                @couch.whenAvailable retry
                    .on 'complete', =>
                        @changes = null
                        @whenReady callback

    # Wait for all the changes from CouchDB has been saved in Pouch
    # to call the callback
    # TODO tests
    whenReady: (callback) =>
        if @pending is 0
            callback()
        else
            setTimeout (=> @whenReady callback), 100

    # When the replication fails, wait before trying again.
    # For the first error, we wait between 2s and 4s.
    # For next errors, it's 4 times longer.
    # After 5 errors, we give up.
    # TODO tests
    backoff: (err, fail, retry) =>
        @errors++
        log.warn 'An error occured during replication.'
        log.error err
        if @errors >= 5
            @errors = 0
            fail err
        else
            wait = (1 + Math.random()) * 500
            wait = ~~wait << (@errors * 2)   # ~~ is to coerce to an int
            setTimeout retry, wait

    # Take one change from the changes feed and give it to merge
    onChange: (doc, callback) =>
        log.info "OnChange", doc
        @pouch.byRemoteId doc._id, (err, was) =>
            if err and err.status isnt 404
                callback err
            else if doc._deleted
                if err or not was?
                    # It's fine if the file was deleted on local and on remote
                    callback()
                else
                    @prep.deleteDoc @side, was, callback
            else if doc.docType in ['folder', 'Folder'] or doc.binary?.file
                @putDoc doc, was, callback
            else
                callback()

    # Transform a remote document in a local one
    #
    # We are tolerant with the input. For example, we don't expect the docType
    # to be in lower case, and we accept files with no checksum (e.g. from
    # konnectors).
    createLocalDoc: (remote) ->
        docPath = remote.path or ''
        docName = remote.name or ''
        doc =
            path: path.join docPath, docName
            docType: remote.docType.toLowerCase()
            creationDate: remote.creationDate
            lastModification: remote.lastModification
            executable: remote.executable
            remote:
                _id:  remote._id
                _rev: remote._rev
        if doc.docType is 'file'
            doc.remote.binary =
                _id:  remote.binary.file.id
                _rev: remote.binary.file.rev
        for field in ['checksum', 'size', 'class', 'mime', 'tags', 'localPath']
            doc[field] = remote[field] if remote[field]
        return doc

    # Transform the doc and save it in pouchdb
    #
    # In CouchDB, the filepath is in the path and name fields.
    # In PouchDB, the filepath is in the path only.
    # And the _id/_rev from CouchDB are saved in the remote field in PouchDB.
    putDoc: (remote, was, callback) =>
        doc = @createLocalDoc remote
        if @prep.invalidPath doc
            log.error "Invalid id"
            log.error doc
            callback new Error 'Invalid path/name'
        else if not was
            @prep.addDoc @side, doc, callback
        else if was.path is doc.path
            @prep.updateDoc @side, doc, callback
        else if doc.checksum? and was.checksum is doc.checksum
            @prep.moveDoc @side, doc, was, callback
        else if doc.docType is 'folder' or was.remote._rev is doc._rev
            # Example: doc is modified + renamed on cozy with desktop stopped
            @prep.deleteDoc @side, was, (err) =>
                log.error err if err
                @prep.addDoc @side, doc, callback
        else
            # Example: doc is renamed on cozy while modified on desktop
            @removeRemote was, (err) =>
                log.error err if err
                @prep.addDoc @side, doc, callback

    # Remove the association between a document and its remote
    # It's useful when a file has diverged (updated/renamed both in local and
    # remote) while cozy-desktop was not running.
    removeRemote: (doc, callback) ->
        delete doc.remote
        delete doc.sides.remote
        @pouch.db.put doc, callback

    # Keep track of the sequence number and log errors
    # TODO test pending counts
    changed: (change) =>
        @pending++
        (err) =>
            @pending--
            if err
                log.error err, change
            else
                @pouch.setRemoteSeq change.seq, (err) ->
                    if err
                        log.warn 'Cannot save the remote sequence number'
                        log.error err


module.exports = RemoteWatcher
