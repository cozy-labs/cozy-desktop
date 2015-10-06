fs      = require 'fs-extra'
path    = require 'path-extra'
async   = require 'async'
uuid    = require 'node-uuid'
request = require 'request-json-light'
moment  = require 'moment'
log     = require('printit')
    prefix: 'Remote CouchDB'

config     = require '../config'
filesystem = require '../local/filesystem'
conflict   = require '../conflict'
progress   = require '../progress'


class Couch
    constructor: (options, @pouch, @events) ->
        @url = options.url
        @client = request.newClient options.url
        @client.setBasicAuth options.user, options.password

    getLastRemoteChangeSeq: (callback) ->
        urlPath = "cozy/_changes?descending=true&limit=1"
        log.debug "Getting last remote change sequence number:"
        @client.get urlPath, (err, res, body) ->
            return callback err if err
            if body.error
                callback body.error
            else
                callback null, body.last_seq

    pickViewToCopy: (model, callback) =>
        urlPath = "cozy/_design/#{model}"
        log.debug "Getting design doc #{model} from remote"
        @client.get urlPath, (err, res, designdoc) ->
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

    copyDocsFromRemoteView: (model, callback) =>
        @pickViewToCopy model, (err, viewName) =>
            return callback err if err

            urlPath = "cozy/_design/#{model}/_view/#{viewName}/"
            log.debug "Getting latest #{model} documents from remote"
            @client.get urlPath, (err, res, body) ->
                if err
                    callback err
                else
                    callback body.rows

    replicateToRemote: (callback) =>
        startChangeSeq = config.getLocalSeq()

        opts =
            filter: (doc) ->
                doc.docType is 'Folder' or doc.docType is 'File'
            live: false
            since: startChangeSeq

        opts = config.augmentCouchOptions opts

        if not @replicatorTo or Object.keys(@replicatorTo._events).length is 0
            @replicatorTo = @pouch.db.replicate.to(@url, opts)
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


    # Upload the binary as a CouchDB document's attachment and return
    # the binary document
    uploadBinary: (filePath, binaryDoc, callback) ->
        filePaths = filesystem.getPaths filePath

        async.waterfall [
            (next) =>
                # In case of an file update, binary document already exists.
                if binaryDoc?.file?.id? and binaryDoc?.file?.rev?
                    next null,
                        id: binaryDoc.file.id
                        rev: binaryDoc.file.rev
                        checksum: binaryDoc.file.checksum
                else
                    # Create a remote binary document if not exists.
                    # Pass the checksum here to save it remotely.

                    filesystem.checksum filePaths.absolute, (err, checksum) =>
                        if err
                            next err
                        else
                            binaryDoc =
                                file:
                                    checksum: checksum
                            @createEmptyRemoteDoc binaryDoc, next

            # Get the binary document
            (binaryInfo, next) =>
                @getRemoteDoc binaryInfo.id, next

            (remoteBinaryDoc, next) =>
                # If for some reason the remote attachment is already uploaded
                # and has the same checksum than the local file, just return
                # the binary document.
                if remoteBinaryDoc._attachments? \
                and Object.keys(remoteBinaryDoc._attachments) > 0 \
                and remoteBinaryDoc.checksum is binaryDoc.checksum
                    return callback null, remoteBinaryDoc

                # Otherwise upload it
                @uploadAsAttachment remoteBinaryDoc.id
                                  , remoteBinaryDoc.rev
                                  , filePaths.absolute
                                  , next

            # Get the binary document again
            (binaryInfo, next) =>
                @getRemoteDoc binaryInfo.id, next

        ], (err, remoteBinaryDoc) =>
            if err
                # Document not found remotely, force upload
                if err.status? and err.status is 404
                    @uploadBinary filePath, null, callback
                else
                    callback err
            else
                callback null, remoteBinaryDoc


    # Retrieve a document from remote cozy based on its ID.
    getRemoteDoc: (id, callback) ->
        @client.get "cozy/#{id}", (err, res, body) ->
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
        data = binaryDoc or {}
        data.docType = 'Binary'
        newId = data._id or uuid.v4().replace(/-/g, '')
        urlPath = "cozy/#{newId}"

        @client.put urlPath, data, (err, res, body) ->
            if err
                callback err
            else if body.error
                callback new Error body.error
            else
                callback err, body

    # Upload given file as affachment of given document (represented by its id
    # and its revision).
    uploadAsAttachment: (remoteId, remoteRev, filePath, callback) ->
        absPath = filesystem.getPaths(filePath).absolute
        urlPath = "cozy/#{remoteId}/file?rev=#{remoteRev}"

        log.info "Uploading binary: #{absPath}..."
        @events.emit 'uploadBinary', absPath

        streams = @client.putFile urlPath, filePath, (err, res, body) =>
            if err
                callback err
            else
                # TODO is it really necessary to parse JSON ourselves?
                body = JSON.parse(body) if typeof body is 'string'

                if body.error
                    callback new Error body.error
                else
                    log.info "Binary uploaded: #{absPath}"
                    @events.emit 'binaryUploaded', absPath
                    callback err, body

        progress.showUpload filePath, streams.fileStream


module.exports = Couch
