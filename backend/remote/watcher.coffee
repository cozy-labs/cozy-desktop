async = require 'async'
clone = require 'lodash.clone'
path  = require 'path'
log   = require('printit')
    prefix: 'Remote watcher'


# Watch for changes from the remote couchdb and give them to the merge
#
# TODO add comments
# TODO refactor unit tests
class RemoteWatcher
    constructor: (@couch, @prep, @pouch) ->
        @side = 'remote'
        @pending = 0

    # First time replication (when the databases is blank)
    #
    # Filtered replication or changes feed is slow with a lot of documents and
    # revisions. We prefer to copy manually these documents for the initial
    # replication.
    #
    # TODO use it somewhere, or remove this method
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
                    @whenReady callback

    # TODO comments, tests
    whenReady: (callback) =>
        if @pending is 0
            callback()
        else
            setTimeout (=> @whenReady callback), 100

    # Take one change from the changes feed and give it to merge
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
            remote:
                _id:  remote._id
                _rev: remote._rev
        if doc.docType is 'file'
            doc.remote.binary =
                _id:  remote.binary.file.id
                _rev: remote.binary.file.rev
        for field in ['checksum', 'size', 'class', 'mime', 'tags']
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
        else
            @prep.deleteDoc @side, was, (err) =>
                log.error err if err
                @prep.addDoc @side, doc, callback

    # Keep track of the sequence number and log errors
    # TODO test pending counts
    changed: (change) =>
        @pending++
        (err) =>
            @pending--
            if err
                log.error err
                log.debug change
            else
                @pouch.setRemoteSeq change.seq, (err) ->
                    if err
                        log.warn 'Cannot save the remote sequence number'
                        log.error err


module.exports = RemoteWatcher
