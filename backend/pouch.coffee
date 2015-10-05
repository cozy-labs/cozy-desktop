PouchDB = require 'pouchdb'
fs      = require 'fs-extra'
path    = require 'path-extra'
async   = require 'async'
uuid    = require 'node-uuid'
moment  = require 'moment'
log     = require('printit')
    prefix: 'Local Pouchdb '

config    = require './config'
conflict  = require './conflict'
progress  = require './progress'

fs.ensureDirSync config.dir

db = new PouchDB config.dbPath

# Listener memory leak fix
db.setMaxListeners 100


newId = ->
    uuid.v4().split('-').join('')


getByKey = (query, key, callback) ->
    if key?
        params =
            include_docs: true
            key: key
        db.query query, params, (err, docs) ->
            if err?.status is 404
                callback null, []
            else if err
                callback err
            else if docs.rows.length is 0
                callback()
            else
                if value?
                    callback null, docs.rows[0].value
                else
                    callback null, docs.rows[0].doc
    else
        callback null, []

# TODO add tests
createNewDoc = (docType, fields, callback) ->
    fields.docType = docType
    fields._id = newId()
    db.put fields, callback


module.exports = dbHelpers =

    db: db
    replicatorTo: null
    replicationDelay: 0

    # Create database and recreate all filters
    resetDatabase: (callback) ->
        db.destroy ->
            db = dbHelpers.db = new PouchDB config.dbPath
            dbHelpers.addAllFilters callback

    # Dirty ORM

    files:

        rows: []

        all: (params, callback) ->
            if typeof params is 'function'
                callback = params
                params = {}
            dbHelpers.db.query 'file/all', params, callback

        get: (key, callback) ->
            getByKey 'file/byFullPath', key, callback

        createNew: (fields, callback) ->
            createNewDoc 'File', fields, callback

    folders:

        rows: []

        all: (params, callback) ->
            if typeof params is 'function'
                callback = params
                params = {}
            dbHelpers.db.query 'folder/all', params, callback

        get: (key, callback) ->
            getByKey 'folder/byFullPath', key, callback

        createNew: (fields, callback) ->
            createNewDoc 'Folder', fields, callback

    binaries:

        rows: []

        all: (params, callback) ->
            if typeof params is 'function'
                callback = params
                params = {}
            db.query 'binary/all', params, callback

        get: (key, callback) ->
            getByKey 'binary/byChecksum', key, callback


    # Create all required views in the database.
    addAllFilters: (callback) ->
        async.eachSeries(
            [ 'folder', 'file', 'binary', 'localrev' ], @addFilter, callback)


    # Add required views for a given doctype.
    addFilter: (docType, callback) ->
        id = "_design/#{docType.toLowerCase()}"
        queries =
            all: """
        function (doc) {
            if (doc.docType !== undefined
                && doc.docType.toLowerCase() === "#{docType}".toLowerCase()) {
                emit(doc._id, doc);
            }
        }
        """

        if docType in ['file', 'folder', 'binary', 'File', 'Folder', 'Binary']
            queries.byFullPath = """
        function (doc) {
            if (doc.docType !== undefined
                && doc.docType.toLowerCase() === "#{docType}".toLowerCase()) {
                emit(doc.path + '/' + doc.name, doc);
            }
        }
        """

        if docType in ['binary', 'Binary']
            queries.byChecksum = """
        function (doc) {
            if (doc.docType !== undefined
                && doc.docType.toLowerCase() === "#{docType}".toLowerCase()) {
                emit(doc.checksum, null);
            }
        }
        """

        if docType in ['file', 'File']
            queries.byChecksum = """
        function (doc) {
            if (doc.docType !== undefined
                && doc.docType.toLowerCase() === "#{docType}".toLowerCase()) {
                emit(doc.binary.file.checksum, doc);
            }
        }
        """

        if docType in ['localrev', 'localRev']
            queries.byRevision = """
        function (doc) {
            if (doc.docType !== undefined
                && doc.docType.toLowerCase() === "#{docType}".toLowerCase()) {
                emit(doc.revision, null);
            }
        }
        """

        dbHelpers.createDesignDoc id, queries, (err, res) ->
            if err?
                if err.status is 409
                    conflict.display err
                    callback null
                else
                    callback err
            else
                callback null


    # Create or update given design doc.
    createDesignDoc: (id, queries, callback) ->
        doc =
            _id: id
            views:
                all:
                    map: queries.all

        if queries.byFullPath?
            doc.views.byFullPath =
                map: queries.byFullPath

        if queries.byChecksum?
            doc.views.byChecksum =
                map: queries.byChecksum

        if queries.byRevision?
            doc.views.byRevision =
                map: queries.byRevision

        db.get id, (err, currentDesignDoc) ->
            if currentDesignDoc?
                doc._rev = currentDesignDoc._rev
            db.put doc, (err) ->
                if err
                    callback err
                else
                    log.info "Design document created: #{id}"
                    callback()

    # Remove filters for a given doc type.
    removeFilter: (docType, callback) ->
        id = "_design/#{docType.toLowerCase()}"

        checkRemove = (err, res) ->
            if err?
                callback err
            else
                callback null

        db.get id, (err, currentDesignDoc) ->
            if currentDesignDoc?
                db.remove id, currentDesignDoc._rev, checkRemove
            else
                log.warn "Trying to remove a doc that does not exist: #{id}"
                callback null

    ## Helpers

    # Remove given document id if it exists. Doesn't return an error if the
    # document doesn't exist.
    removeIfExists: (id, callback) ->
        db.get id, (err, doc) ->
            if err and err.status isnt 404
                callback err
            else if err and err.status is 404
                callback()
            else
                db.remove doc, callback


    # Retrieve a previous doc revision from its id.
    getPreviousRev: (id, callback) ->
        options =
            revs: true
            revs_info: true
            open_revs: "all"

        db.get id, options, (err, infos) ->
            if err
                callback err
            else if infos.length > 0 and infos[0].ok?._revisions?
                rev = infos[0].ok._revisions.ids[1]
                start = infos[0].ok._revisions.start
                rev = "#{start - 1}-#{rev}"

                db.get id, rev: rev, callback
            else
                err = new Error 'previous revision not found'
                err.status = 404
                callback err


    # Retrieve a known path from a doc, based on the doc's previous revisions
    getKnownPath: (doc, callback) ->
        remoteConfig = config.getConfig()

        # Normally a file should have its binary information kept by the
        # data-system.
        if doc.binary?.file?.id? and (not doc._deleted)
            db.get doc.binary.file.id, (err, res) ->
                if err and err.status is 404
                    # Retry with the file DB document if the binary DB document
                    # was not found.
                    doc.binary = null
                    dbHelpers.getKnownPath doc, callback
                else if err
                    callback err
                else
                    callback null, res.path

        # Otherwise try to get the previous revision that would contain the
        # deleted file or folder path.
        else
            dbHelpers.getPreviousRev doc._id, (err, res) ->
                if err and err.status isnt 404
                    callback err
                else if res?.path? and res?.name?
                    filePath = path.join remoteConfig.path, res.path, res.name
                    callback null, filePath
                else
                    log.debug "Unable to find a file/folder path"
                    log.debug res
                    callback null


    # Mark a document as deleted in the database (flag _deleted). Then delete
    # the document. This operation is required to remove the document remotely
    # via synchronization.
    #TODO add test
    markAsDeleted: (deletedDoc, callback) ->

        # Use the same method as in DS:
        # https://github.com/cozy/cozy-data-system/blob/master/server/lib/db_remove_helper.coffee#L7
        emptyDoc =
            _id: deletedDoc._id
            _rev: deletedDoc._rev
            _deleted: true
            docType: deletedDoc.docType

        # Since we use the same function to delete a file and a folder
        # we have to check if the binary key exists
        if deletedDoc.binary?
            emptyDoc.binary = deletedDoc.binary

        db.put emptyDoc, (err, res) ->
            if err
                callback err
            else
                dbHelpers.storeLocalRev res.rev, callback

    # Store a revision to avoid its re-application
    # (typically when a doc changes after a local FS modification)
    storeLocalRev: (rev, callback) ->
        db.put
            _id: uuid.v4().split('-').join('')
            docType: 'localrev'
            revision: rev
        , (err, res) ->
            if err
                log.error 'Unable to save local revision'
                callback err
            else
                callback null

    odm: {newId, getByKey, createNewDoc}
