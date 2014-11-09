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


    applyChanges: (since, callback) ->
        remoteConfig = config.getConfig()

        since ?= config.getSeq()

        pouch.db.changes(
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            since: since
            include_docs: true
        ).on('complete', (res) ->

            async.eachSeries res.results, (change, cb) ->
                saveSeq = (err, res) ->
                    if err
                        cb err
                    else
                        config.setSeq change.seq
                        cb null

                if change.deleted
                    if change.doc.docType is 'Folder'
                        filesystem.changes.push
                            operation: 'applyFolderDBChanges'
                        , saveSeq
                    else if change.doc.binary?.file?.id?
                        filesystem.changes.push
                            operation: 'delete'
                            id: change.doc.binary.file.id
                        , saveSeq
                else
                    if change.doc.docType is 'Folder'
                        absPath = path.join remoteConfig.path,
                                            change.doc.path,
                                            change.doc.name
                        filesystem.changes.push
                            operation: 'newFolder'
                            path: absPath
                        , saveSeq
                            #filesystem.changes.push
                            #   operation: 'applyFolderDBChanges'
                            #, saveSeq
                    else
                        filesystem.changes.push
                            operation: 'get'
                            doc: change.doc
                        , saveSeq
            , ->
                log.info "All changes were applied locally."
                callback()

        ).on 'error', (err) ->
            callback err

    displayChange: (info) ->
        nbDocs = 0
        if info.change? and info.change.docs_written > 0
            nbDocs = info.change.docs_written
        else if info.docs_written > 0
            nbDocs = info.docs_written

        # Specify direction
        if info.direction and nbDocs > 0
            if info.direction is "pull"
                changeMessage = \
                    "overall of #{nbDocs} imported data"
            else
                changeMessage = \
                    "overall of #{nbDocs} sent data"

            log.info changeMessage if changeMessage?


    onComplete: (info) ->
        if replication.firstSync
            if info.last_seq?
                since = info.last_seq
            else if info.pull?.last_seq?
                since = info.pull.last_seq
            else
                since = 'now'
        else
            since = config.getSeq()

        if replication.firstSync or \
           (info.change? and info.change.docs_written > 0) or \
           info.docs_written > 0

            replication.cancelReplication()

            replication.applyChanges since, ->
                replication.firstSync = false
                options =
                    filter: (doc) ->
                        doc.docType is 'Folder' or doc.docType is 'File'
                    live: true
                replication.timeout = setTimeout ->
                    options =
                        operation: 'reDownload'
                    replication.replicator = \
                        replication.replicate(replication.url, replication.opts)
                        .on 'change', replication.displayChange
                        .on 'complete', (info) ->
                            filesystem.changes.push options, ->
                                replication.onComplete info
                        .on 'uptodate', (info) ->
                            filesystem.changes.push options, ->
                                replication.onComplete info
                        .on 'error', replication.onError
                    .catch replication.onError
                , 5000


    onError: (err, data) ->
        if err?.status is 409
            log.error "Conflict, ignoring"
        else
            log.error err
            replication.onComplete
                change:
                    docs_written: 0


    runReplication: (options, callback) ->

        remoteConfig = config.getConfig()
        deviceName = config.getDeviceName()

        fromRemote = options.fromRemote
        toRemote = options.toRemote
        continuous = options.continuous or false
        catchup = options.catchup or false
        replication.firstSync = firstSync = options.initial or false

        log.debug { fromRemote, toRemote, continuous, catchup, replication }
        replication.replicate = \
            replication.getReplicateFunction toRemote, fromRemote

        # Replicate only files and folders for now
        replication.opts =
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            live: not(replication.firstSync) and continuous

        # Set authentication
        url = urlParser.parse remoteConfig.url
        url.auth = "#{deviceName}:#{remoteConfig.devicePassword}"

        # Format URL
        url = "#{urlParser.format(url)}cozy"
        replication.url = url

        if catchup
            operation = 'catchup'
        else
            operation = 'applyFolderDBChanges'

        run = ->
            replication.replicator = replication.replicate(url, replication.opts)
                .on 'change', replication.displayChange
                .on 'complete', replication.onComplete
                .on 'uptodate', replication.onComplete
                .on 'error', replication.onError
            .catch replication.onError

        filesystem.changes.push operation: operation, ->
            replication.timeout = setTimeout run, 1000

    cancelReplication: ->
        clearTimeout replication.timeout
        replication.replicator.cancel() if replication.replicator?
        replication.timeout = null
        replication.replicator = null
