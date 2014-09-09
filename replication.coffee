request   = require 'request-json'
urlParser = require 'url'
log       = require('printit')
            prefix: 'Data Proxy | replication'

pouch     = require './db'
config    = require './config'

filters = []
remoteConfig = config.getConfig()

module.exports =

    registerDevice: (options, callback) ->
        client = request.newClient options.url
        client.setBasicAuth 'owner', options.password

        data = login: options.deviceName
        client.post 'device/', data, (err, res, body) ->
            if err
                callback err + body

            else if body.error
                callback new Error body.error

            else
                callback null,
                    id: body.id
                    password: body.password

    unregisterDevice: (options, callback) ->
        client = request.newClient options.url
        client.setBasicAuth 'owner', options.password

        client.del "device/#{options.deviceId}/", (err, res, body) ->
            if err
                callback err + body

            else if body.error
                callback new Error body.error

            else
                callback null

    runReplication: (fromRemote, toRemote, continuous, rebuildFs, binary, callback) ->
        deviceName = config.getDeviceName()
        continuous ?= false
        rebuildFs ?= false
        binary ?= false

        # Rebuild tree of fetch binaries after replication completion
        applyChanges = (callback) ->
            if binary
                require('./binary').fetchAll deviceName, callback()
            else
                require('./filesystem').buildTree null, callback()

        # Specify which way to replicate
        if fromRemote and not toRemote
            log.info "Running replication from remote database"
            replicate = pouch.db.replicate.from
        else if toRemote and not fromRemote
            log.info "Running replication to remote database"
            replicate = pouch.db.replicate.to
        else
            log.info "Running synchronization with remote database"
            replicate = pouch.db.sync

        # Replicate only files and folders for now
        options =
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            live: continuous

        needTreeRebuild = false

        url = urlParser.parse remoteConfig.url
        url.auth = "#{deviceName}:#{remoteConfig.devicePassword}"
        replicate(urlParser.format(url) + 'cozy', options)
        .on 'change', (info) ->
            console.log info
            needTreeRebuild = rebuildFs if info.direction is 'pull'
        .on 'uptodate', (info) ->
            log.info 'Replication is complete'
            if needTreeRebuild
                log.info 'Applying changes on the filesystem'
                applyChanges () ->
        .on 'complete', (info) ->
            log.info 'Replication is complete'
            if fromRemote and not toRemote
                log.info 'Applying changes on the filesystem'
                applyChanges callback()
            callback()
        .on 'error', (err) ->
            log.error err
            callback err


    runSync: (target) ->

