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
remoteConfig = config.getConfig()

module.exports =


    # Register device remotely then returns credentials given by remote Cozy.
    # This credentials will allow the device to access to the Cozy database.
    registerDevice: (options, callback) ->
        client = request.newClient options.url
        client.setBasicAuth 'owner', options.password

        data = login: options.deviceName

        getCredentials = (res, body) ->
            if body.error?
                throw new Error(body.error)
            else
                id: body.id
                password: body.password

        client.postAsync('device/', data)
            .spread getCredentials
            .nodeify callback


    # Unregister device remotely, ask for revocation.
    unregisterDevice: (options, callback) ->
        client = request.newClient options.url
        client.setBasicAuth 'owner', options.password

        client.delAsync("device/#{options.deviceId}/")
        .nodeify callback


    # Give the right pouch function to run the replication depending on
    # parameters.
    getReplicator: (toRemote, fromRemote) ->
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


    runReplication: (options, callback) ->
        fromRemote = options.fromRemote
        toRemote = options.toRemote
        continuous = options.continuous
        rebuildFs = options.rebuildFs
        fetchBinary = options.fetchBinary

        deviceName = config.getDeviceName()
        continuous ?= false
        rebuildFs ?= false
        fetchBinary ?= false
        replicate = @getReplicator toRemote, fromRemote

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
        applyChanges = (cb) ->

            # Lock file watcher to avoid remotely downloaded files to be re-uploaded
            filesystem.watchingLocked = true

            unlockFileSystemAndReturn = ->
                filesystem.watchingLocked = false
                cb null if cb?

            # Fetch binaries Or rebuild the filesystem directory tree only
            if fetchBinary
                binary.fetchAll deviceName, unlockFileSystemAndReturn
            else
                filesystem.buildTree null, unlockFileSystemAndReturn

        onChange = (info) ->
            changeMessage = "DB change: #{info.docs_written} doc(s) written"

            # Specify direction
            if info.direction
                changeMessage = "#{info.direction} #{changeMessage}"

            # Find out if filesystem tree needs a rebuild
            if (not info.direction? and fromRemote and info.docs_written > 0) \
            or (info.direction is 'pull' and info.docs_written > 0)
                needTreeRebuild = rebuildFs

            log.info changeMessage

        onUptoDate = (info) ->
            log.info 'Replication is complete'
            if needTreeRebuild
                log.info 'Applying changes on the filesystem'
                markRebuildTree = ->
                    needTreeRebuild = false
                    callback null if callback?
                applyChanges markRebuildTree

        onComplete = (info) ->
            log.info 'Replication is complete'
            if fromRemote and not toRemote
                log.info 'Applying changes on the filesystem'
                finish = ->
                    callback null if callback?
                applyChanges finish
            else
                callback null if callback?

        onError = (err, data) ->
            log.error err
            callback err if callback?

        # Launch replication
        url = urlParser.format(url) + 'cozy'
        replicator = replicate(url, options)
        replicator.on 'change', onChange
        replicator.on 'uptodate', onUptoDate # Called only for a continuous replication
        replicator.on 'complete', onComplete # Called only for a single replication
        replicator.on 'error', onError
