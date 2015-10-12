fs      = require 'fs-extra'
path    = require 'path-extra'
async   = require 'async'
request = require 'request-json-light'
moment  = require 'moment'
log     = require('printit')
    prefix: 'Remote CouchDB'

Pouch      = require '../pouch'
filesystem = require '../local/filesystem'
conflict   = require '../conflict'
progress   = require '../progress'


# TODO add comments
class Couch
    constructor: (@config, @pouch, @events) ->
        device = @config.getDevice()
        @url = device.url
        @client = request.newClient @url
        @client.setBasicAuth device.deviceName, device.password

    # TODO 409 conflict
    put: (doc, rev, callback) =>
        url  = "cozy/#{doc._id}"
        url += "?rev=#{rev}" if rev
        @client.put url, callback

    # TODO 409 conflict
    del: (doc, rev, callback) =>
        url = "cozy/#{doc._id}?rev=#{rev}"
        @client.del url, callback

    getLastRemoteChangeSeq: (callback) ->
        urlPath = "cozy/_changes?descending=true&limit=1"
        log.debug "Getting last remote change sequence number:"
        @client.get urlPath, (err, res, body) ->
            if err
                callback err
            else if body.error
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

    downloadBinary: (binaryId, callback) =>
        url = "cozy/#{binaryId}/file"
        @client.saveFileAsStream url, callback

    # Retrieve a document from remote cozy based on its ID
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
        newId = data._id or Pouch.newId()
        urlPath = "cozy/#{newId}"
        @client.put urlPath, data, (err, res, body) ->
            if err
                callback err
            else if body.error
                callback new Error body.error
            else
                callback err, body

    # Upload given file as attachment of given document (id + revision)
    uploadAsAttachment: (doc, stream, callback) ->
        urlPath = "cozy/#{remoteId}/file?rev=#{remoteRev}"
        streams = @client.putFile urlPath, filePath, (err, res, body) ->
            if err
                callback err
            else
                # TODO is it really necessary to parse JSON ourselves?
                body = JSON.parse(body) if typeof body is 'string'
                if body.error
                    callback new Error body.error
                else
                    log.info "Binary uploaded: #{absPath}"
                    callback err, body
        # TODO progress.showUpload filePath, streams.fileStream


module.exports = Couch
