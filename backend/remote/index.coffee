async = require 'async'
path  = require 'path'
log   = require('printit')
    prefix: 'Remote writer '

Couch   = require './couch'
Watcher = require './watcher'


# Remote is the class that coordinates the interaction with the remote cozy
# instance. It uses a watcher for replicating changes from the remote cozy to
# the local pouchdb. It also applies the changes from the local pouchdb to the
# remote cozy.
#
# Please note that the structure of the documents in the remote couchdb and in
# the local pouchdb are similar, but not exactly the same. A transformation is
# needed in both ways.
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
            @couch.downloadBinary doc.remote.binary, callback
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
                rev = created.rev
                @other.createReadStream doc, next
            (stream, next) =>
                @couch.uploadAsAttachment binary._id, rev, stream, next
        ], (err) ->
            if err and rev
                @couch.remove binary._id, rev, -> callback err
            else if err and err.status is 409
                callback null, binary
            else
                callback err, binary

    # Transform a local document in a remote one, with optional binary ref
    createRemoteDoc: (local, binary) ->
        doc =
            _id: local._id or Couch.newId()
            docType: local.docType
            path: path.dirname local._id
            name: path.basename local._id
            creationDate: local.creationDate
            lastModification: local.lastModification
        doc.path = '' if doc.path is '.'
        for field in ['size', 'class', 'mime', 'tags']
            doc[field] = local[field] if local[field]
        if binary
            doc.binary =
                file:
                    id:  binary._id
                    rev: binary._rev
        return doc


    ### Write operations ###

    # Create a file on the remote cozy instance
    # It can also be an overwrite of the file
    addFile: (doc, callback) =>
        async.waterfall [
            # Find or create the binary doc
            (next) =>
                @pouch.byChecksum doc.checksum, (err, files) =>
                    binaryId = false
                    for file in files or []
                        binaryId = file.remote.binary if file.remote?
                    if binaryId
                        next null, _id: binaryId
                    else
                        @uploadBinary doc, next

            # Save the 'file' document in the remote couch
            (binaryDoc, next) =>
                remoteDoc = @createRemoteDoc doc, binaryDoc
                @couch.put remoteDoc, (err, created) ->
                    unless err
                        doc.remote =
                            _id: created.id
                            _rev: created.rev
                            binary: binaryDoc._id
                    next err, created
        ], callback

    # Create a folder on the remote cozy instance
    addFolder: (doc, callback) =>
        folder = @createRemoteDoc doc
        @couch.put folder, (err, created) ->
            unless err
                doc.remote =
                    _id: created.id
                    _rev: created.rev
            callback err, created

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
                    @couch.put folder, (err, updated) ->
                        doc.remote._rev = updated.rev unless err
                        callback err, updated
        else
            @addFolder doc, callback

    # Move a file on the remote cozy instance
    moveFile: (doc, old, callback) ->
        if old.remote
            @couch.get old.remote._id, (err, remoteDoc) =>
                if err
                    @addFile doc, callback
                else
                    remoteDoc.path = path.dirname doc._id
                    remoteDoc.name = path.basename doc._id
                    remoteDoc.lastModification = doc.lastModification
                    @couch.put remoteDoc, (err, moved) ->
                        unless err
                            doc.remote =
                                _id: moved.id
                                _rev: moved.rev
                                binary: old.remote.binary
                        callback err, moved
        else
            @addFile doc, callback

    # Move a folder on the remote cozy instance
    moveFolder: (doc, old, callback) =>
        if old.remote
            @couch.get old.remote._id, (err, folder) =>
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
    deleteFile: (doc, callback) =>
        return callback() unless doc.remote
        @couch.remove doc.remote._id, doc.remote._rev, (err, removed) =>
            if err
                callback err, removed
            else
                @pouch.byChecksum doc.checksum, (err, files) =>
                    if files?.length is 0
                        @couch.get doc.remote.binary, (err, binary) =>
                            if err
                                callback null, removed
                            else
                                @couch.remove binary.id, binary.rev, (err) ->
                                    callback null, removed
                    else
                        callback null, removed

    # Delete a folder on the remote cozy instance
    deleteFolder: (doc, callback) =>
        if doc.remote
            @couch.remove doc.remote._id, doc.remote._rev, callback
        else
            callback()


module.exports = Remote
