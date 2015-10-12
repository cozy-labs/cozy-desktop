async = require 'async'
log   = require('printit')
    prefix: 'Local writer  '

Couch   = require './couch'
Watcher = require './watcher'


class Remote
    constructor: (config, @pouch, @events) ->
        @couch = new Couch config, @pouch, @events
        @watcher = new Watcher @couch, @pouch, config
        @other = null

    start: (mode, done) =>
        @watcher.initialReplication (err) =>
            done err
            @watcher.startReplication() unless err

    createReadStream: (doc, callback) =>
        @couch.downloadBinary doc.binary.file.id, callback


    ### Helpers ###

    # Upload the binary as a CouchDB document's attachment and return
    # the binary document
    # TODO split this method
    uploadBinary: (filePath, binaryDoc, callback) ->
        filePaths = filesystem.getPaths filePath

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

                    filesystem.checksum filePaths.absolute, (err, checksum) =>
                        if err
                            next err
                        else
                            binaryDoc =
                                file:
                                    checksum: checksum
                            @couch.createEmptyRemoteDoc binaryDoc, next

            # Get the binary document
            (binaryInfo, next) =>
                @couch.getRemoteDoc binaryInfo.id, next

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
                                        , filePaths.absolute
                                        , next

            # Get the binary document again
            (binaryInfo, next) =>
                @couch.getRemoteDoc binaryInfo.id, next

        ], callback


    ### Write operations ###

    # Create a file on the remote cozy instance
    # It can also be an overwrite of the file
    # TODO check if the remote folder exists and create it if missing?
    # TODO save infos in pouch
    createFile: (doc, callback) =>
        async.waterfall [
            # Check if the binary already exists on the server
            (next) =>
                @pouch.binaries().get 'TODO', next

            # Create the binary doc if it doesn't exist
            (next) =>
                @couch.createEmptyRemoteDoc checksum: doc.checksum, next

            # Upload binary if it doesn't exist on the server
            (next) =>
                @other.createReadStream doc, (err, stream) =>
                    if err
                        callback err
                    else
                        @events.emit 'uploadBinary', doc.path  # FIXME
                        @couch.uploadAsAttachment doc, stream, next

            # Save the 'file' document in the remote couch
            (next) =>
                @events.emit 'binaryUploaded', doc.path  # FIXME
                @couch.put doc, null, next

        ], callback

    # Create a folder on the remote cozy instance
    # TODO check if the folder already exists before trying to create it?
    createFolder: (doc, callback) =>
        @couch.put doc, null, callback

    # Move a file on the remote cozy instance
    moveFile: (doc, old, callback) =>
        @couch.put doc, old.rev, callback

    # Move a folder on the remote cozy instance
    moveFolder: (doc, callback) =>
        @pouch.getPreviousRev doc, (err, oldDoc) =>
            if err
                log.error err
                callback err
            else
                @couch.put doc, oldDoc.rev, callback

    # Delete a file on the remote cozy instance
    # TODO check that the corresponding binary is deleted
    deleteFile: (doc, callback) =>
        @pouch.getPreviousRev doc, (err, oldDoc) =>
            if err
                log.error err
                callback err
            else
                @couch.del doc, oldDoc.rev, callback

    # Delete a folder on the remote cozy instance
    deleteFolder: (doc, callback) =>
        # For now both operations are similar
        @deleteFile doc, callback


module.exports = Remote
