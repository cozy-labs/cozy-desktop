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

    # Retrieve a document from remote cozy based on its ID
    get: (id, callback) =>
        @client.get "cozy/#{id}", (err, res, body) ->
            if err
                callback err
            else if body.error
                callback body.error
            else
                body.id  = body._id
                body.rev = body._rev
                callback null, body

    # TODO 409 conflict
    put: (doc, rev, callback) =>
        url  = "cozy/#{doc._id}"
        if typeof rev is 'function'
            callback = rev
        else
            url += "?rev=#{rev}"
        @client.put url, doc, (err, res, body) ->
            if err
                callback err
            else if body.error
                callback body.error
            else
                callback null, body

    # TODO 409 conflict
    del: (id, rev, callback) =>
        url = "cozy/#{id}?rev=#{rev}"
        @client.del url, (err, res, body) ->
            if err
                callback err
            else if body.error
                callback body.error
            else
                callback null, body

    getLastRemoteChangeSeq: (callback) =>
        urlPath = "cozy/_changes?descending=true&limit=1"
        log.debug "Getting last remote change sequence number:"
        @client.get urlPath, (err, res, body) ->
            if err
                callback err
            else if body.error
                callback body.error
            else
                callback null, body.last_seq

    # TODO create our views on couch, instead of using those of files
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
                callback new Error 'install files app on cozy'

    getFromRemoteView: (model, callback) =>
        @pickViewToCopy model, (err, viewName) =>
            return callback err if err
            urlPath = "cozy/_design/#{model}/_view/#{viewName}/"
            log.debug "Getting latest #{model} documents from remote"
            @client.get urlPath, (err, res, body) ->
                if err
                    callback err
                else if body.error
                    callback body.error
                else
                    callback null, body.rows

    # Create empty binary remotely. It will be used to link file object to
    # a given binary.
    createEmptyRemoteDoc: (binaryDoc, callback) =>
        data = binaryDoc or {}
        data.docType = 'Binary'
        data._id ?= Pouch.newId()
        @put data, callback

    # Upload given file as attachment of given document (id + revision)
    uploadAsAttachment: (id, rev, stream, callback) =>
        urlPath = "cozy/#{id}/file?rev=#{rev}"
        @client.sendFile urlPath, stream, (err, res, body) ->
            if err
                callback err
            else if body.error
                callback body.error
            else
                log.info "Binary uploaded"
                callback null, body
        # TODO progress.showUpload filePath, streams.fileStream

    downloadBinary: (binaryId, callback) =>
        url = "cozy/#{binaryId}/file"
        @client.saveFileAsStream url, callback


module.exports = Couch
