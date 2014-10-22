fs         = require 'fs'
touch      = require 'touch'
request    = require 'request-json-light'
urlParser  = require 'url'
log        = require('printit')
             prefix: 'Data Proxy | replication'

pouch      = require './db'
config     = require './config'
filesystem = require './filesystem'
binary     = require './binary'

filters = []

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

        remoteConfig = config.getConfig()

        fromRemote = options.fromRemote
        toRemote = options.toRemote
        continuous = options.continuous or false
        rebuildFs = options.rebuildFs or true
        fetchBinary = options.fetchBinary or false

        deviceName = config.getDeviceName()
        replicate = @getReplicateFunction toRemote, fromRemote

        # Replicate only files and folders for now
        options =
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            live: continuous

        # Do not need rebuild until docs are pulled
        needTreeRebuild = false

        # Set authentication
        url = urlParser.parse remoteConfig.url
        url.auth = "#{deviceName}:#{remoteConfig.devicePassword}"

        # Define action after replication completion
        applyChanges = (callback) ->

            # Lock file watcher to avoid remotely downloaded files to be re-uploaded
            filesystem.watchingLocked = true

            unlockFileSystemAndReturn = (err) ->
                filesystem.watchingLocked = false
                if err
                    callback err
                else
                    callback null if callback?

            # Fetch binaries Or rebuild the filesystem directory tree only
            if fetchBinary
                filesystem.changes.push { operation: 'get' }, unlockFileSystemAndReturn
            else
                filesystem.changes.push { operation: 'rebuild' }, unlockFileSystemAndReturn

        onChange = (info) =>
            if info.change? and info.change.docs_written > 0
                changeMessage = "DB change: #{info.change.docs_written} doc(s) written"
            else if info.docs_written > 0
                changeMessage = "DB change: #{info.docs_written} doc(s) written"

            # Specify direction
            if info.direction
                changeMessage = "#{info.direction} #{changeMessage}"

            # Find out if filesystem tree needs a rebuild
            if (not info.direction? and fromRemote and info.docs_written > 0) \
            or (info.direction is 'pull' and info.change.docs_written > 0)
                needTreeRebuild = rebuildFs
                @replicationIsRunning = true

            log.info changeMessage if changeMessage?

        onUptoDate = (info) =>

            @replicationIsRunning = false
            setTimeout () =>
                if not @replicationIsRunning and not @treeIsBuilding and needTreeRebuild
                    @treeIsBuilding = true
                    applyChanges (err) =>
                        setTimeout () =>
                            @treeIsBuilding = false
                        , 2000
                        @needTreeRebuild = false
                        log.info 'Replication is complete'
                        if err and callback?
                            callback err if callback?
            , 3000

        onComplete = (info) ->
            log.info 'Replication is complete'
            if fromRemote and not toRemote
                log.info 'Applying changes on the filesystem'
                applyChanges (err) ->
                    callback err if callback?
            else
                callback null if callback?

        onError = (err, data) ->
            log.error err
            callback err if callback?

        # Launch replication
        url = urlParser.format(url) + 'cozy'
        console.log url
        replicator = replicate(url, options)
            .on 'change', onChange
            .on 'uptodate', onUptoDate # Called only for a continuous replication
            .on 'complete', onComplete # Called only for a single replication
            .on 'error', onError
