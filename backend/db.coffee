PouchDB = require 'pouchdb'
fs = require 'fs-extra'
log = require('printit')
    prefix: 'Data Proxy | db'

config = require './config'

# Self-promisification
db = new PouchDB(config.dbPath)

# Listener memory leak test
db.setMaxListeners 30

fs.ensureDirSync config.dir

module.exports =

    db: db


    addFilter: (docType, callback) ->
        id = "_design/#{docType.toLowerCase()}"
        all = """
            function (doc) {
                if (doc.docType.toLowerCase() === "#{docType}".toLowerCase()) {
                    emit(doc._id, doc);
                }
            }
        """

        newDesignDoc =
            _id: id
            views:
                all:
                    map: all

        if docType in ['file', 'folder', 'File', 'Folder']
            byFullPath = """
                function (doc) {
                    if (doc.docType.toLowerCase() === "#{docType}".toLowerCase()) {
                        emit(doc.path + '/' + doc.name, doc);
                    }
                }
            """

            newDesignDoc.views.byFullPath =
                map: byFullPath

        checkCreation = (err, res) ->
            if err?
                if err.status is 409
                    callback null
                else
                    callback err
            else
                callback null

        createDesignDoc = (err, currentDesignDoc) ->
            if currentDesignDoc?
                newDesignDoc._rev = currentDesignDoc._rev
            else
                log.info "Design document created: #{id}"
            db.put newDesignDoc, checkCreation

        db.get id, createDesignDoc


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
