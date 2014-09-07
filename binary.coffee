fs         = require 'fs'
path       = require 'path'
request    = require 'request-json'
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
            return pouch.db.putAsync doc

        .then -> callback()

        .catch (err) ->
            log.error err

    fetchAll: (deviceName, callback) ->
        deviceName ?= config.getDeviceName()

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

        .then -> callback()
        .catch (err) ->
            log.error err.toString()
            console.error err.stack

    fetchOne: (deviceName, filePath, callback) ->
        deviceName ?= config.getDeviceName()

        # Ensure parent folders exist
        require('./filesystem').buildTreeAsync(filePath).bind(@)

        # Find file document related to filePath
        .then -> pouch.db.queryAsync('file/all')
        .get('rows').filter (doc) ->
            return path.join(doc.value.path, doc.value.name) is filePath

        # Fetch element
        .each (doc) ->
            @fetchFromDocAsync deviceName, doc.value

        .then -> callback()
        .catch (err) ->
            log.error err.toString()
            console.error err.stack


    fetchFromDoc: (deviceName, doc, callback) ->
        deviceName ?= config.getDeviceName()

        # Useful variables
        filePath = path.join doc.path, doc.name
        binaryPath = path.join remoteConfig.path, filePath

        # Check if the binary document exists
        pouch.db.getAsync(doc.binary.file.id)

        # Move the binary if it has already been downloaded
        .then (binaryDoc) ->
            if binaryDoc.path? and binaryDoc.path isnt binaryPath
                fs.renameSync(binaryDoc.path, binaryPath)

            # Remove binary doc to keep rev up-to-date
            pouch.db.removeAsync binaryDoc

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
                log.info "Downloading binary: #{filePath}"
                client.saveFileAsync "cozy/#{doc.binary.file.id}/file", binaryPath
                .then -> log.info "Binary downloaded: #{filePath}"

        # Create or update the local binary document
        # which will not be synchronized, only used
        # to store the binary's location on the FS
        .then -> pouch.db.putAsync
                    _id: doc.binary.file.id
                    _rev: doc.binary.file.rev
                    docType: 'Binary'
                    path: binaryPath

        # Update binary information
        .then -> fs.utimesAsync(
                    binaryPath,
                    new Date(doc.creationDate),
                    new Date(doc.lastModification)
                 )

        .then -> callback()
        .catch (err) ->
            log.error err.toString()
            console.error err.stack


# Promisify above functions
Promise.promisifyAll module.exports
