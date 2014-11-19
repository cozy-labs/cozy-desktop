PouchDB = require 'pouchdb'
fs = require 'fs-extra'
async = require 'async'
log = require('printit')
    prefix: 'Data Proxy | db'

config = require './config'

db = new PouchDB(config.dbPath)

# Listener memory leak test
db.setMaxListeners 100

fs.ensureDirSync config.dir


module.exports = dbHelpers =

    db: db

    # Create database and recreate all filters
    resetDatabase: (callback) ->
        PouchDB.destroy config.dbPath, ->
            dbHelpers.db = new PouchDB config.dbPath
            dbHelpers.addAllFilters callback

    files:
        rows: []
        all: (params, callback) ->
            callback = params if typeof params is 'function'
            dbHelpers.db.query 'file/all', params, callback

    folders:
        rows: []
        all: (params, callback) ->
            callback = params if typeof params is 'function'
            dbHelpers.db.query 'folder/all', params, callback

    binaries:
        rows: []
        all: (params, callback) ->
            callback = params if typeof params is 'function'
            dbHelpers.db.query 'binary/all', params, callback


    # Create all required views in the database.
    addAllFilters: (callback) ->
        async.eachSeries [ 'folder', 'file', 'binary' ], @addFilter, callback


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


