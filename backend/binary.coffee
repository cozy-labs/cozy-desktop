fs         = require 'fs'
path       = require 'path'
request    = require 'request-json-light'
uuid       = require 'node-uuid'
crypto     = require 'crypto'
log        = require('printit')
    prefix: 'Binary     '

config     = require './config'
pouch      = require './db'
publisher  = require './publisher'
async      = require 'async'
events     = require 'events'
mime       = require 'mime'



module.exports = binary =


    # Get checksum for given file.
    checksum: (filePath, callback) ->
        stream = fs.createReadStream filePath
        checksum = crypto.createHash 'sha1'
        checksum.setEncoding 'hex'

        stream.on 'end', ->
            checksum.end()
            callback null, checksum.read()

        stream.pipe checksum


    # TODO add test
    # TODO make a micromodule from it?
    getFileClass: (filename) ->
        type = mime.lookup filename
        switch type.split('/')[0]
            when 'image' then fileClass = "image"
            when 'application' then fileClass = "document"
            when 'text' then fileClass = "document"
            when 'audio' then fileClass = "music"
            when 'video' then fileClass = "video"
            else
                fileClass = "file"
        {type, fileClass}


    # Retrieve info remotely for a given id.
    getRemoteDoc: (remoteId, callback) ->
        remoteConfig = config.getConfig()
        deviceName = config.getDeviceName()

        client = request.newClient remoteConfig.url
        client.setBasicAuth deviceName, remoteConfig.devicePassword

        client.get "cozy/#{remoteId}", (err, res, body) ->
            if err
                callback err
            else if body.error
                callback new Error body.error
            else
                body.id  = body._id
                body.rev = body._rev
                callback null, body


    # Create empty binary remotely. It will be used to link file object to
    # a given binary.
    createEmptyRemoteDoc: (callback) ->
        remoteConfig = config.getConfig()
        deviceName = config.getDeviceName()
        data =
            docType: 'Binary'
        newId = uuid.v4().split('-').join('')
        urlPath = "cozy/#{newId}"

        client = request.newClient remoteConfig.url
        client.setBasicAuth deviceName, remoteConfig.devicePassword

        client.put urlPath, data, (err, res, body) ->
            if err
                callback err
            else if body.error
                callback new Error body.error
            else
                callback err, body


    # Upload a binary via the couchd API on the remote cozy.
    uploadAsAttachment: (remoteId, remoteRev, filePath, callback) ->
        remoteConfig = config.getConfig()
        deviceName = config.getDeviceName()
        absPath = filePath # The given path is already absolute
        urlPath = "cozy/#{remoteId}/file?rev=#{remoteRev}"

        client = request.newClient remoteConfig.url
        client.setBasicAuth deviceName, remoteConfig.devicePassword

        log.info "Uploading binary: #{absPath}..."
        publisher.emit 'uploadBinary', absPath

        client.putFile urlPath, filePath, (err, res, body) =>
            if err
                callback err
            else
                body = JSON.parse(body) if typeof body is 'string'

                if body.error
                    callback new Error body.error
                else
                    log.info "Binary uploaded: #{absPath}"
                    publisher.emit 'binaryUploaded', absPath
                    callback err, body


    # Change path in the binary DB document then move file in the filesystem.
    moveFromDoc: (doc, finalPath, callback) ->
        fs.rename doc.path, finalPath, (err) ->
            if err
                callback err
            else
                doc.path = finalPath
                pouch.db.put doc, (err, res) ->
                    pouch.storeLocalRev res.rev, ->
                        callback err, res


    # Check if a binary already exists
    # If so, return local binary DB document
    # else, return null
    docAlreadyExists: (checksum, callback) ->
        options =
            include_docs: true,
            key: checksum
        pouch.db.query 'binary/byChecksum', options, (err, docs) ->
            if err and err.status isnt 404
                callback err
            else
                if not docs?.rows?
                    callback null, null
                else if docs.rows.length is 0
                    callback null, null
                else
                    callback null, docs.rows[0].doc


    # Save path and checksum at the binary level.
    saveLocation: (filePath, id, rev, callback) ->
        pouch.removeIfExists id, (err) =>
            if err
                callback err
            else
                @checksum filePath, (err, checksum) ->
                    document =
                        _id: id
                        docType: 'Binary'
                        path: filePath
                        checksum: checksum

                    pouch.db.put document, (err, res) ->
                        if err
                            callback err
                        else
                            callback null, document


    # Change modification dates on file system.
    changeUtimes: (doc, binaryPath, callback) ->
        creationDate = new Date doc.creationDate
        lastModification = new Date doc.lastModification
        fs.utimes binaryPath, creationDate, lastModification, callback


    # If file exists anyway and has the right size,
    # we assume that it has already been downloaded.
    downloadFile: (options, callback) ->
        {doc, filePath, binaryPath, forced} = options

        remoteConfig = config.getConfig()
        deviceName = config.getDeviceName()
        absPath = path.join remoteConfig.path, filePath

        if (not fs.existsSync(binaryPath) \
           or fs.statSync(binaryPath).size isnt doc.size) \
           or forced

            client = request.newClient remoteConfig.url
            client.setBasicAuth deviceName, remoteConfig.devicePassword

            urlPath = "cozy/#{doc.binary.file.id}/file"

            log.info "Downloading: #{absPath}..."
            publisher.emit 'binaryDownloadStart', absPath
            client.saveFile urlPath, binaryPath, (err, res) ->

                if err
                    callback err
                else
                    log.info "Binary downloaded: #{absPath}"
                    publisher.emit 'binaryDownloaded', absPath
                    callback null
                    #fs.chmod filePath, '550', (err) ->
                    #    if err
                    #        callback err
                    #    else
                    #        callback null

        else
            log.debug "File already downloaded: #{filePath}"
            callback()


    # Move the binary if it has already been downloaded.
    # TODO do not use the path field anymore, rely on rev instead
    removeBinaryIfExists: (fileDoc, binaryPath, callback) ->
        pouch.db.get fileDoc.binary.file.id, (err, binaryDoc) ->
            if err and err.status isnt 404 then callback err
            else if binaryDoc?
                pouch.db.remove binaryDoc, ->
                    if binaryDoc.path? \
                    and binaryDoc.path isnt binaryPath \
                    and fs.existsSync(binaryDoc.path)

                        fs.renameSync(binaryDoc.path, binaryPath)
                    callback()
            else
                callback()


    # Save binary path on binary object and save dates on binary.
    saveFileMetadata: (options, callback) ->
        {doc, filePath, binaryPath} = options

        if doc.binary?
            id = doc.binary.file.id
            rev = doc.binary.file.rev

            binary.saveLocation binaryPath, id, rev, (err) ->
                if err
                    callback err
                else
                    binary.changeUtimes doc, binaryPath, callback
        else
            callback null


    # Download corresponding binary
    fetchFromDoc: (deviceName, doc, callback) ->
        remoteConfig = config.getConfig()
        if doc.path? and doc.name? and doc.binary?.file?.id? \
        and fs.existsSync path.join remoteConfig.path, doc.path
            filePath = path.join doc.path, doc.name
            binaryPath = path.join remoteConfig.path, filePath

            binary.removeBinaryIfExists doc, binaryPath, (err) ->
                if err
                    callback err
                else

                    options = {doc, filePath, binaryPath}
                    binary.downloadFile options, (err) =>
                        if err
                            callback err
                        else
                            options = {doc, filePath, binaryPath}
                            binary.saveFileMetadata options, callback
        else
            callback()
