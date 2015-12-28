async = require 'async'
log   = require('printit')
    prefix: 'Synchronize   '


# Sync listens to PouchDB about the metadata changes, and calls local and
# remote sides to apply the changes on the filesystem and remote CouchDB
# respectively.
#
# TODO handle an offline mode
class Sync

    constructor: (@pouch, @local, @remote) ->
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
        @stopped = false
        tasks = [
            (next) => @pouch.addAllViews next
        ]
        tasks.push @local.start  unless mode is 'pull'
        tasks.push @remote.start unless mode is 'push'
        async.waterfall tasks, (err) =>
            if err
                callback err
            else
                async.forever @sync, callback

    # Stop the synchronization
    stop: (callback) =>
        @stopped = true
        if @changes
            @changes.cancel()
            @changes = null
        async.parallel [
            (done) => @local.stop done
            (done) => @remote.stop done
        ], callback

    # Start taking changes from pouch and applying them
    sync: (callback) =>
        @pop (err, change) =>
            return if @stopped
            if err
                log.error err
                callback err
            else
                @apply change, (err) ->
                    err = null if @stopped
                    callback err

    # Take the next change from pouch
    # We filter with the byPath view to reject design documents
    #
    # Note: it is difficult to pick only one change at a time because pouch can
    # emit several docs in a row, and `limit: 1` seems to be not effective!
    pop: (callback) =>
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
            @changes = @pouch.db.changes(opts)
                .on 'change', (info) =>
                    if @changes
                        @changes.cancel()
                        @changes = null
                        callback null, info
                .on 'error', (err) =>
                    if @changes
                        @changes = null
                        callback err, null

    # Apply a change to both local and remote
    # At least one side should say it has already this change
    # In some cases, both sides have the change
    apply: (change, callback) =>
        log.debug 'apply', change
        doc = change.doc
        [side, sideName, rev] = @selectSide doc
        done = @applied(change, sideName, callback)

        switch
            when not side
                @pouch.setLocalSeq change.seq, callback
            when doc.docType is 'file'
                @fileChanged doc, side, rev, done
            when doc.docType is 'folder'
                @folderChanged doc, side, rev, done
            else
                callback new Error "Unknown doctype: #{doc.docType}"

    # Select which side will apply the change
    # It returns the side, its name, and also the last rev applied by this side
    selectSide: (doc) =>
        localRev  = doc.sides.local  or 0
        remoteRev = doc.sides.remote or 0
        if localRev > remoteRev
            return [@remote, 'remote', remoteRev]
        else if remoteRev > localRev
            return [@local, 'local', localRev]
        else
            log.debug 'Nothing to do'
            return []

    # Keep track of the sequence number, save side rev, and log errors
    # TODO when applying a change fails, put it again in some queue for retry
    applied: (change, side, callback) =>
        (err) =>
            if err
                log.error err
                callback err
            else
                log.debug "Applied #{change.seq}"
                @pouch.setLocalSeq change.seq, (err) =>
                    log.error err if err
                    doc = change.doc
                    if doc._deleted
                        callback err
                    else
                        # TODO move this to another method + add tests
                        rev = @pouch.extractRevNumber(doc) + 1
                        for s in ['local', 'remote']
                            doc.sides[s] = rev
                        @pouch.db.put doc, (err) =>
                            # TODO explain conflict if the doc was updated
                            # (e.g thumbnail added by the remote)
                            if err?.status is 409
                                @pouch.db.get doc._id, (err, doc) =>
                                    if err
                                        callback err
                                    else
                                        doc.sides[side] = rev
                                        @pouch.db.put doc, callback
                            else
                                callback err

    # If a file has been changed, we had to check what operation it is.
    # For a move, the first call will just keep a reference to the document,
    # and only at the second call, the move operation will be executed.
    fileChanged: (doc, side, rev, callback) =>
        switch
            when doc._deleted and rev is 0
                callback()
            when @moveFrom
                [from, @moveFrom] = [@moveFrom, null]
                if from.moveTo is doc._id
                    side.moveFile doc, from, callback
                else
                    log.error "Invalid move"
                    log.error from
                    log.error doc
                    callback new Error 'Invalid move'
                    # TODO
            when doc.moveTo
                @moveFrom = doc
                callback()
            when doc._deleted
                side.deleteFile doc, callback
            when rev is 0
                side.addFile doc, callback
            else
                @pouch.getPreviousRev doc._id, rev, (err, old) ->
                    log.debug old
                    if err or old.checksum isnt doc.checksum
                        side.overwriteFile doc, old, callback
                    else
                        side.updateFileMetadata doc, old, callback

    # Same as fileChanged, but for folder
    folderChanged: (doc, side, rev, callback) =>
        switch
            when doc._deleted and rev is 0
                callback()
            when @moveFrom
                [from, @moveFrom] = [@moveFrom, null]
                if from.moveTo is doc._id
                    side.moveFolder doc, from, callback
                else
                    log.error "Invalid move"
                    log.error from
                    log.error doc
                    callback new Error 'Invalid move'
                    # TODO
            when doc.moveTo
                @moveFrom = doc
                callback()
            when doc._deleted
                side.deleteFolder doc, callback
            when rev is 0
                side.addFolder doc, callback
            else
                @pouch.getPreviousRev doc._id, rev, (err, old) ->
                    side.updateFolder doc, old, callback


module.exports = Sync
