fs         = require 'fs'
path       = require 'path'
request    = require 'request-json-light'
uuid       = require 'node-uuid'
log        = require('printit')
             prefix: 'Data Proxy | binary'

config     = require './config'
pouch      = require './db'
async = require 'async'
events = require 'events'

remoteConfig = config.getConfig()


module.exports =

    infoPublisher: new events.EventEmitter()

    moveFromDoc: (doc, finalPath, callback) ->
        # Change path in the binary DB document
        savePathInBinary = (err) ->
            if err
                callback err
            else
                doc.path = finalPath
                pouch.db.put callback

        # Move file in the filesystem
        fs.rename doc.path, finalPath, savePathInBinary


    uploadAsAttachment: (remoteId, remoteRev, filePath, callback) ->
        deviceName = config.getDeviceName()
        relativePath = path.relative remoteConfig.path, filePath
        absPath = path.join remoteConfig.path, filePath
        urlPath = "cozy/#{remoteId}/file?rev=#{remoteRev}"

        client = request.newClient remoteConfig.url
        client.setBasicAuth deviceName, remoteConfig.devicePassword

        log.info "Uploading binary: #{relativePath}"
        @infoPublisher.emit 'uploadBinary', absPath

        returnInfos = (err, res, body) ->
            if err
                callback err
            else
                body = JSON.parse(body) if typeof body is 'string'

                if body.error
                    callback new Error body.error
                else
                    log.info "Binary uploaded: #{relativePath}"
                    @infoPublisher.emit 'binaryUploaded', absPath
                    callback err, body

        client.putFile urlPath, filePath, returnInfos


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

        checkErrors = (err, res, body) ->
            if err
                callback err
            else if body.error
                callback new Error body.error
            else
                body.id  = body._id
                body.rev = body._rev
                callback null, body

        client.get "cozy/#{remoteId}", checkErrors


    saveLocation: (filePath, id, rev, callback) ->
        createDoc = (err) ->
            pouch.db.put
                _id: id
                _rev: rev
                docType: 'Binary'
                path: filePath
            , callback

        removeDoc = (err, doc) ->
            if err and err.status isnt 404
                callback err
            else if err.status is 404
                createDoc()
            else
                pouch.db.remove doc, createDooc

        pouch.db.get id, removeDoc

    fetchAll: (deviceName, callback) ->
        deviceName ?= config.getDeviceName()

        @infoPublisher.emit 'fetchAll'
        log.info "Fetching all binaries"

        filterFileWithBinary = (doc) ->
            return doc.value.binary?

        retrieveFile = (doc, cb) =>
            @fetchFromDoc deviceName, doc.value, ->
                cb()

        retrieveFiles = (err, result) ->
            if err then throw new Error
            docs = result['rows']
            docs = docs.filter filterFileWithBinary
            async.eachSeries docs, retrieveFile, ->
                callback()

        getFileMetadatas = (err) ->
            if err then throw new Error err
            pouch.db.query 'file/all', retrieveFiles

        filesystem = require('./filesystem')
        filesystem.buildTree null, getFileMetadatas


    fetchOne: (deviceName, filePath, callback) ->
        deviceName ?= config.getDeviceName()

        @infoPublisher.emit 'fetchOne', filePath
        log.info "Fetching binary: #{filePath}"

        retrieveFile = (doc) ->

        getCurrentFile = (err, result) ->
            docs = result.rows
            docs = docs.filter ->
                return path.join(doc.value.path, doc.value.name) is filePath
            @fetchFromDoc deviceName, docs[0].value, callback

        getFiles = (err) ->
            if err
                callback err
            else
                pouch.db.query 'file/all', getCurrentFile

        filesystem = require('./filesystem')
        filesystem.buildTree filePath, getFiles


    fetchFromDoc: (deviceName, doc, callback) ->
        deviceName ?= config.getDeviceName()
        filePath = path.join doc.path, doc.name
        binaryPath = path.join remoteConfig.path, filePath
        relativePath = path.relative remoteConfig.path, filePath

        # Change modification dates on file system.
        changeUtimes = (err) ->
            if err then throw new Error err
            creationDate = new Date doc.creationDate
            lastModification = new Date doc.lastModification
            fs.utimes binaryPath, creationDate, lastModification, callback

        # save Binary path in a binary document.
        saveBinaryPath = (err) =>
            if err
                throw err
            log.info "Binary downloaded: #{relativePath}"
            @infoPublisher.emit 'binaryDownloaded', binaryPath
            id = doc.binary.file.id
            rev = doc.binary.file.rev

            @saveLocation binaryPath, id, rev, changeUtimes

        downloadFile = ->
            # If file exists anyway and has the right size,
            # we assume that it has already been downloaded
            unless fs.existsSync(binaryPath) \
               and fs.statSync(binaryPath).size is doc.size

                # Initialize remote HTTP client
                client = request.newClient remoteConfig.url
                client.setBasicAuth deviceName, remoteConfig.devicePassword

                # Launch download
                urlPath = "cozy/#{doc.binary.file.id}/file"

                fs.unlinkSync binaryPath
                client.saveFile urlPath, binaryPath, saveBinaryPath
            else
                saveBinaryPath()

        # Move the binary if it has already been downloaded
        removeBinary = (err, binaryDoc) ->
            if err and err.status isnt 404 then throw new Error err
            else if binaryDoc?
                pouch.db.remove binaryDoc, ->
                    if binaryDoc.path? and binaryDoc.path isnt binaryPath
                        fs.renameSync(binaryDoc.path, binaryPath)
                    downloadFile()
            else
                downloadFile()

        # Check if the binary document exists
        pouch.db.get doc.binary.file.id, removeBinary
