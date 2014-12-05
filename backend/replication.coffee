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
publisher  = require './publisher'

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
        if remoteConfig.url?
            url = urlParser.parse remoteConfig.url
            url.auth = "#{deviceName}:#{remoteConfig.devicePassword}"
            url = "#{urlParser.format(url)}cozy"
        else
            null


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
            else if body.error?
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
        options ?= {}
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
        replication.replicatorFrom = pouch.db.replicate.from(url, opts)
            .on 'change', replication.displayChange
            .on 'complete', replication.onRepComplete
            .on 'error', replication.onError


    # Run continuous synchronisation. Apply changes every times new data are
    # retrieved.
    runSync: ->
        replication.startSeq = config.getSeq()
        replication.startChangeSeq = config.getChangeSeq()

        url = replication.url
        log.info 'Start live synchronization...'

        opts =
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            live: true
            since: replication.startSeq
        replication.replicatorFrom = pouch.db.replicate.from(url, opts)
            .on 'change', replication.displayChange
            .on 'uptodate', replication.onSyncUpdate
            .on 'error', replication.onError

        opts =
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File' \
                or (doc._deleted and (doc.docType is 'Folder' or doc.docType is 'File'))
            live: true
            since: replication.startChangeSeq
        replication.replicatorTo = pouch.db.replicate.to(url, opts)
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
            filesystem.changes.push operation: 'applyFileDBChanges', ->
                publisher.emit 'firstSyncDone'
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

        error = (err) ->
            if err?.status? and err.status is 404
                log.info "No file nor folder found remotely"
                callback() if callback?
            else
                log.error "An error occured while applying changes"
                log.error "Stop applying changes."
                callback err

        apply = (res) ->
            if filesystem.applicationDelay is 0
                # If you are fetching changes since the beginning, the applyFileDBChanges
                # and applyFolderDBChanges actions should have done everything OK.
                if since is 0
                    log.debug "First synchronization detected"
                    lastChangeSeq = res.results[res.results.length-1].seq
                    config.setChangeSeq lastChangeSeq
                    callback() if callback?
                else
                    # Else just apply every change one by one.
                    log.info 'All changes were fetched, now applying them to your files...'
                    async.eachSeries res.results, replication.applyChange, (err) ->
                        log.error err if err
                        log.info "All changes were applied to your files."
                        callback() if callback?
            else
                setTimeout ->
                    apply res
                , 1000

        pouch.db.changes(options)
        .on 'error', error
        .on 'complete', apply


    # Define the proper task to perform on the file system and add it to the
    # filesystem change queue.
    applyChange: (change, callback) ->
        remoteConfig = config.getConfig()
        replication.lastChangeSeq = change.seq
        config.setChangeSeq change.seq

        pouch.db.query 'localrev/byRevision', key: change.doc._rev, (err, res) ->
            if res?.rows? and res.rows.length is 0
                isDeletion = change.deleted
                isCreation = change.doc.creationDate is change.doc.lastModification
                task =
                    doc: change.doc

                if isDeletion
                    if change.doc.docType is 'Folder'
                        task.operation = 'deleteFolder'
                    else
                        task.operation = 'deleteFile'

                else if isCreation
                    if change.doc.docType is 'Folder'
                        task.operation = 'newFolder'
                    else
                        task.operation = 'newFile'

                else # isModification
                    if change.doc.docType is 'Folder'
                        task.operation = 'moveFolder'
                    else
                        task.operation = 'moveFile'

                if task.operation?
                    filesystem.changes.push task, (err) ->
                        if err
                            log.error "An error occured while applying a change."
                            log.debug task.operation
                            log.debug task.doc
                            log.raw err

            callback()


    # Stop running replications and stop
    cancelReplication: ->
        clearTimeout replication.timeout
        replication.replicatorFrom.cancel() if replication.replicatorFrom?
        replication.replicatorTo.cancel() if replication.replicatorTo?
        replication.timeout = null
        replication.replicatorFrom = null
        replication.replicatorTo = null
