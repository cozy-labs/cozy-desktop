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
        @pouch.getLocalSeq (err, seq) =>
            return callback err if err
            opts =
                live: true
                since: seq
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
    # TODO note the success in the doc
    # TODO when applying a change fails, put it again in some queue for retry
    apply: (change, callback) =>
        log.debug 'apply', change
        cb = (err) =>
            if err
                log.error err
                callback err
            else
                log.debug "Applied #{change.seq}"
                @pouch.setLocalSeq change.seq, callback
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
                else
                    @folderChanged doc, cb
            else
                cb new Error "Unknown doctype: #{doc.docType}"

    # If a file has been changed, we had to check the previous rev from pouch
    # to decide if it's a new file that has been added, or a move/rename
    fileChanged: (doc, callback) =>
        @fileAdded doc, callback
        return # TODO detect file move
        @pouch.getPreviousRev doc._id, (err, old) =>
            if err or not old
                @fileAdded doc, callback
            else if old.name? and old.path? and
                    old.name is doc.name and
                    old.path is doc.path
                @fileAdded doc, callback
            else
                @fileMoved doc, old, callback

    # Same as fileChanged, but for folder
    folderChanged: (doc, callback) =>
        @folderAdded doc, callback
        return # TODO detect folder move
        @pouch.getPreviousRev doc._id, (err, old) =>
            if err or not old
                @folderAdded doc, callback
            else if old.name? and old.path? and
                    old.name is doc.name and
                    old.path is doc.path
                @folderAdded doc, callback
            else
                @folderMoved doc, old, callback

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
            (next) => @local.addFolder  doc, next
            (next) => @remote.addFolder doc, next
        ], callback

    # Let local and remote know that a folder has been moved
    folderMoved: (doc, callback) =>
        async.waterfall [
            (next) => @local.moveFolder  doc, next
            (next) => @remote.moveFolder doc, next
        ], callback

    # Let local and remote know that a folder has been deleted
    folderDeleted: (doc, callback) =>
        async.waterfall [
            (next) => @local.deleteFolder  doc, next
            (next) => @remote.deleteFolder doc, next
        ], callback


module.exports = Sync
