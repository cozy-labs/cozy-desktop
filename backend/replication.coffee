fs         = require 'fs'
path       = require 'path'
touch      = require 'touch'
request    = require 'request-json-light'
urlParser  = require 'url'
mkdirp     = require 'mkdirp'
log        = require('printit')
             prefix: 'Data Proxy | replication'

pouch      = require './db'
config     = require './config'
filesystem = require './filesystem'
binary     = require './binary'

filters = []
remoteConfig = config.getConfig()

module.exports =


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

    replicationIsRunning: false

    treeIsBuilding: false

    runReplication: (options, callback) ->
        fromRemote = options.fromRemote
        toRemote = options.toRemote
        continuous = options.continuous or false
        rebuildFs = options.rebuildFs or true
        fetchBinary = options.fetchBinary or false
        catchup = options.catchup or false
        initial = options.initial or false

        deviceName = config.getDeviceName()
        replicate = @getReplicateFunction toRemote, fromRemote

        # Replicate only files and folders for now
        options =
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            #live: continuous

        # Do not need rebuild until docs are pulled
        needTreeRebuild = false

        # Set authentication
        url = urlParser.parse remoteConfig.url
        url.auth = "#{deviceName}:#{remoteConfig.devicePassword}"


        onChange = (info) =>
            if info.change? and info.change.docs_written > 0
                changeMessage = "DB change: #{info.change.docs_written} doc(s) written"
            else if info.docs_written > 0
                changeMessage = "DB change: #{info.docs_written} doc(s) written"

            # Specify direction
            if info.direction and changeMessage?
                changeMessage = "#{info.direction} #{changeMessage}"

            log.info changeMessage if changeMessage?


        
        firstSync = initial

        onComplete = (info) =>
            if firstSync
                since = 'now'
            else
                since = config.getSeq()
            pouch.db.changes(
                filter: (doc) ->
                    doc.docType is 'Folder' or doc.docType is 'File'
                since: since
                include_docs: true
            ).on 'complete', (res) =>
                for change in res.results
                    saveSeq = (err, res) ->
                        if err
                            callback err
                        else
                            config.setSeq(change.seq)

                    if change.deleted
                        if change.doc.docType is 'Folder'
                            filesystem.changes.push { operation: 'rebuild' }, saveSeq
                        else if change.doc.binary?.file?.id?
                            filesystem.changes.push { operation: 'delete', id: change.doc.binary.file.id }, saveSeq
                    else
                        if change.doc.docType is 'Folder'
                            absPath = path.join remoteConfig.path, change.doc.path, change.doc.name
                            filesystem.changes.push { operation: 'newFolder', path: absPath }, saveSeq
                                #filesystem.changes.push { operation: 'rebuild' }, saveSeq
                        else
                            filesystem.changes.push { operation: 'get', doc: change.doc }, saveSeq
                setTimeout () =>
                    replicator = replicate(url, options)
                        .on 'change', onChange
                        .on 'complete', (info) =>
                            firstSync = false
                            onComplete info
                        .on 'error', onError
                , 5000

        onError = (err, data) ->
            log.error err
            callback err if callback?

        # Launch replication
        url = urlParser.format(url) + 'cozy'

        if catchup
            if initial
                operation = 'reDownload'
            else
                operation = 'catchup'
        else
            operation = 'rebuild'

        filesystem.changes.push { operation: operation }, ->
            setTimeout () =>
                replicator = replicate(url, options)
                    .on 'change', onChange
                    .on 'complete', onComplete # Called only for a single replication
                    .on 'error', onError
            , 5000
