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

    resetDatabase: (callback) ->
        PouchDB.destroy config.dbPath, ->
            db = new PouchDB config.dbPath
            callback()

    files:
        rows: []

    allFiles: (forceQuery, callback) ->
        if forceQuery or @files.rows.length is 0
            db.query 'file/all', (err, res) ->
                @files = res or { rows: [] }
                callback err, res
        else
            callback null, @files

    folders:
        rows: []

    allFolders: (forceQuery, callback) ->
        if forceQuery or @folders.rows.length is 0
            db.query 'folder/all', (err, res) ->
                @folders = res or { rows: [] }
                callback err, res
        else
            callback null, @folders

    binaries:
        rows: []

    allBinaries: (forceQuery, callback) ->
        if forceQuery or @binaries.rows.length is 0
            db.query 'binary/all', (err, res) ->
                @binaries = res or { rows: [] }
                callback err, res
        else
            callback null, @binaries

    addAllFilters: (callback) ->
        async.eachSeries [ 'folder', 'file', 'binary' ], @addFilter, callback

    addFilter: (docType, callback) ->
        id = "_design/#{docType.toLowerCase()}"
        queries =
            all: """
        function (doc) {
            if (doc.docType.toLowerCase() === "#{docType}".toLowerCase()) {
                emit(doc._id, doc);
            }
        }
        """
            byFullPath: """
        function (doc) {
            if (doc.docType.toLowerCase() === "#{docType}".toLowerCase()) {
                emit(doc.path + '/' + doc.name, doc);
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
        newDesignDoc =
            _id: id
            views:
                all:
                    map: queries.all

        if docType in ['file', 'folder', 'binary', 'File', 'Folder', 'Binary']
            newDesignDoc.views.byFullPath =
                map: queries.byFullPath

        db.get id, (err, currentDesignDoc) ->
            if currentDesignDoc?
                doc._rev = currentDesignDoc._rev
            else
                log.info "Design document created: #{id}"
            db.put doc, callback


    removeFilter: (docType, callback) ->
        id = "_design/#{docType.toLowerCase()}"

        checkRemove = (err, res) ->
            if err?
                callback err
            else
                callback null

        removeDesignDoc = (err, currentDesignDoc) ->
            if currentDesignDoc?
                db.remove id, currentDesignDoc._rev, checkRemove
            else
                log.info "Design document does not exist: #{id}"
                callback null

        db.get id, removeDesignDoc
