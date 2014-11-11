fs         = require 'fs'
path       = require 'path'
touch      = require 'touch'
request    = require 'request-json-light'
urlParser  = require 'url'
mkdirp     = require 'mkdirp'
async      = require 'async'
log        = require('printit')
    prefix: 'Replication'

pouch      = require './db'
config     = require './config'
filesystem = require './filesystem'
binary     = require './binary'

filters = []


module.exports = replication =

    replicationIsRunning: false
    treeIsBuilding: false


    # Get from info object last replication sequence number.
    getInfoSeq: (info) ->
        if info?
            if info.last_seq?
                since = info.last_seq
            else if info.pull?.last_seq?
                since = info.pull.last_seq
            else
                since = 'now'
        else
            since = config.getSeq()


    getUrl: ->
        remoteConfig = config.getConfig()
        deviceName = config.getDeviceName()
        url = urlParser.parse remoteConfig.url
        url.auth = "#{deviceName}:#{remoteConfig.devicePassword}"
        url = "#{urlParser.format(url)}cozy"


    # Register device remotely then returns credentials given by remote Cozy.
    # This credentials will allow the device to access to the Cozy database.
    registerDevice: (options, callback) ->
        client = request.newClient options.url
        client.setBasicAuth 'owner', options.password

        data =
            login: options.deviceName

        client.post 'device/', data, (err, res, body) ->
            if err
                callback err
            if body.error?
                if body.error is 'string'
                    log.error body.error
                else
                    callback body.error
            else
                callback null,
                    id: body.id
                    password: body.password


    # Unregister device remotely, ask for revocation.
    unregisterDevice: (options, callback) ->
        client = request.newClient options.url
        client.setBasicAuth 'owner', options.password

        client.del "device/#{options.deviceId}/", callback


    # Give the right pouch function to run the replication depending on
    # parameters.
    getReplicateFunction: (toRemote, fromRemote) ->
        if fromRemote and not toRemote
            log.info "Running replication from remote database"
            replicate = pouch.db.replicate.from
        else if toRemote and not fromRemote
            log.info "Running replication to remote database"
            replicate = pouch.db.replicate.to
        else
            log.info "Running synchronization with remote database"
            replicate = pouch.db.sync

        return replicate


    # Build replication options from given arguments, then run replication
    # accordingly.
    runReplication: (options, callback) ->

        fromRemote = options.fromRemote
        toRemote = options.toRemote
        continuous = options.continuous or false
        catchup = options.catchup or false

        if options.force is true
            config.setSeq 0
            config.setChangeSeq 0

        replication.firstSync = firstSync = options.initial or false
        replication.startSeq = config.getSeq()
        replication.startChangeSeq = config.getChangeSeq()
        replication.replicate = \
            replication.getReplicateFunction toRemote, fromRemote
        replication.url = replication.getUrl()
        replication.opts =
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            live: not(replication.firstSync) and continuous
            since: replication.startSeq


        log.info 'Start first replication to resync local device and your Cozy.'
        log.info "Resync from sequence #{replication.startSeq}"
        replication.replicator = replication.replicate(
            replication.url, replication.opts)
            .on 'change', replication.displayChange
            .on 'complete', replication.onComplete
            .on 'error', replication.onError
        .catch replication.onError


    displayChange: (info) ->
        nbDocs = 0

        if info.change? and info.change.docs_written > 0
            nbDocs = info.change.docs_written
        else if info.docs_written > 0
            nbDocs = info.docs_written

        if info.direction and nbDocs > 0
            if info.direction is "pull"
                changeMessage = "#{nbDocs} entries imported from your Cozy"
            else
                changeMessage = "#{nbDocs} entries to your Cozy"

            log.info changeMessage if changeMessage?


    onComplete: (info) ->
        since = replication.getInfoSeq info
        log.info "Replication batch is complete (last sequence: #{since})"

        if replication.firstSync
            config.setSeq since if since isnt 'now'

            ## Ensure that previous replication is properly finished.
            replication.cancelReplication()

            log.info 'Start building your filesystem on your device.'
            filesystem.changes.push operation: 'applyFolderDBChanges', ->
                filesystem.changes.push operation: 'applyFileDBChanges', ->
                    log.info 'All your files are now available on your device.'
                    replication.timeout = setTimeout replication.runSync, 1000

        else
            replication.lastChangeSeq ?= 0
            replication.applyChanges replication.lastChangeSeq


    runSync: ->
        replication.startSeq = config.getSeq()
        replication.firstSync = false
        replication.opts.live = true

        run = ->
            log.info 'Start live synchronization'
            complete = (info) ->
                log.info 'Continuous sync session done, applying changes to files'
                replication.onComplete info

            replication.replicator = replication.replicate(replication.url, replication.opts)
                .on 'change', replication.displayChange
                .on 'uptodate', complete
                .on 'error', replication.onError
            .catch replication.onError

        replication.timeout = setTimeout run, 5000


    onError: (err, data) ->
        if err?.status is 409
            log.error "Conflict, ignoring"
        else
            log.error err
            replication.onComplete
                change:
                    docs_written: 0


    applyChanges: (since, callback) ->

        options =
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            since: since
            include_docs: true

        pouch.db.changes(options)
        .on 'error', (err) ->
            log.error "An error occured while applying changes"
            log.error "Stop applying changes."
            callback err
        .on 'complete', (res) ->
            log.info 'All changes were fetched, now applying them to your files...'
            async.eachSeries res.results, replication.applyChange, (err) ->
                log.error err if err
                log.info "All changes were applied to your files."
                callback() if callback?


    # Add a task to the chaneg queue.
    applyChange: (change, callback) ->
        remoteConfig = config.getConfig()

        replication.lastChangeSeq = change.seq
        config.setChangeSeq change.seq

        endTask = (err) ->
            if err
                log.error "An error occured while applying a change."
                log.raw err

        if change.deleted
            if change.doc.docType is 'Folder'
                # We don't have folder information so, we resync all folders.
                task =
                    operation: 'deleteFolder'
                    id: change.doc._id
                    rev: change.doc._rev
                filesystem.changes.push task, endTask
            else if change.doc.binary?.file?.id?
                # It's a file, we still have the path on the binary object.
                task =
                    operation: 'delete'
                    id: change.doc.binary.file.id
                filesystem.changes.push task, endTask
        else
            if change.doc.docType is 'Folder'
                absPath = path.join remoteConfig.path,
                                    change.doc.path,

                                    change.doc.name
                filesystem.changes.push
                    operation: 'newFolder'
                    path: absPath
                , (err) ->
                    log.error err if err
                    filesystem.changes.push
                        operation: 'applyFolderDBChanges'
                    , endTask
            else
                filesystem.changes.push
                    operation: 'applyFileDBChanges'
                , endTask

        callback()


    cancelReplication: ->
        clearTimeout replication.timeout
        replication.replicator.cancel() if replication.replicator?
        replication.timeout = null
        replication.replicator = null
