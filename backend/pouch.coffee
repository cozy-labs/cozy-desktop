PouchDB = require 'pouchdb'
async   = require 'async'
path    = require 'path-extra'
log     = require('printit')
    prefix: 'Local Pouchdb '


# Pouchdb is used to store all the metadata about files and folders.
# These metadata can come from the local filesystem or the remote cozy instance.
#
# Best practices from:
# http://pouchdb.com/2014/06/17/12-pro-tips-for-better-code-with-pouchdb.html
# http://docs.ehealthafrica.org/couchdb-best-practices/
#
# For naming conventions, we kept those used on cozy and its couchdb. So, it's
# creationDate and lastModification instead of created_at and updated_at. And
# views name are in camelcase (byChecksum, not by-checksum).
class Pouch
    constructor: (@config) ->
        @db = new PouchDB @config.dbPath
        @db.setMaxListeners 100
        @db.on 'error', (err) -> log.debug err
        @updater = async.queue (task, callback) =>
            @db.get task._id, (err, doc) =>
                if err?.status is 404
                    @db.put task, callback
                else if err
                    callback err
                else
                    task._rev = doc._rev
                    @db.put task, callback

    # Create database and recreate all filters
    resetDatabase: (callback) =>
        @db.destroy =>
            @db = new PouchDB @config.dbPath
            @db.setMaxListeners 100
            @addAllViews callback


    ### Mini ODM ###

    # Run a query and get all the results
    getAll: (query, params, callback) =>
        if typeof params is 'function'
            callback = params
            params = include_docs: true
        @db.query query, params, (err, res) ->
            if err
                callback err
            else
                docs = (row.doc for row in res.rows)
                callback null, docs

    # Return all the files with this checksum
    byChecksum: (checksum, callback) ->
        params =
            key: checksum
            include_docs: true
        @getAll 'byChecksum', params, callback

    # Return all the files and folders in this path, only at first level
    byPath: (path, callback) ->
        params =
            key: path
            include_docs: true
        @getAll 'byPath', params, callback

    # Return all the files and folders in this path, even in subfolders
    # TODO add fuzzing tests
    byRecursivePath: (path, callback) ->
        if path is ''
            params =
                include_docs: true
        else
            params =
                startkey: "#{path}"
                endkey: "#{path}/\ufff0"
                include_docs: true
        @getAll 'byPath', params, callback

    # Return the file/folder with this remote id
    byRemoteId: (id, callback) ->
        params =
            key: id
            include_docs: true
        @db.query 'byRemoteId', params, (err, res) ->
            if err
                callback err
            else if res.rows.length is 0
                callback status: 404, message: 'missing'
            else
                callback null, res.rows[0].doc


    ### Views ###

    # Create all required views in the database
    # TODO don't recreate the same views again and again
    addAllViews: (callback) =>
        async.series [
            @addByPathView,
            @addByChecksumView,
            @addByRemoteIdView,
        ], (err) -> callback err

    # Create a view to list files and folders inside a path
    # The path for a file/folder in root will be '',
    # not '.' as with node's path.dirname
    addByPathView: (callback) =>
        query = (
            (doc) ->
                if 'docType' of doc
                    parts = doc._id.split '/'
                    parts.pop()
                    emit parts.join('/'), _id: doc._id
        ).toString()
        @createDesignDoc "byPath", query, callback

    # Create a view to find files by their checksum
    addByChecksumView: (callback) =>
        query = (
            (doc) ->
                if 'checksum' of doc
                    emit doc.checksum
        ).toString()
        @createDesignDoc "byChecksum", query, callback

    # Create a view to find file/folder by their _id on a remote cozy
    addByRemoteIdView: (callback) =>
        query = (
            (doc) ->
                if 'remote' of doc
                    emit doc.remote._id
        ).toString()
        @createDesignDoc "byRemoteId", query, callback

    # Create or update given design doc
    createDesignDoc: (name, query, callback) =>
        doc =
            _id: "_design/#{name}"
            views: {}
        doc.views[name] = map: query
        @db.get doc._id, (err, designDoc) =>
            doc._rev = designDoc._rev if designDoc?
            @db.put doc, (err) ->
                log.info "Design document created: #{name}" unless err
                callback err

    # Remove a design document for a given docType
    removeDesignDoc: (docType, callback) =>
        id = "_design/#{docType}"
        @db.get id, (err, designDoc) =>
            if designDoc?
                @db.remove id, designDoc._rev, callback
            else
                callback err


    ### Helpers ###

    # Retrieve a previous doc revision from its id
    getPreviousRev: (id, callback) =>
        options =
            revs: true
            revs_info: true
            open_revs: "all"

        @db.get id, options, (err, infos) =>
            if err
                callback err
            else if infos.length > 0 and infos[0].ok?._revisions?
                rev = infos[0].ok._revisions.ids[1]
                start = infos[0].ok._revisions.start
                rev = "#{start - 1}-#{rev}"
                @db.get id, rev: rev, callback
            else
                err = new Error 'previous revision not found'
                err.status = 404
                callback err


    ### Sequence numbers ###

    # Get last local replication sequence,
    # ie the last change from pouchdb that have been applied
    getLocalSeq: (callback) =>
        @db.get '_local/localSeq', (err, doc) ->
            if err?.status is 404
                callback null, 0
            else
                callback err, doc?.seq

    # Set last local replication sequence
    # It is saved in PouchDB as a local document
    # See http://pouchdb.com/guides/local-documents.html
    setLocalSeq: (seq, callback) =>
        task =
            _id: '_local/localSeq'
            _rev: doc?._rev
            seq: seq
        @updater.push task, callback

    # Get last remote replication sequence,
    # ie the last change from couchdb that have been saved in pouch
    getRemoteSeq: (callback) =>
        @db.get '_local/remoteSeq', (err, doc) ->
            if err?.status is 404
                callback null, 0
            else
                callback err, doc?.seq

    # Set last remote replication sequence
    # It is saved in PouchDB as a local document
    # See http://pouchdb.com/guides/local-documents.html
    setRemoteSeq: (seq, callback) =>
        task =
            _id: '_local/remoteSeq'
            seq: seq
        @updater.push task, callback


module.exports = Pouch
