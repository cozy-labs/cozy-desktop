PouchDB = require 'pouchdb'
async   = require 'async'
fs      = require 'fs-extra'
path    = require 'path-extra'
moment  = require 'moment'
request = require 'request-json-light'
log     = require('printit')
    prefix: 'Remote CouchDB'

Pouch      = require '../pouch'
filesystem = require '../local/filesystem'
conflict   = require '../conflict'
progress   = require '../progress'


# TODO add comments
# TODO use pouch lib instead of request-json-light as couch client
class Couch
    constructor: (@config, @pouch, @events) ->
        device  = @config.getDevice()
        options = @config.augmentCouchOptions
            auth:
                username: device.deviceName
                password: device.password
        @client = new PouchDB "#{device.url}/cozy", options
        @http = request.newClient device.url
        @http.setBasicAuth device.deviceName, device.password

    # Retrieve a document from remote cozy based on its ID
    get: (id, callback) =>
        @client.get id, callback

    # TODO 409 conflict
    put: (doc, callback) =>
        @client.put doc, callback

    # TODO 409 conflict
    remove: (id, rev, callback) =>
        @client.remove id, rev, callback

    getLastRemoteChangeSeq: (callback) =>
        log.debug "Getting last remote change sequence number:"
        options =
            descending: true
            limit: 1
        @client.changes options, (err, change) ->
            callback err, change?.last_seq

    # TODO create our views on couch, instead of using those of files
    pickViewToCopy: (model, callback) =>
        log.debug "Getting design doc #{model} from remote"
        @client.get "_design/#{model}", (err, designdoc) ->
            if err
                callback err
            else if designdoc.views?['files-all']
                callback null, 'files-all'
            else if designdoc.views?.all
                callback null, 'all'
            else
                callback new Error 'install files app on cozy'

    getFromRemoteView: (model, callback) =>
        @pickViewToCopy model, (err, viewName) =>
            return callback err if err
            log.debug "Getting latest #{model} documents from remote"
            id = "_design/#{model}/_view/#{viewName}/"
            @client.get id, (err, body) ->
                console.log 'body', body
                callback err, body?.rows

    # Create empty binary remotely. It will be used to link file object to
    # a given binary.
    createEmptyRemoteDoc: (binaryDoc, callback) =>
        data = binaryDoc or {}
        data.docType = 'Binary'
        data._id ?= Pouch.newId()
        @put data, callback

    # Upload given file as attachment of given document (id + revision)
    uploadAsAttachment: (id, rev, filePath, callback) =>
        urlPath = "cozy/#{id}/file?rev=#{rev}"
        @http.putFile urlPath, filePath, (err, res, body) ->
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
        @http.saveFileAsStream url, callback


module.exports = Couch
