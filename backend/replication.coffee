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

    # Build target url for replication from remote Cozy infos.
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
    # Options are:
    # * fromRemote:
    # * toRemote:
    # * continuous:
    # * catchup:
    # * force: force to stat sync from the beginning.
    runReplication: (options) ->
        catchup = options.catchup or false

        if options.force is true
            config.setSeq 0
            config.setChangeSeq 0

        replication.startSeq = config.getSeq()
        replication.startChangeSeq = config.getChangeSeq()
        url = replication.url = replication.getUrl()

        log.info 'Start first replication to resync local device and your Cozy.'
        log.info "Resync from sequence #{replication.startSeq}"

        opts =
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            live: false
            since: replication.startSeq
        replication.replicator = pouch.db.replicate.from(url, opts)
            .on 'change', replication.displayChange
            .on 'complete', replication.onRepComplete
            .on 'error', replication.onError


    # Run continuous synchronisation. Apply changes every times new data are
    # retrieved.
    runSync: ->
        replication.startSeq = config.getSeq()

        url = replication.url
        log.info 'Start live synchronization...'

        opts =
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            live: true
            since: config.getSeq()
        replication.replicator = pouch.db.replicate.from(url, opts)
            .on 'change', replication.displayChange
            .on 'uptodate', replication.onSyncUpdate
            .on 'error', replication.onError

        opts =
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            live: true
            since: config.getChangeSeq()
        replication.replicator = pouch.db.replicate.to(url, opts)
            .on 'change', replication.displayChange
            .on 'uptodate', replication.displayChange
            .on 'error', replication.onError


    # Log change event information.
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


    # When replication is complete, is saves the last replicated sequence
    # then, it syncs file system with database data.
    # then, it run continuous replication.
    onRepComplete: (info) ->
        since = replication.getInfoSeq info
        log.info "Replication batch is complete (last sequence: #{since})"
        config.setSeq since if since isnt 'now'

        # Ensure that previous replication is properly finished.
        replication.cancelReplication()

        log.info 'Start building your filesystem on your device.'
        filesystem.changes.push operation: 'applyFolderDBChanges', ->
            log.debug 'ok'
            filesystem.changes.push operation: 'applyFileDBChanges', ->
                log.info 'All your files are now available on your device.'
                replication.runSync()


    # When a sync batch has been performed, changes are applied to the file
    # system.
    onSyncUpdate: (info) ->
        replication.lastChangeSeq = config.getChangeSeq()
        replication.lastChangeSeq ?= 0
        log.info 'Continuous sync session done, applying changes to files'
        replication.applyChanges replication.lastChangeSeq


    # When an error occured, it displays the error message.
    onError: (err, data) ->
        if err?.status is 409
            log.error "Conflict, ignoring"
        else
            log.error err
            log.error data
            log.error 'An error occured during replication.'


    # Retrieve database changes and apply them to the file system.
    # NB: PouchDB manages another sequence number for the replication.
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


    # Define the proper task to perform on the file system and add it to the
    # filesystem change queue.
    applyChange: (change, callback) ->
        remoteConfig = config.getConfig()
        replication.lastChangeSeq = change.seq
        config.setChangeSeq change.seq

        isDeletion = change.deleted
        isCreation = change.doc.creationDate is change.doc.lastModification

        if isDeletion
            if change.doc.docType is 'Folder'
                task =
                    operation: 'deleteFolder'
                    id: change.doc._id
                    rev: change.doc._rev
            else
                if change.doc.binary?.file?.id?
                    task =
                        operation: 'deleteFile'
                        id: change.doc.binary.file.id

        else if isCreation
            if change.doc.docType is 'Folder'
                task =
                    operation: 'newFolder'
                    doc: change.doc
            else
                task =
                    operation: 'newFile'
                    doc: change.doc

        else # isModification
            if change.doc.docType is 'Folder'
                task =
                    operation: 'moveFolder'
                    doc: change.doc
            else
                filesystem.changes.push
                    operation: 'moveFile'
                    doc: change.doc

        if task?
            filesystem.changes.push task, (err) ->
                if err
                    log.error "An error occured while applying a change."
                    log.raw err

        callback()


    # Stop running replications and stop
    cancelReplication: ->
        clearTimeout replication.timeout
        replication.replicator.cancel() if replication.replicator?
        replication.timeout = null
        replication.replicator = null
