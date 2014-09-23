Promise    = require 'bluebird'
fs         = require 'fs'
path       = require 'path'
request    = require 'request-json-light'
uuid       = require 'node-uuid'
log        = require('printit')
             prefix: 'Data Proxy | binary'

config     = require './config'
pouch      = require './db'
filesystem = require('./filesystem')
async = require 'async'

remoteConfig = config.getConfig()

module.exports =


    moveFromDoc: (doc, finalPath, callback) ->
        # Change path in the binary DB document
        savePathInBinary = ->
            doc.path = finalPath
            onError =  (err) ->
                callback err unless err.status is 409
            pouch.db.putAsync doc
            .catch onError

        onError = (err) ->
            log.error err.toString()
            console.error err
            callback err

        # Move file in the filesystem
        fs.renameAsync doc.path, finalPath
        .then savePathInBinary
        .nodeify callback
        .catch onError


    uploadAsAttachment: (remoteId, remoteRev, filePath, callback) ->
        deviceName = config.getDeviceName()
        relativePath = path.relative remoteConfig.path, filePath
        urlpath = "cozy/#{remoteId}/file?rev=#{remoteRev}"

        client = request.newClient remoteConfig.url
        client.setBasicAuth deviceName, remoteConfig.devicePassword

        log.info "Uploading binary: #{relativePath}"

        returnInfos = (err, res, body) ->
            if err
                callback err
            else
                body = JSON.parse(body) if typeof body is 'string'

                if body.error
                    callback new Error body.error
                else
                    log.info "Binary uploaded: #{relativePath}"
                    callback err, body

        client.putFile urlPath, filePath, {}, returnInfos


    createEmptyRemoteDoc: (callback) ->
        deviceName = config.getDeviceName()
        data = { docType: 'Binary' }
        newId = uuid.v4().split('-').join('')
        urlPath = "cozy/#{newId}"

        client = request.newClient remoteConfig.url
        client.setBasicAuth deviceName, remoteConfig.devicePassword

        onError = (err, res, body) ->
            return callback  err if err?
            callback new Error(body.error) if body.error?
            callback err, body

        client.put urlPath, data, onError


    getRemoteDoc: (remoteId, callback) ->
        deviceName = config.getDeviceName()

        client = request.newClient remoteConfig.url
        client.setBasicAuth deviceName, remoteConfig.devicePassword

        onError = (err, res, body) ->
            if err
                callback err
            else if body.error
                callback new Error body.error
            else
                body.id  = body._id
                body.rev = body._rev
                callback null, body

        client.get "cozy/#{remoteId}", onError


    saveLocation: (filePath, id, rev, callback) ->
        removeDoc =  (doc) ->
            pouch.db.removeAsync doc

        createDoc = ->
            pouch.db.putAsync
                _id: id
                _rev: rev
                docType: 'Binary'
                path: filePath

        onError = (err) ->
            callback err unless err.status is 409

        onNotFound = (err) ->
            callback err unless err.status is 404

        pouch.db.getAsync(id)
            .then removeDoc # If exists, remove it to avoid conflicts
            .catch onNotFound # Otherwise the document does not exist
            .then createDoc # Create the document
            .catch onError
            .nodeify callback


    fetchAll: (deviceName) ->
        deviceName ?= config.getDeviceName()

        #log.info "Fetching all binaries"
        console.log "Fetching all binaries"

        previousRetrieval = Promise.fulfilled()

        onError = (err) ->
            console.log 'Fetch all binary error'
            console.log err
            callback err

        filterFileWithBinary = (doc) ->
            return doc.value.binary?

        retrieveFile = (doc, cb) =>
            @fetchFromDoc deviceName, doc.value, cb

        retrieveFiles = (err, result) ->
            if err
                console.log 'Build tree failed'
                console.log err
            else
                console.log 'retrieve files'
                docs = result['rows']
                docs = docs.filter filterFileWithBinary
                async.eachSeries docs, retrieveFile, callback

        getFileMetadatas = (err) ->
            console.log 'ok'
            if err
                console.log 'Build tree failed'
                console.log err
            else
                console.log 'build tree done'
                pouch.db.query 'file/all', retrieveFiles

        filesystem.buildTreeAsync null, getFileMetadatas


    fetchOne: (deviceName, filePath, callback) ->
        deviceName ?= config.getDeviceName()

        log.info "Fetching binary: #{filePath}"

        getFiles = ->
            pouch.db.queryAsync('file/all')

        getCurrentFile = (doc) ->
            return path.join(doc.value.path, doc.value.name) is filePath

        retrieveFile = (doc) ->
            @fetchFromDocAsync deviceName, doc.value

        # Find file document related to filePath
        # Ensure parent folders exist
        require('./filesystem').buildTreeAsync(filePath).bind(@)
            .then fetchOne
            .get('rows').filter getCurrentFile
            .each retrieveFile
            .nodeify callback


    fetchFromDoc: (deviceName, doc, callback) ->
        deviceName ?= config.getDeviceName()

        # Useful variables
        filePath = path.join doc.path, doc.name
        binaryPath = path.join remoteConfig.path, filePath
        relativePath = path.relative remoteConfig.path, filePath

        # Move the binary if it has already been downloaded
        moveBinary = (binaryDoc) ->
            ignoreConflict =  (err) ->
                # Conflict resulting of race condition
                callback err unless err.status is 409

            move = ->
                if binaryDoc.path? and binaryDoc.path isnt binaryPath
                    fs.renameSync(binaryDoc.path, binaryPath)

            # Remove binary doc to keep rev up-to-date
            pouch.db.removeAsync binaryDoc
                .then move
                .catch ignoreConflict

        ignoreNotFound = (err) ->
            callback err unless err.status is 404

        downloadFile = ->
            # If file exists anyway and has the right size,
            # we assume that it has already been downloaded
            unless fs.existsSync(binaryPath) \
               and fs.statSync(binaryPath).size is doc.size

                # Initialize remote HTTP client
                client = request.newClient remoteConfig.url
                client.setBasicAuth deviceName, remoteConfig.devicePassword

                # Launch download
                log.info "Downloading binary: #{relativePath}"
                urlPath = "cozy/#{doc.binary.file.id}/file"

                logSuccess = ->
                    log.info "Binary downloaded: #{relativePath}"

                client.saveFileAsync urlPath, binaryPath
                    .then logSuccess

        # save Binary path in a binary document.
        saveBinaryPath = =>
            id = doc.binary.file.id
            rev = doc.binary.file.rev
            @saveLocationAsync binaryPath, id, rev

        # Change modification dates on file system.
        changeUtimes = ->
            creationDate = new Date(doc.creationDate)
            lastModification = new Date(doc.lastModification)
            fs.utimesAsync binaryPath, creationDate, lastModification

        # Check if the binary document exists
        pouch.db.getAsync(doc.binary.file.id).bind(@)
            .then moveBinary
            .catch ignoreNotFound
            .then downloadFile
            .then saveBinaryPath
            .then changeUtimes
            .nodeify callback


# Promisify above functions
Promise.promisifyAll module.exports
