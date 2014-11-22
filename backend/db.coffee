PouchDB = require 'pouchdb'
fs = require 'fs-extra'
path = require 'path-extra'
async = require 'async'
uuid = require 'node-uuid'
log = require('printit')
    prefix: 'DB'

config = require './config'

db = new PouchDB config.dbPath

# Listener memory leak test
db.setMaxListeners 100

fs.ensureDirSync config.dir


# TODO add test
newId = ->
    uuid.v4().split('-').join('')


# TODO add tests
getByKey = (query, key, callback) ->
    params =
        include_docs: true
        key: key
    db.query query, params, (err, docs) ->
        if err
            callback err
        else if docs.rows.length is 0
            callback()
        else
            callback null,  docs.rows[0].value

# TODO add tests
createNewDoc = (docType, fields, callback) ->
    fields.docType = docType
    fields._id = newId()
    db.put fields, callback


module.exports = dbHelpers =

    db: db

    # Create database and recreate all filters
    resetDatabase: (callback) ->
        PouchDB.destroy config.dbPath, ->
            db = dbHelpers.db = new PouchDB config.dbPath
            dbHelpers.addAllFilters callback

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

        upsert: (newDoc, callback) ->
            key = "#{newDoc.path}/#{newDoc.name}"
            dbHelpers.folders.get key, (err, prevDoc) ->
                if err and err.status isnt 404
                    callback err
                else
                    if prevDoc?
                        newDoc._id = prevDoc._id
                        newDoc._rev = prevDoc._rev
                        newDoc.creationDate = prevDoc.creationDate
                        newDoc.tags = prevDoc.tags
                        prevDate = new Date prevDoc.lastModification
                        newDate = new Date newDoc.lastModification

                        if prevDate > newDate
                            newDoc.lastModification = prevDoc.lastModification

                    db.put newDoc, (err, res) ->
                        if err
                            callback err
                        else
                            dbHelpers.storeLocalRev res.rev, ->
                                callback null, res


    binaries:
        rows: []
        all: (params, callback) ->
            if typeof params is 'function'
                callback = params
                params = {}
            dbHelpers.db.query 'binary/all', params, callback
        get: (key, callback) ->
            getByKey 'binary/byChecksum', key, callback


    # Create all required views in the database.
    addAllFilters: (callback) ->
        async.eachSeries [ 'folder', 'file', 'binary', 'localrev' ], @addFilter, callback


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

        dbHelpers.db.get id, (err, currentDesignDoc) ->
            if currentDesignDoc?
                doc._rev = currentDesignDoc._rev
            dbHelpers.db.put doc, (err) ->
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

        dbHelpers.db.get id, (err, currentDesignDoc) ->
            if currentDesignDoc?
                dbHelpers.db.remove id, currentDesignDoc._rev, checkRemove
            else
                log.warn "Trying to remove a doc that does not exist: #{id}"
                callback null


    # Remove given document id if it exists. Doesn't return an error if the
    # dociment doesn't exist.
    removeIfExists: (id, callback) ->
        dbHelpers.db.get id, (err, doc) ->
            if err and err.status isnt 404
                callback err
            else if err and err.status is 404
                callback()
            else
                dbHelpers.db.remove doc, callback


    # Retrieve a previous doc revision from its id.
    # TODO write a test
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
                callback new Error 'previous revision not found'


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
            _deleted: false
            docType: deletedDoc.docType

        # Since we use the same function to delete a file and a folder
        # we have to check if the binary key exists
        if deletedDoc.binary?
            emptyDoc.binary = deletedDoc.binary

        db.put emptyDoc, (err, res) ->
            if err
                callback err
            else
                dbHelpers.storeLocalRev res.rev, ->
                    db.remove res.id, res.rev, callback


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


    # Deprecated
    #
    allFiles: (forceQuery, callback) ->
        if forceQuery or @files.rows.length is 0
            db.query 'file/all', (err, res) ->
                @files = res or { rows: [] }
                callback err, res
        else
            callback null, @files


    allFolders: (forceQuery, callback) ->
        if forceQuery or @folders.rows.length is 0
            db.query 'folder/all', (err, res) ->
                @folders = res or { rows: [] }
                callback err, res
        else
            callback null, @folders


    allBinaries: (forceQuery, callback) ->
        if forceQuery or @binaries.rows.length is 0
            db.query 'binary/all', (err, res) ->
                @binaries = res or { rows: [] }
                callback err, res
        else
            callback null, @binaries


