async   = require 'async'
clone   = require 'lodash.clone'
crypto  = require 'crypto'
path    = require 'path'
log     = require('printit')
    prefix: 'Remote writer '
    date: true

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
    constructor: (@config, @prep, @pouch, @events) ->
        @couch   = new Couch @config, @events
        deviceName = @config.getDefaultDeviceName()
        @watcher = new Watcher @couch, @prep, @pouch, deviceName
        @other   = null

    # Start initial replication + watching changes in live
    start: (done) =>
        @watcher.listenToChanges live: false, (err) =>
            done err
            unless err
                @watching = true
                @watcher.listenToChanges live: true, =>
                    @watching = false

    # Stop listening to couchdb changes
    stop: (callback) ->
        @watcher.stopListening()
        interval = setInterval =>
            unless @watching
                clearInterval interval
                callback()
        , 100

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
                @other.createReadStream doc, (err, stream) =>
                    # Don't use async callback here!
                    # Async does some magic and the stream can throw an 'error'
                    # event before the next async callback is called...
                    return next err if err
                    stream.on 'error', -> next new Error 'Invalid file'
                    # Be sure that the checksum is correct
                    checksum = crypto.createHash 'sha1'
                    checksum.setEncoding 'hex'
                    stream.pipe checksum
                    stream.on 'end', ->
                        checksum.end()
                        if checksum.read() isnt doc.checksum
                            next new Error 'Invalid checksum'
                    # Emit events to track the download progress
                    info = clone doc
                    info.way = 'up'
                    info.eventName = "transfer-up-#{doc._id}"
                    @events.emit 'transfer-started', info
                    stream.on 'data', (data) =>
                        @events.emit info.eventName, data
                    stream.on 'close', =>
                        @events.emit info.eventName, finished: true
                    {_id, _rev} = binary
                    mime = doc.mime or 'application/octet-stream'
                    @couch.uploadAsAttachment _id, _rev, mime, stream, next
        ], (err) =>
            [cb, callback] = [callback, ->]  # Be sure to callback only once
            if err and binary._rev
                @couch.remove binary._id, binary._rev, -> cb err
            else if err and err.status is 409
                cb null, binary
            else
                cb err, binary

    # Extract the remote path and name from a local id
    extractDirAndName: (id) ->
        dir = path.dirname "/#{id}"
        name = path.basename id
        dir = '' if dir is '/'
        return [dir, name]

    # Transform a local document in a remote one, with optional binary ref
    createRemoteDoc: (local, remote) ->
        [dir, name] = @extractDirAndName local.path
        doc =
            docType: local.docType
            path: dir
            name: name
            creationDate: local.creationDate
            lastModification: local.lastModification
        for field in ['checksum', 'size', 'class', 'mime', 'tags', 'localPath']
            doc[field] = local[field] if local[field]
        doc.executable = true if local.executable
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

    # Return true if the remote file is up-to-date for this document
    isUpToDate: (doc) ->
        currentRev = doc.sides.remote or 0
        lastRev = @pouch.extractRevNumber doc
        return currentRev is lastRev


    ### Write operations ###

    # Create a file on the remote cozy instance
    # It can also be an overwrite of the file
    addFile: (doc, callback) =>
        log.info "Add file #{doc.path}"
        @addOrOverwriteFile doc, null, callback

    # Create a folder on the remote cozy instance
    addFolder: (doc, callback) =>
        log.info "Add folder #{doc.path}"
        folder = @createRemoteDoc doc
        @couch.put folder, (err, created) ->
            unless err
                doc.remote =
                    _id:  created.id
                    _rev: created.rev
            callback err, created

    # Overwrite a file
    overwriteFile: (doc, old, callback) =>
        log.info "Overwrite file #{doc.path}"
        @addOrOverwriteFile doc, old, callback

    # Add or overwrite a file
    addOrOverwriteFile: (doc, old, callback) =>
        async.waterfall [
            # Find or create the binary doc
            (next) =>
                @pouch.byChecksum doc.checksum, (err, files) =>
                    binary = null
                    for file in files or [] when @isUpToDate file
                        binary = file.remote.binary
                    if binary
                        @events.emit 'transfer-copy', doc
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
                remoteOld = {}
                remoteOld = @createRemoteDoc old if old
                @couch.putRemoteDoc remoteDoc, remoteOld, (err, created) ->
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
        log.info "Update file #{doc.path}"
        if old.remote
            remoteDoc = @createRemoteDoc doc, old.remote
            remoteOld = {}
            remoteOld = @createRemoteDoc old if old
            @couch.putRemoteDoc remoteDoc, remoteOld, (err, updated) ->
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
        log.info "Update folder #{doc.path}"
        if old.remote
            @couch.get old.remote._id, (err, folder) =>
                if err
                    callback err
                else
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
        log.info "Move file #{old.path} → #{doc.path}"
        if old.remote
            @couch.get old.remote._id, (err, remoteDoc) =>
                if err
                    @addFile doc, callback
                else
                    [dir, name] = @extractDirAndName doc.path
                    remoteDoc.path = dir
                    remoteDoc.name = name
                    remoteDoc.lastModification = doc.lastModification
                    @couch.put remoteDoc, (err, moved) =>
                        unless err
                            @events.emit 'transfer-move', doc, old
                            doc.remote =
                                _id: moved.id
                                _rev: moved.rev
                                binary: old.remote.binary
                        callback err, moved
        else
            @addFile doc, callback

    # Move a folder on the remote cozy instance
    moveFolder: (doc, old, callback) =>
        log.info "Move folder #{old.path} → #{doc.path}"
        if old.remote
            @couch.get old.remote._id, (err, folder) =>
                if err
                    callback err
                else
                    [dir, name] = @extractDirAndName doc.path
                    folder.path = dir
                    folder.name = name
                    folder.tags = doc.tags
                    folder.lastModification = doc.lastModification
                    @couch.put folder, callback
        else
            @addFolder doc, callback

    # Delete a file on the remote cozy instance
    deleteFile: (doc, callback) =>
        log.info "Delete file #{doc.path}"
        @events.emit 'delete-file', doc
        return callback() unless doc.remote
        remoteDoc = @createRemoteDoc doc, doc.remote
        @couch.removeRemoteDoc remoteDoc, (err, removed) =>
            # Ignore files that have already been removed
            if err?.status is 404
                callback null, removed
            else if err
                callback err, removed
            else
                @cleanBinary doc.remote.binary._id, (err) ->
                    callback null, removed

    # Delete a folder on the remote cozy instance
    deleteFolder: (doc, callback) =>
        log.info "Delete folder #{doc.path}"
        if doc.remote
            remoteDoc = @createRemoteDoc doc, doc.remote
            remoteDoc._deleted = true
            @couch.put remoteDoc, (err, removed) ->
                # Ignore folders that have already been removed
                if err?.status is 404
                    callback null, removed
                else
                    callback err, removed
        else
            callback()

    # Rename a file/folder to resolve a conflict
    resolveConflict: (dst, src, callback) =>
        log.info "Resolve a conflict: #{src.path} → #{dst.path}"
        @couch.get src.remote._id, (err, doc) =>
            [dir, name] = @extractDirAndName dst.path
            doc.path = dir
            doc.name = name
            @couch.put doc, callback


module.exports = Remote
