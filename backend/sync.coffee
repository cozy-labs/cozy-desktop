async = require 'async'
log   = require('printit')
    prefix: 'Synchronize   '


# Sync listens to PouchDB about the metadata changes, and calls local and
# remote sides to apply the changes on the filesystem and remote CouchDB
# respectively.
#
# TODO find a better name that Sync
class Sync

    constructor: (@pouch, @local, @remote, @events) ->
        @local.other = @remote
        @remote.other = @local

    # Start to synchronize the remote cozy with the local filesystem
    # First, start metadata synchronization in pouch, with the watchers
    # Then, when a stable state is reached, start applying changes from pouch
    #
    # The mode can be:
    # - pull if only changes from the remote cozy are applied to the fs
    # - push if only changes from the fs are applied to the remote cozy
    # - full for the full synchronization of the both sides
    #
    # The callback is called only for an error
    start: (mode, callback) =>
        tasks = [
            (next) => @pouch.addAllViews next
        ]
        tasks.push @local.start  unless mode is 'pull'
        tasks.push @remote.start unless mode is 'push'
        async.waterfall tasks, (err) =>
            if err
                callback err
            else
                @events.emit 'firstMetadataSyncDone'
                # TODO queue.makeFSSimilarToDB syncToCozy, (err) ->
                async.forever @sync, callback

    # Start taking changes from pouch and applying them
    # TODO find a way to emit 'firstSyncDone'
    # TODO handle an offline mode
    sync: (callback) =>
        @pop (err, change) =>
            if err
                callback err
            else
                @apply change, callback

    # Take the next change from pouch
    # We filter with the byPath view to reject design documents
    #
    # Note: it is really difficult to pick only one change at a time
    # because pouch can emit several docs in a row and limit: 1 seems
    # to be not effective!
    #
    # TODO look also to the retry queue for failures
    pop: (callback) =>
        done = false
        @pouch.getLocalSeq (err, seq) =>
            return callback err if err
            opts =
                live: true
                limit: 1
                since: seq
                include_docs: true
                returnDocs: false
                filter: '_view'
                view: 'byPath'
            @pouch.db.changes(opts)
                .on 'change', (info) ->
                    unless done
                        done = true
                        @cancel()
                        callback null, info
                .on 'error',  (err) ->
                    done = true
                    callback err, null

    # Apply a change to both local and remote
    # At least one side should say it has already this change
    # In some cases, both sides have the change
    #
    # TODO note the success in the doc
    # TODO when applying a change fails, put it again in some queue for retry
    apply: (change, callback) =>
        log.debug 'apply', change
        doc = change.doc
        switch
            when doc.docType is 'file'
                @fileChanged doc, @applied(change, callback)
            when doc.docType is 'folder'
                @folderChanged doc, @applied(change, callback)
            else
                # TODO if cozy-desktop was restarted, does a deleted doc have a
                # docType? Or should we fetch the previous rev to find it?
                callback new Error "Unknown doctype: #{doc.docType}"

    # Keep track of the sequence number and log errors
    applied: (change, callback) =>
        (err) =>
            if err
                log.error err
                callback err
            else
                log.debug "Applied #{change.seq}"
                @pouch.setLocalSeq change.seq, callback
                # TODO
                # - update applying side rev number
                # - save in place doc

    # If a file has been changed, we had to check what operation it is.
    # For a move, the first call will just keep a reference to the document,
    # and only at the second call, the move operation will be executed.
    #
    # TODO we should first select a side, then load last rev for this side
    # and finally decide which action to take
    fileChanged: (doc, callback) =>
        if @moveFrom
            [from, @moveFrom] = [@moveFrom, null]
            if from.moveTo is doc._id
                @fileMoved doc, from, callback
            else
                log.error "Invalid move"
                log.error from
                log.error doc
                callback new Error 'Invalid move'
        else if doc.moveTo
            @moveFrom = doc
            callback()
        else if doc._deleted
            @fileDeleted doc, callback
        # TODO find something better than /^1-/
        # - the changes feed can zap this rev and only give us a future rev
        # - what if a file is deleted and then recreated?
        else if @pouch.extractRevNumber(doc) is 1
            @fileAdded doc, callback
        else
            # TODO metadata update and overwrite should be 2 separate actions
            @fileUpdated doc, callback

    # Same as fileChanged, but for folder
    folderChanged: (doc, callback) =>
        if @moveFrom
            [from, @moveFrom] = [@moveFrom, null]
            if from.moveTo is doc._id
                @folderMoved doc, from, callback
            else
                log.error "Invalid move"
                log.error from
                log.error doc
                callback new Error 'Invalid move'
        else if doc.moveTo
            @moveFrom = doc
            callback()
        else if doc._deleted
            @folderDeleted doc, callback
        else if @pouch.extractRevNumber(doc) is 1
            @folderAdded doc, callback
        else
            @folderUpdated doc, callback

    # Apply the iterator function on local/remote
    # It selects only the side that hasn't make the last modification
    selectSide: (doc) =>
        localRev  = doc.sides.local  or 0
        remoteRev = doc.sides.remote or 0
        if localRev > remoteRev
            return @remote
        else if remoteRev > localRev
            return @local
        else
            log.error 'Both sides have applied this change'
            # TODO

    # Let local / remote know that a file has been added
    fileAdded: (doc, callback) =>
        @selectSide(doc).addFile doc, callback

    # Let local / remote know that a file has been updated
    fileUpdated: (doc, callback) =>
        @selectSide(doc).updateFile doc, callback

    # Let local / remote know that a file has been moved
    fileMoved: (doc, old, callback) =>
        @selectSide(doc).moveFile doc, old, callback

    # Let local / remote know that a file has been deleted
    fileDeleted: (doc, callback) =>
        @selectSide(doc).deleteFile doc, callback

    # Let local / remote know that a folder has been added
    folderAdded: (doc, callback) =>
        @selectSide(doc).addFolder doc, callback

    # Let local / remote know that a folder has been updated
    folderUpdated: (doc, callback) =>
        @selectSide(doc).updateFolder doc, callback

    # Let local / remote know that a folder has been moved
    folderMoved: (doc, old, callback) =>
        @selectSide(doc).moveFolder doc, old, callback

    # Let local / remote know that a folder has been deleted
    folderDeleted: (doc, callback) =>
        @selectSide(doc).deleteFolder doc, callback


module.exports = Sync
