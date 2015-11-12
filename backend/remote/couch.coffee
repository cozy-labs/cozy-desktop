PouchDB = require 'pouchdb'
async   = require 'async'
fs      = require 'fs-extra'
path    = require 'path-extra'
moment  = require 'moment'
request = require 'request-json-light'
uuid    = require 'node-uuid'
log     = require('printit')
    prefix: 'Remote CouchDB'


# Couch is an helper class for communication with a remote couchdb.
# It uses the pouchdb library for usual stuff, as it helps to deal with errors.
# But for attachments, pouchdb uses buffers, which is not ideal in node.js
# because it can takes a lot of memory. So, we prefered to use
# request-json-light, that can stream data.
class Couch

    # Create a new unique identifier for CouchDB
    @newId: ->
        uuid.v4().replace /-/g, ''

    constructor: (@config, @events) ->
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

    # Save a document on the remote couch
    put: (doc, callback) =>
        @client.put doc, callback

    # Delete a document on the remote couch
    remove: (id, rev, callback) =>
        @client.remove id, rev, callback

    # Get the last sequence number from the remote couch
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

    # Retrieve documents from a view on the remote couch
    getFromRemoteView: (model, callback) =>
        @pickViewToCopy model, (err, viewName) =>
            return callback err if err
            log.debug "Getting latest #{model} documents from remote"
            id = "_design/#{model}/_view/#{viewName}/"
            @client.get id, (err, body) ->
                callback err, body?.rows

    # Upload given file as attachment of given document (id + revision)
    # TODO when we upload a stream, the content-type is lost in couchdb
    uploadAsAttachment: (id, rev, attachment, callback) =>
        urlPath = "cozy/#{id}/file?rev=#{rev}"
        @http.putFile urlPath, attachment, (err, res, body) ->
            if err
                callback err
            else if body.error
                callback body.error
            else
                log.info "Binary uploaded"
                callback null, body
        # TODO progress.showUpload filePath, streams.fileStream

    # Give a readable stream of a file stored on the remote couch
    downloadBinary: (binaryId, callback) =>
        url = "cozy/#{binaryId}/file"
        log.info "Download #{url}"
        @http.saveFileAsStream url, callback


module.exports = Couch
