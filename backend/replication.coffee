fs         = require 'fs'
path       = require 'path'
touch      = require 'touch'
request    = require 'request-json-light'
urlParser  = require 'url'
mkdirp     = require 'mkdirp'
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

        data = login: options.deviceName

        getCredentials = (err, res, body) ->
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

        client.post 'device/', data, getCredentials


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
        since ?= config.getSeq()

        pouch.db.changes(
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            since: since
            include_docs: true
        ).on('complete', (res) ->

            for change in res.results

                saveSeq = (err, res) ->
                    if err
                        callback err
                    else
                        config.setSeq(change.seq)
                        callback null

                if change.deleted
                    if change.doc.docType is 'Folder'
                        filesystem.changes.push
                            operation: 'removeUnusedDirectories'
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
                            #   operation: 'removeUnusedDirectories'
                            #, saveSeq
                    else
                        filesystem.changes.push
                            operation: 'get'
                            doc: change.doc
                        , saveSeq
        ).on 'error', (err) ->
            callback err


    runReplication: (options, callback) ->

        remoteConfig = config.getConfig()

        fromRemote = options.fromRemote
        toRemote = options.toRemote
        continuous = options.continuous or false
        rebuildFs = options.rebuildFs or true
        fetchBinary = options.fetchBinary or false
        catchup = options.catchup or false
        initial = options.initial or false
        firstSync = initial

        deviceName = config.getDeviceName()
        replicate = @getReplicateFunction toRemote, fromRemote

        # Do not take into account all the changes if it is the first sync
        firstSync = initial

        # Replicate only files and folders for now
        options =
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            #live: continuous

        # Set authentication
        url = urlParser.parse remoteConfig.url
        url.auth = "#{deviceName}:#{remoteConfig.devicePassword}"
        # Format URL
        url = urlParser.format(url) + 'cozy'

        onChange = (info) ->
            if info.change? and info.change.docs_written > 0
                changeMessage = "DB change: #{info.change.docs_written}
                                 doc(s) written"
            else if info.docs_written > 0
                changeMessage = "DB change: #{info.docs_written} doc(s) written"

            # Specify direction
            if info.direction and changeMessage?
                changeMessage = "#{info.direction} #{changeMessage}"

            log.info changeMessage if changeMessage?

        onComplete = (info) =>
            if firstSync
                since = 'now'
                filesystem.changes.push { operation: 'reDownload' }, ->
            else
                since = config.getSeq()

            @applyChanges since, () ->
                setTimeout () ->
                    replicator = replicate(url, options)
                        .on 'change', onChange
                        .on 'complete', (info) ->
                            firstSync = false
                            onComplete info
                        .on 'error', onError
                , 5000

        onError = (err, data) ->
            log.error err
            callback err if callback?

        if catchup
            operationm= 'catchup'
        else
            operation = 'removeUnusedDirectories'

        filesystem.changes.push { operation: operation }, ->
            setTimeout () ->
                replicator = replicate(url, options)
                    .on 'change', onChange
                    .on 'complete', onComplete
                    .on 'error', onError
            , 5000
