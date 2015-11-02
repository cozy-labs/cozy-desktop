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

    start: (done) =>
        @watcher.listenToChanges live: false, (err) =>
            done err
            @watcher.listenToChanges live: true unless err

    createReadStream: (doc, callback) =>
        if doc.remote.binary?
            @couch.downloadBinary doc.remote.binary._id, callback
        else
            callback new Error 'Cannot download the file'


    ### Helpers ###

    # Upload the binary as a CouchDB document's attachment and return
    # the binary document
    # TODO rewrite / split this method
    uploadBinary: (filePath, binaryDoc, callback) ->
        absolute = path.resolve @config.getDevice().path, filePath

        async.waterfall [
            (next) =>
                # In case of an file update, binary document already exists.
                if binaryDoc?.file?.id? and binaryDoc?.file?.rev?
                    next null,
                        id: binaryDoc.file.id
                        rev: binaryDoc.file.rev
                        checksum: binaryDoc.file.checksum
                else
                    # Create a remote binary document if not exists.
                    # Pass the checksum here to save it remotely.

                    filesystem.checksum absolute, (err, checksum) =>
                        if err
                            next err
                        else
                            binaryDoc =
                                file:
                                    checksum: checksum
                            @couch.createEmptyRemoteDoc binaryDoc, next

            # Get the binary document
            (binaryInfo, next) =>
                @couch.get binaryInfo.id, next

            (remoteBinaryDoc, next) =>
                # If for some reason the remote attachment is already uploaded
                # and has the same checksum than the local file, just return
                # the binary document.
                if remoteBinaryDoc._attachments? \
                and Object.keys(remoteBinaryDoc._attachments) > 0 \
                and remoteBinaryDoc.checksum is binaryDoc.checksum
                    return callback null, remoteBinaryDoc

                # Otherwise upload it
                @couch.uploadAsAttachment remoteBinaryDoc.id
                                        , remoteBinaryDoc.rev
                                        , absolute
                                        , next

            # Get the binary document again
            (binaryInfo, next) =>
                @couch.get binaryInfo.id, next

        ], callback


    ### Write operations ###

    # Create a file on the remote cozy instance
    # It can also be an overwrite of the file
    # TODO check if the remote folder exists and create it if missing?
    # TODO save infos in pouch
    addFile: (doc, callback) =>
        async.waterfall [
            # Check if the binary already exists on the server
            (next) =>
                @pouch.binaries().get 'TODO', next

            # Create the binary doc if it doesn't exist
            (next) =>
                @couch.createEmptyRemoteDoc checksum: doc.checksum, next

            # Upload binary if it doesn't exist on the server
            (next) =>
                # FIXME uploadAsAttachment expects a filePath, not a stream
                @other.createReadStream doc, (err, stream) =>
                    if err
                        callback err
                    else
                        @events.emit 'uploadBinary', doc.path  # FIXME
                        @couch.uploadAsAttachment doc, filePath, next

            # Save the 'file' document in the remote couch
            (next) =>
                @events.emit 'binaryUploaded', doc.path  # FIXME
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
