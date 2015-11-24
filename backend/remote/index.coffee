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
    constructor: (@config, @merge, @pouch) ->
        @couch   = new Couch @config
        @watcher = new Watcher @couch, @merge, @pouch
        @other   = null

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
        log.info "Upload binary #{doc.checksum}"
        binary =
            _id: doc.checksum
            docType: 'Binary'
            checksum: doc.checksum
        async.waterfall [
            (next) =>
                @couch.put binary, next
            (created, next) =>
                binary._rev = created.rev
                @other.createReadStream doc, next
            (stream, next) =>
                @couch.uploadAsAttachment binary._id, binary._rev, stream, next
        ], (err) ->
            if err and binary._rev
                @couch.remove binary._id, binary._rev, -> callback err
            else if err and err.status is 409
                callback null, binary
            else
                callback err, binary

    # Extract the remote path and name from a local id
    extractDirAndName: (id) ->
        dir = path.dirname "/#{id}"
        name = path.basename id
        dir = '' if dir is '/'
        return [dir, name]

    # Transform a local document in a remote one, with optional binary ref
    createRemoteDoc: (local, remote) ->
        [dir, name] = @extractDirAndName local._id
        doc =
            docType: local.docType
            path: dir
            name: name
            creationDate: local.creationDate
            lastModification: local.lastModification
        for field in ['checksum', 'size', 'class', 'mime', 'tags']
            doc[field] = local[field] if local[field]
        if remote
            doc._id = remote._id
            doc._rev = remote._rev
            if remote.binary
                doc.binary =
                    file:
                        id:  remote.binary._id
                        rev: remote.binary._rev
        doc._id ?= Couch.newId()
        return doc

    # Remove the binary if it is no longer referenced
    cleanBinary: (binaryId, callback) =>
        @couch.get binaryId, (err, doc) =>
            if err
                callback err
            else
                @pouch.byChecksum doc.checksum, (err, files) =>
                    if err or files.length isnt 0
                        callback err
                    else
                        @couch.remove doc._id, doc._rev, callback

    # Compare two remote docs and say if they are the same,
    # i.e. can we replace one by the other with no impact
    sameRemoteDoc: (one, two) ->
        for field in ['path', 'name', 'creationDate', 'checksum', 'size']
            return false if one[field] isnt two[field]
        return true

    # Put the document on the remote cozy
    # In case of a conflict in CouchDB, try to see if the changes on the remote
    # sides are trivial and can be ignored.
    # TODO add an integration test where an image is added, updated and removed
    putRemoteDoc: (doc, old, callback) =>
        @couch.put doc, (err, created) =>
            if err?.status is 409
                oldRemote = {}
                oldRemote = @createRemoteDoc old if old
                @couch.get doc._id, (err, remoteDoc) =>
                    if err
                        callback err
                    else if @sameRemoteDoc remoteDoc, oldRemote
                        doc._rev = remoteDoc._rev
                        @couch.put doc, callback
                    else
                        callback new Error 'Conflict'
            else
                callback err, created

    # Remove a remote document
    # In case of a conflict in CouchDB, try to see if the changes on the remote
    # sides are trivial and can be ignored.
    removeRemoteDoc: (doc, callback) =>
        doc._deleted = true
        @couch.put doc, (err, removed) =>
            if err?.status is 409
                @couch.get doc._id, (err, current) =>
                    if err
                        callback err
                    else if @sameRemoteDoc current, doc
                        current._deleted = true
                        @couch.put current, callback
                    else
                        callback new Error 'Conflict'
            else
                callback err, removed


    ### Write operations ###

    # Create a file on the remote cozy instance
    # It can also be an overwrite of the file
    addFile: (doc, callback) =>
        log.info "Add file #{doc._id}"
        @addOrOverwriteFile doc, null, callback

    # Create a folder on the remote cozy instance
    addFolder: (doc, callback) =>
        log.info "Add folder #{doc._id}"
        folder = @createRemoteDoc doc
        @couch.put folder, (err, created) ->
            unless err
                doc.remote =
                    _id:  created.id
                    _rev: created.rev
            callback err, created

    # Overwrite a file
    overwriteFile: (doc, old, callback) =>
        log.info "Overwrite file #{doc._id}"
        @addOrOverwriteFile doc, old, callback

    # Add or overwrite a file
    addOrOverwriteFile: (doc, old, callback) =>
        async.waterfall [
            # Find or create the binary doc
            (next) =>
                @pouch.byChecksum doc.checksum, (err, files) =>
                    binary = null
                    for file in files or []
                        binary = file.remote.binary if file.remote?
                    if binary
                        next null, binary
                    else
                        @uploadBinary doc, next

            # Save the 'file' document in the remote couch
            (binaryDoc, next) =>
                remote =
                    _id:  old?.remote._id
                    _rev: old?.remote._rev
                    binary: binaryDoc
                remoteDoc = @createRemoteDoc doc, remote
                @putRemoteDoc remoteDoc, old, (err, created) ->
                    next err, created, binaryDoc

            # Save remote and clean previous binary
            (created, binaryDoc, next) =>
                doc.remote =
                    _id:  created.id
                    _rev: created.rev
                    binary:
                        _id:  binaryDoc._id
                        _rev: binaryDoc._rev
                if old?.remote
                    @cleanBinary old.remote.binary._id, next
                else
                    next null, created
        ], callback

    # Update the metadata of a file
    updateFileMetadata: (doc, old, callback) ->
        log.info "Update file #{doc._id}"
        if old.remote
            remoteDoc = @createRemoteDoc doc, old.remote
            @putRemoteDoc remoteDoc, old, (err, updated) ->
                unless err
                    doc.remote =
                        _id:  updated.id
                        _rev: updated.rev
                        binary: old.remote.binary
                callback err, updated
        else
            @addFile doc, callback

    # Update metadata of a folder
    updateFolder: (doc, old, callback) ->
        log.info "Update folder #{doc._id}"
        if old.remote
            @couch.get old.remote._id, (err, folder) =>
                if err
                    callback err
                else
                    # TODO what if folder.path+name != doc._id ?
                    # TODO Or folder._rev != doc.remote._rev
                    folder.tags = doc.tags
                    folder.lastModification = doc.lastModification
                    @couch.put folder, (err, updated) ->
                        unless err
                            doc.remote =
                                _id:  updated.id
                                _rev: updated.rev
                        callback err, updated
        else
            @addFolder doc, callback

    # Move a file on the remote cozy instance
    moveFile: (doc, old, callback) ->
        log.info "Move file #{old._id} → #{doc._id}"
        if old.remote
            @couch.get old.remote._id, (err, remoteDoc) =>
                if err
                    @addFile doc, callback
                else
                    [dir, name] = @extractDirAndName doc._id
                    remoteDoc.path = dir
                    remoteDoc.name = name
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
        log.info "Move folder #{old._id} → #{doc._id}"
        if old.remote
            @couch.get old.remote._id, (err, folder) =>
                if err
                    callback err
                else
                    # TODO what if folder.path+name != old._id ?
                    # TODO Or folder._rev != doc.remote._rev
                    [dir, name] = @extractDirAndName doc._id
                    folder.path = dir
                    folder.name = name
                    folder.tags = doc.tags
                    folder.lastModification = doc.lastModification
                    @couch.put folder, callback
        else
            @addFolder doc, callback

    # Delete a file on the remote cozy instance
    deleteFile: (doc, callback) =>
        log.info "Delete file #{doc._id}"
        return callback() unless doc.remote
        remoteDoc = @createRemoteDoc doc, doc.remote
        @removeRemoteDoc remoteDoc, (err, removed) =>
            if err
                callback err, removed
            else
                @cleanBinary doc.remote.binary._id, (err) ->
                    callback null, removed

    # Delete a folder on the remote cozy instance
    deleteFolder: (doc, callback) =>
        log.info "Delete folder #{doc._id}"
        if doc.remote
            remoteDoc = @createRemoteDoc doc, doc.remote
            remoteDoc._deleted = true
            @couch.put remoteDoc, callback
        else
            callback()


module.exports = Remote
