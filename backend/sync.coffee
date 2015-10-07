async = require 'async'
log   = require('printit')
    prefix: 'Synchronize   '


class Sync
    constructor: (@config, @pouch, @local, @remote, @events) ->

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
        tasks = [@pouch.addAllFilters]
        tasks.push @local.start  unless mode is 'readonly'
        tasks.push @remote.start unless mode is 'writeonly'
        async.waterfall task, (err) =>
            if err
                callback err
            else
                @events.emit 'firstMetadataSyncDone'
                # TODO find a way to emit 'firstSyncDone'
                # queue.makeFSSimilarToDB syncToCozy, (err) ->
                async.forever @sync, callback

    # Start taking changes from pouch and applying them
    sync: (callback) =>
        @pop (err, change) =>
            if err
                callback err
            else
                @apply change, callback

    # Take the next change from pouch
    pop: (callback) =>
        opts =
            live: true
            limit: 1
            since: @config.getLocalSeq()
            include_docs: true
            returnDocs: false
        @pouch.changes(opts)
            .on 'change', (info) -> callback null, info
            .on 'error',  (err)  -> callback err, null

    # Apply a change to both local and remote
    # At least one side should say it has already this change
    # In some cases, both sides have the change
    apply: (change, callback) =>
        console.log 'apply'
        console.log change
        @config.setLocalSeq 0


module.exports = Sync
