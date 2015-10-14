async = require 'async'
log   = require('printit')
    prefix: 'Synchronize   '


class Sync

    # TODO remove @config and store local seq in pouch
    constructor: (@config, @pouch, @local, @remote, @events) ->
        @local.other = @remote
        @remote.other = @local

    # Start to synchronize the remote cozy with the local filesystem
    # First, start metadata synchronization in pouch, with the watchers
    # Then, when a stable state is reached, start applying changes from pouch
    #
    # The mode can be:
    # - readonly  if only changes from the remote cozy are applied to the fs
    # - writeonly if only changes from the fs are applied to the remote cozy
    # - full for the full synchronization of the both sides
    #
    # The callback is called only for an error
    start: (mode, callback) =>
        tasks = [
            (next) => @pouch.addAllViews next
        ]
        tasks.push @local.start  unless mode is 'readonly'
        tasks.push @remote.start unless mode is 'writeonly'
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
    #
    # TODO look also to the retry queue for failures
    pop: (callback) =>
        opts =
            live: true
            since: @config.getLocalSeq()
            include_docs: true
            returnDocs: false
        @pouch.db.changes(opts)
            .on 'change', (info) ->
                @cancel()
                callback null, info
            .on 'error',  (err) ->
                callback err, null

    # Return a boolean to indicate if this is a design or local document
    isSpecial: (doc) ->
        not doc.docType?

    # Apply a change to both local and remote
    # At least one side should say it has already this change
    # In some cases, both sides have the change
    #
    # TODO maybe we can put more infos in a change (s/del/put/ for deleted doc)
    # TODO note the success in the doc
    # TODO when applying a change fails, put it again in some queue for retry
    apply: (change, callback) =>
        log.debug 'apply', change
        cb = (err) =>
            @config.setLocalSeq change.seq
            callback err
        doc = change.doc
        docType = doc.docType?.toLowerCase?()
        switch
            when @isSpecial doc
                # TODO use a filter on db.changes to avoid this case?
                cb()
            when docType is 'file'
                if change.deleted
                    @fileDeleted doc, cb
                else
                    @fileChanged doc, cb
            when docType is 'folder'
                if change.deleted
                    @folderDeleted doc, cb
                # TODO use the same strategy as for files
                else if doc.lastModification <= doc.creationDate
                    @folderAdded doc, cb
                else
                    @folderMoved doc, cb
            else
                cb "Unknown doctype: #{doc.docType}"

    # If a file has been changed, we had to check the previous rev from pouch
    # to decide if it's a new file that has been added, or a move/rename
    fileChanged: (doc, callback) =>
        @pouch.getPreviousRev doc._id, (err, old) =>
            if err or not old
                @fileAdded doc, callback
            else if old.name? and old.path? and
                    old.name is doc.name and
                    old.path is doc.path
                @fileAdded doc, callback
            else
                @fileMoved doc, old, callback

    # Let local and remote know that a file has been added
    fileAdded: (doc, callback) =>
        async.waterfall [
            (next) => @local.addFile  doc, next
            (next) => @remote.addFile doc, next
        ], callback

    # Let local and remote know that a file has been moved
    fileMoved: (doc, old, callback) =>
        async.waterfall [
            (next) => @local.moveFile  doc, old, next
            (next) => @remote.moveFile doc, old, next
        ], callback

    # Let local and remote know that a file has been deleted
    fileDeleted: (doc, callback) =>
        async.waterfall [
            (next) => @local.deleteFile  doc, next
            (next) => @remote.deleteFile doc, next
        ], callback

    # Let local and remote know that a folder has been added
    folderAdded: (doc, callback) =>
        async.waterfall [
            (next) => @local.addFile  doc, next
            (next) => @remote.addFile doc, next
        ], callback

    # Let local and remote know that a folder has been moved
    folderMoved: (doc, callback) =>
        async.waterfall [
            (next) => @local.moveFile  doc, next
            (next) => @remote.moveFile doc, next
        ], callback

    # Let local and remote know that a folder has been deleted
    folderDeleted: (doc, callback) =>
        async.waterfall [
            (next) => @local.deleteFile  doc, next
            (next) => @remote.deleteFile doc, next
        ], callback


module.exports = Sync
