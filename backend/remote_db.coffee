fs      = require 'fs-extra'
path    = require 'path-extra'
async   = require 'async'
uuid    = require 'node-uuid'
request = require 'request-json-light'
moment  = require 'moment'
log     = require('printit')
    prefix: 'Remote CouchDB'

config     = require './config'
pouch      = require './db'
filesystem = require './filesystem'
conflict   = require './conflict'
publisher = require './publisher'
progress  = require './progress'


module.exports = dbHelpers =

    getLastRemoteChangeSeq: (callback) ->
        remoteConfig = config.getConfig()
        deviceName = config.getDeviceName()

        client = request.newClient remoteConfig.url
        client.setBasicAuth deviceName, remoteConfig.devicePassword

        urlPath = "cozy/_changes?descending=true&limit=1"
        log.debug "Getting last remote change sequence number:"
        client.get urlPath, (err, res, body) ->
            return callback err if err
            log.debug body.last_seq
            callback null, body.last_seq

    pickViewToCopy: (client, model, callback) ->
        urlPath = "cozy/_design/#{model}"
        log.debug "Getting design doc #{model} from remote"
        client.get urlPath, (err, res, designdoc) ->
            if err
                callback err
            else if designdoc.error
                callback new Error designdoc.error
            else if designdoc?.views?['files-all']
                callback null, 'files-all'
            else if designdoc?.views?.all
                callback null, 'all'
            else
                # TODO : may be create it ourself
                callback new Error 'install files app on cozy'

    copyViewFromRemote: (model, callback) ->
        remoteConfig = config.getConfig()
        deviceName = config.getDeviceName()

        client = request.newClient remoteConfig.url
        client.setBasicAuth deviceName, remoteConfig.devicePassword

        @pickViewToCopy client, model, (err, viewName) ->
            return callback err if err

            urlPath = "cozy/_design/#{model}/_view/#{viewName}/"
            log.debug "Getting latest #{model} documents from remote"
            client.get urlPath, (err, res, body) ->
                return callback err if err
                return callback null unless body.rows?.length
                async.eachSeries body.rows, (doc, cb) ->
                    doc = doc.value
                    # TODO we shouldn't update pouchdb from this module
                    pouch.db.put doc, new_edits: false, (err) ->
                        if err
                            log.error 'failed to copy one doc'
                            log.error err
                        cb null # keep copying other docs
                , (err) ->
                    log.debug "#{body.rows.length} docs retrieved for #{model}."
                    callback err

    replicateToRemote: (callback) ->
        startChangeSeq = config.getLocalSeq()
        url = config.getUrl()

        opts =
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            live: false
            since: startChangeSeq

        opts = config.augmentPouchOptions opts

        if not @replicatorTo or Object.keys(@replicatorTo._events).length is 0
            @replicatorTo = pouch.db.replicate.to(url, opts)
                .on 'error', (err) ->
                    if err?.status is 409
                        conflict.display err
                        log.error "Conflict, ignoring"
                    else
                        log.error 'An error occured during replication.'
                        log.error err
                        callback err if callback?
                .on 'complete', ->
                    log.info 'Changes replicated to remote'
                    callback?()
        else
            callback?()

    # Create a file document in local database from given information.
    makeFileDoc: (filePath, callback) ->
        filePaths = filesystem.getPaths filePath
        async.series [

           (next) -> filesystem.getFileClass filePaths.name, next
           (next) -> fs.stat filePaths.absolute, next
           (next) -> dbHelpers.getDocForFile filePaths.absolute, next

        ], (err, results) ->

            # Do not mind if an existing document does not exists. It
            # means that we need a new file document.
            if err and err.status isnt 404
                log.error err
                return callback err

            [{mimeType, fileClass}, stats, existingDoc] = results

            infos = {fileClass, filePaths, mimeType, stats}
            if existingDoc?
                pouch.db.get existingDoc.binary.file.id, (err, doc) ->
                    if doc?
                        remoteConfig = config.getConfig()
                        doc.path =  path.join(
                            remoteConfig.path, filePaths.parent, filePaths.name)
                        pouch.db.put doc, (err) ->
                            if err
                                callback err
                            else
                                dbHelpers.makeFileDocFrom(
                                    existingDoc, infos, callback)
                    else
                        dbHelpers.makeFileDocFrom existingDoc, infos, callback

            else
                existingDoc = {}
                dbHelpers.makeFileDocFrom existingDoc, infos, callback


    makeFileDocFrom: (existingDoc, infos, callback) ->
        # Populate document information with the existing DB document
        # if it exists, or with the file stats otherwise.
        doc =
            _id: existingDoc._id or uuid.v4().split('-').join('')
            _rev: existingDoc._rev or null
            docType: 'File'
            class: infos.fileClass
            name: infos.filePaths.name
            path: infos.filePaths.parent
            mime: infos.mimeType
            lastModification: infos.stats.mtime
            creationDate: existingDoc.creationDate or infos.stats.mtime
            size: infos.stats.size
            tags: existingDoc.tags or []
            binary: existingDoc.binary or null

        # Keep the latest modification date
        if existingDoc.lastModification?
            existingFileLastMod = moment existingDoc.lastModification
            newFileLastMod = moment doc.lastModification

            if existingFileLastMod.isAfter newFileLastMod
                doc.lastModification = existingDoc.lastModification

        # Add the checksum here if it is not set
        if not doc.binary or not doc.binary.file.checksum
            filesystem.checksum infos.filePaths.absolute, (err, checksum) ->
                if err then callback err
                else
                    doc.binary ?= file: {}
                    doc.binary.file.checksum = checksum
                    callback null, doc

        else
            callback null, doc


    # Create a folder document in local database from given information.
    makeFolderDoc: (folderPath, callback) ->
        folderPaths = filesystem.getPaths folderPath

        # Check that the folder document exists already in DB
        key = "#{folderPaths.parent}/#{folderPaths.name}"
        pouch.folders.get key, (err, existingDoc) ->
            if err and err.status isnt 404
                return callback err

            # Get last modification date
            fs.stat folderPaths.absolute, (err, {mtime}) ->
                return callback err if err

                existingDoc ?= {}
                newDoc =
                    _id: existingDoc._id or uuid.v4().split('-').join('')
                    docType: 'Folder'
                    name: folderPaths.name
                    path: folderPaths.parent
                    tags: existingDoc.tags or []
                    creationDate: existingDoc.creationDate or mtime
                    lastModification: existingDoc.lastModification or mtime

                prevDate = new Date existingDoc.lastModification
                newDate = new Date mtime

                if prevDate > newDate
                    newDoc.lastModification = existingDoc.lastModification

                callback null, newDoc


    # TODO refactor: remove return statement in the middle and move the
    # final block to the filesystem module.
    getDocForFile: (filePath, callback) ->
        remoteConfig = config.getConfig()
        filePaths = filesystem.getPaths filePath

        # Find a potential existing document by its full path
        pouch.db.query 'file/byFullPath',
            key: "#{filePaths.parent}/#{filePaths.name}"
        , (err, res) ->

            # A 404 will be raised if no document were found
            # or if the 'file/byFullPath' filter is not set
            if err and err.status isnt 404
                return callback err

            # A res.rows of 0 item can be return
            if res.rows? and res.rows.length isnt 0
                return callback null, res.rows[0].value

            # Otherwise try to find a potential existing document by
            # looking for a similar checksum
            filesystem.checksum filePaths.absolute, (err, checksum) ->
                pouch.db.query 'file/byChecksum', key: checksum, (err, res) ->

                    # Same remark as above
                    if err and err.status isnt 404
                        return callback err

                    # If the file has been moved, there is a file with the same
                    # checksum. If there is more than one, we cannot ensure
                    # which file has been moved
                    if res.rows? and res.rows.length is 1
                        existingDoc = res.rows[0].value

                        unless existingDoc.path?
                            return pouch.db.remove existingDoc, ->
                                msg = 'Corrupted metadata, file deleted.'
                                callback new Error msg
                        movedFile = path.join remoteConfig.path
                                            , existingDoc.path
                                            , existingDoc.name

                        # If the old file exists at its location, then this is
                        # a duplication, not a moved file.
                        fs.exists movedFile, (fileExists) ->
                            unless fileExists
                                callback null, existingDoc
                            else
                                # UGLY TRICK
                                callback null,
                                    binary:
                                        file:
                                            checksum: checksum

                    else
                        # Return the checksum anyway to avoid its recalculation
                        # UGLY TRICK
                        callback null, { binary: file: checksum: checksum }


    # Upload the binary as a CouchDB document's attachment and return
    # the binary document
    uploadBinary: (filePath, binaryDoc, callback) ->
        filePaths = filesystem.getPaths filePath

        async.waterfall [
            (next) ->
                # In case of an file update, binary document already exists.
                if binaryDoc?.file?.id? and binaryDoc?.file?.rev?
                    next null,
                        id: binaryDoc.file.id
                        rev: binaryDoc.file.rev
                        checksum: binaryDoc.file.checksum
                else
                    # Create a remote binary document if not exists.
                    # Pass the checksum here to save it remotely.

                    filesystem.checksum filePaths.absolute, (err, checksum) ->
                        if err
                            next err
                        else
                            binaryDoc =
                                file:
                                    checksum: checksum
                            dbHelpers.createEmptyRemoteDoc binaryDoc, next

            # Get the binary document
            (binaryInfo, next) ->
                dbHelpers.getRemoteDoc binaryInfo.id, next

            (remoteBinaryDoc, next) ->
                # If for some reason the remote attachment is already uploaded
                # and has the same checksum than the local file, just return
                # the binary document.
                if remoteBinaryDoc._attachments? \
                and Object.keys(remoteBinaryDoc._attachments) > 0 \
                and remoteBinaryDoc.checksum is binaryDoc.checksum
                    return callback null, remoteBinaryDoc

                # Otherwise upload it
                dbHelpers.uploadAsAttachment remoteBinaryDoc.id
                                           , remoteBinaryDoc.rev
                                           , filePaths.absolute
                                           , next

            # Get the binary document again
            (binaryInfo, next) ->
                dbHelpers.getRemoteDoc binaryInfo.id, next
        ], (err, remoteBinaryDoc) ->
            if err
                # Document not found remotely, force upload
                if err.status? and err.status is 404
                    dbHelpers.uploadBinary filePath, null, callback
                else
                    callback err
            else
                callback null, remoteBinaryDoc


    # Retrieve a document from remote cozy based on its ID.
    getRemoteDoc: (id, callback) ->
        remoteConfig = config.getConfig()
        deviceName = config.getDeviceName()

        client = request.newClient remoteConfig.url
        client.setBasicAuth deviceName, remoteConfig.devicePassword

        client.get "cozy/#{id}", (err, res, body) ->
            if err
                callback err
            else if body.error
                callback { status: res.status, error: body.error }
            else
                body.id  = body._id
                body.rev = body._rev
                callback null, body


    # Create empty binary remotely. It will be used to link file object to
    # a given binary.
    createEmptyRemoteDoc: (binaryDoc, callback) ->
        remoteConfig = config.getConfig()
        deviceName = config.getDeviceName()
        data = binaryDoc or {}
        data.docType = 'Binary'
        newId = data._id or uuid.v4().split('-').join('')
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

    # Upload given file as affachment of given document (represented by its id
    # and its revision).
    uploadAsAttachment: (remoteId, remoteRev, filePath, callback) ->
        remoteConfig = config.getConfig()
        deviceName = config.getDeviceName()
        absPath = filesystem.getPaths(filePath).absolute
        urlPath = "cozy/#{remoteId}/file?rev=#{remoteRev}"

        client = request.newClient remoteConfig.url
        client.setBasicAuth deviceName, remoteConfig.devicePassword

        log.info "Uploading binary: #{absPath}..."
        publisher.emit 'uploadBinary', absPath

        streams = client.putFile urlPath, filePath, (err, res, body) ->
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

        progress.showUpload filePath, streams.fileStream
