fs         = require 'fs'
path       = require 'path'
request    = require 'request-json'
uuid       = require 'node-uuid'
log        = require('printit')
             prefix: 'Data Proxy | binary'

config     = require './config'
pouch      = require './db'

Promise    = require 'bluebird'
Promise.longStackTraces()
Promise.promisifyAll lib for lib in [fs, request, pouch]

remoteConfig = config.getConfig()

module.exports =

    moveFromDoc: (doc, finalPath, callback) ->
        # Move file in the filesystem
        fs.renameAsync(doc.path, finalPath)

        # Change path in the binary DB document
        .then ->
            doc.path = finalPath
            pouch.db.putAsync doc

        .then -> callback null
        .catch (err) ->
            log.error err


    uploadAsAttachment: (remoteId, remoteRev, filePath, callback) ->
        deviceName = config.getDeviceName()
        relativePath = path.relative remoteConfig.path, filePath

        log.info "Uploading binary: #{relativePath}"

        # Initialize remote HTTP client
        client = request.newClient remoteConfig.url
        client.setBasicAuth deviceName, remoteConfig.devicePassword

        client.putFile "cozy/#{remoteId}/file?rev=#{remoteRev}"
        , filePath
        , {}
        , (err, res, body) ->
            throw err if err?
            body = JSON.parse(body) if typeof body is 'string'
            throw new Error(body.error) if body.error?
            log.info "Binary uploaded: #{relativePath}"
            callback err, body


    createEmptyRemoteDoc: (callback) ->
        deviceName = config.getDeviceName()

        newId = uuid.v4().split('-').join('')

        # Initialize remote HTTP client
        client = request.newClient remoteConfig.url
        client.setBasicAuth deviceName, remoteConfig.devicePassword
        client.put "cozy/#{newId}"
        , { docType: 'Binary' }
        , (err, res, body) ->
            throw err if err?
            throw new Error(body.error) if body.error?
            callback err, body


    getRemoteDoc: (remoteId, callback) ->
        deviceName = config.getDeviceName()

        # Initialize remote HTTP client
        client = request.newClient remoteConfig.url
        client.setBasicAuth deviceName, remoteConfig.devicePassword
        client.get "cozy/#{remoteId}", (err, res, body) ->
            throw err if err?
            throw new Error(body.error) if body.error?
            body.id  = body._id
            body.rev = body._rev
            callback err, body

    saveLocation: (filePath, id, rev, callback) ->
        # Get binary document
        pouch.db.getAsync(id)

        # If exists, remove it to avoid conflicts
        .then (doc) -> pouch.db.removeAsync doc

        # Otherwise the document does not exist
        .catch (err) ->
            throw err unless err.status is 404 \
                          or err.status is 409

         # Create the document
        .then -> pouch.db.putAsync
                    _id: id
                    _rev: rev
                    docType: 'Binary'
                    path: filePath

        .then -> callback null
        .catch (err) ->
            return callback null if  err.status? \
                                 and err.status is 409
            log.error err.toString()
            console.error err.stack


    fetchAll: (deviceName, callback) ->
        deviceName ?= config.getDeviceName()

        log.info "Fetching all binaries"

        # Ensure filesystem tree is built
        require('./filesystem').buildTreeAsync(null).bind(@)

        # Fetch file documents
        .then -> pouch.db.queryAsync('file/all')

        # Select interesting documents
        .get('rows').filter (doc) ->
            return doc.value.binary?

        # Fetch each selected document
        .each (doc) ->
            @fetchFromDocAsync deviceName, doc.value

        .then -> callback null
        .catch (err) ->
            log.error err.toString()
            console.error err.stack

    fetchOne: (deviceName, filePath, callback) ->
        deviceName ?= config.getDeviceName()

        log.info "Fetching binary: #{filePath}"

        # Ensure parent folders exist
        require('./filesystem').buildTreeAsync(filePath).bind(@)

        # Find file document related to filePath
        .then -> pouch.db.queryAsync('file/all')
        .get('rows').filter (doc) ->
            return path.join(doc.value.path, doc.value.name) is filePath

        # Fetch element
        .each (doc) ->
            @fetchFromDocAsync deviceName, doc.value

        .then -> callback null
        .catch (err) ->
            log.error err.toString()
            console.error err.stack


    fetchFromDoc: (deviceName, doc, callback) ->
        deviceName ?= config.getDeviceName()

        # Useful variables
        filePath = path.join doc.path, doc.name
        binaryPath = path.join remoteConfig.path, filePath
        relativePath = path.relative remoteConfig.path, filePath

        # Check if the binary document exists
        pouch.db.getAsync(doc.binary.file.id).bind(@)

        # Move the binary if it has already been downloaded
        .then (binaryDoc) ->
            # Remove binary doc to keep rev up-to-date
            pouch.db.removeAsync binaryDoc
            .then ->
                if binaryDoc.path? and binaryDoc.path isnt binaryPath
                    fs.renameSync(binaryDoc.path, binaryPath)

        .catch (err) ->
            # Do not mind if binary doc is not found
            throw err unless err.status is 404

        .then ->
            # If file exists anyway and has the right size,
            # we assume that it has already been downloaded
            unless fs.existsSync(binaryPath) \
               and fs.statSync(binaryPath).size is doc.size

                # Initialize remote HTTP client
                client = request.newClient remoteConfig.url
                client.setBasicAuth deviceName, remoteConfig.devicePassword

                # Launch download
                log.info "Downloading binary: #{relativePath}"
                client.saveFileAsync "cozy/#{doc.binary.file.id}/file", binaryPath
                .then ->
                    log.info "Binary downloaded: #{relativePath}"

        # Save binary location in the DB
        .then -> @saveLocationAsync binaryPath
                             , doc.binary.file.id
                             , doc.binary.file.rev

        # Update binary information
        .then -> fs.utimesAsync binaryPath
                              , new Date(doc.creationDate)
                              , new Date(doc.lastModification)

        .then -> callback null
        .catch (err) ->
            log.error err.toString()
            console.error err.stack


# Promisify above functions
Promise.promisifyAll module.exports
