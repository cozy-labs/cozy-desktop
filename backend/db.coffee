PouchDB = require 'pouchdb'
fs = require 'fs-extra'
log = require('printit')
    prefix: 'Data Proxy | db'

config = require './config'

# Self-promisification
Promise = require 'bluebird'
db = Promise.promisifyAll(new PouchDB config.dbPath)

# Listener memory leak test
db.setMaxListenersAsync 30

fs.ensureDirSync config.dir

module.exports =

    db: db

    addFilter: (docType, callback) ->
        id = "_design/#{docType.toLowerCase()}"
        map = """
            function (doc) {
                if (doc.docType.toLowerCase() === "#{docType}".toLowerCase()) {
                    return emit(doc._id, doc);
                }
            }
        """

        newDesignDoc =
            _id: id
            views:
                all:
                    map: map

        db.get id, (err, currentDesignDoc) ->
            callback null
            if currentDesignDoc?
                newDesignDoc._rev = currentDesignDoc._rev
            db.put newDesignDoc, (err, res) ->
                if err?
                    if err.status is 409
                        callback null
                    else
                        callback err
                else
                    log.info "Design document created: #{id}" if not currentDesignDoc?
                    callback null

    removeFilter: (docType, callback) ->
        id = "_design/#{docType.toLowerCase()}"

        db.get id, (err, currentDesignDoc) ->
            if currentDesignDoc?
                db.remove id, currentDesignDoc._rev, (err, res) ->
                    if err?
                        callback err
                    else
                        callback null
            else
                log.info "Design document does not exist: #{id}"
                callback null

