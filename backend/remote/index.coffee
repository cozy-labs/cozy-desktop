async = require 'async'
path  = require 'path'
log   = require('printit')
    prefix: 'Remote writer '

Couch   = require './couch'
Watcher = require './watcher'


# TODO when a file is removed, delete its binary if not used by another file
class Remote
    constructor: (@config, @merge, @pouch, @events) ->
        @couch = new Couch @config, @events
        @watcher = new Watcher @couch, @merge, @pouch
        @other = null

    # Start initial replication + watching changes in live
    start: (done) =>
        @watcher.listenToChanges live: false, (err) =>
            done err
            @watcher.listenToChanges live: true unless err

    # Create a readable stream for the given doc
    createReadStream: (doc, callback) =>
        if doc.remote.binary?
            @couch.downloadBinary doc.remote.binary._id, callback
        else
            callback new Error 'Cannot download the file'


    ### Helpers ###

    # Upload the binary as a CouchDB document's attachment and return
    # the binary document
    uploadBinary: (doc, callback) ->
        binary =
            _id: doc.checksum
            docType: 'Binary'
            checksum: doc.checksum
        rev = null
        async.waterfall [
            (next) =>
                @couch.put binary, next
            (created, next) =>
                rev = created._rev
                @other.createReadStream doc, next
            (stream, next) =>
                @couch.uploadAsAttachment doc._id, rev, stream, next
        ], (err) ->
            if err and rev
                @couch.remove binary._id, rev, -> callback err
            else
                callback err, binary


    ### Write operations ###

    # Create a file on the remote cozy instance
    # It can also be an overwrite of the file
    # TODO save infos in pouch?
    addFile: (doc, callback) =>
        async.waterfall [
            # Create the binary doc if it doesn't exist
            (next) =>
                # TODO check if the binary already exists in pouchdb
                @uploadBinary doc, next

            # Save the 'file' document in the remote couch
            (binaryDoc, next) =>
                # TODO transform doc + add binary infos
                @couch.put doc, next

        ], callback

    # Create a folder on the remote cozy instance
    # TODO should we keep remote id and rev here or wait for the changes feed?
    addFolder: (doc, callback) =>
        folder =
            _id: Couch.newId()
            path: path.dirname doc._id
            name: path.basename doc._id
            docType: 'folder'
            tags: doc.tags
            creationDate: doc.creationDate
            lastModification: doc.lastModification
        @couch.put folder, callback

    # TODO
    updateFile: (doc, callback) ->
        callback()

    # Update metadata of a folder
    updateFolder: (doc, callback) ->
        if doc.remote
            @couch.get doc.remote._id, (err, folder) =>
                if err
                    callback err
                else
                    # TODO what if folder.path+name != doc._id ?
                    # TODO Or folder._rev != doc.remote._rev
                    folder.tags = doc.tags
                    folder.lastModification = doc.lastModification
                    @couch.put folder, callback
        else
            @addFolder doc, callback

    # Move a file on the remote cozy instance
    moveFile: (doc, old, callback) =>
        @couch.put doc, old.rev, callback

    # Move a folder on the remote cozy instance
    moveFolder: (doc, old, callback) =>
        if doc.remote
            @couch.get doc.remote._id, (err, folder) =>
                if err
                    callback err
                else
                    # TODO what if folder.path+name != old._id ?
                    # TODO Or folder._rev != doc.remote._rev
                    folder.path = path.dirname doc._id
                    folder.name = path.basename doc._id
                    folder.tags = doc.tags
                    folder.lastModification = doc.lastModification
                    @couch.put folder, callback
        else
            @addFolder doc, callback

    # Delete a file on the remote cozy instance
    # TODO delete the corresponding binary
    deleteFile: (doc, callback) =>
        if doc.remote
            @couch.remove doc.remote._id, doc.remote._rev, callback
        else
            callback()

    # Delete a folder on the remote cozy instance
    deleteFolder: (doc, callback) =>
        if doc.remote
            @couch.remove doc.remote._id, doc.remote._rev, callback
        else
            callback()


module.exports = Remote
