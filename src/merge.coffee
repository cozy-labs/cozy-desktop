async   = require 'async'
clone   = require 'lodash.clone'
isEqual = require 'lodash.isequal'
path    = require 'path'
pick    = require 'lodash.pick'
log     = require('printit')
    prefix: 'Merge         '


# When the local filesystem or the remote cozy detects a change, it calls this
# class to inform it (via Prep). This class will check how to operate this
# change against the data in pouchdb and then will update pouchdb. It avoids a
# lot of bogus data in pouchdb, like file created in the folder that doesn't
# exist.
#
# The documents in PouchDB have similar informations of those in CouchDB, but
# are not structured in the same way. In particular, the _id are uuid in CouchDB
# and the path to the file/folder (in a normalized form) in PouchDB.
#
# Conflicts can happen when we try to write one document for a path when
# another document already exists for the same path. We don't try to be smart
# and the rename one the two documents with a -conflict suffix. And even that
# isn't simple to implement. When the document is renamed, it fires some events
# that are not in the normal flow (rename instead of add, bogus delete) and we
# need to redirect them.
class Merge
    constructor: (@pouch) ->
        @local = @remote = null

    ### Helpers ###

    # Return true if the two dates are the same, +/- 3 seconds
    sameDate: (one, two) ->
        one = +new Date one
        two = +new Date two
        return Math.abs(two - one) < 3000

    # Return true if the metadata of the two folders are the same
    # For creationDate and lastModification, we accept up to 3s of differences
    # because we can't rely on file systems to be precise to the millisecond.
    sameFolder: (one, two) ->
        return false unless @sameDate one.creationDate, two.creationDate
        return false unless @sameDate one.lastModification, two.lastModification
        fields = ['_id', 'docType', 'remote', 'tags']
        one = pick one, fields
        two = pick two, fields
        return isEqual one, two

    # Return true if the metadata of the two files are the same
    # For creationDate and lastModification, we accept up to 3s of differences
    # because we can't rely on file systems to be precise to the millisecond.
    sameFile: (one, two) ->
        return false unless @sameDate one.creationDate, two.creationDate
        return false unless @sameDate one.lastModification, two.lastModification
        fields = ['_id', 'docType', 'checksum', 'remote',
            'tags', 'size', 'class', 'mime', 'executable']
        one = pick one, fields
        two = pick two, fields
        return isEqual one, two

    # Return true if the two files have the same binary content
    sameBinary: (one, two) ->
        if one.docType isnt 'file' or two.docType isnt 'file'
            return false
        else if one.checksum? and one.checksum is two.checksum
            return true
        else if one.remote? and two.remote?
            oneId = one.remote._id
            twoId = two.remote._id
            return oneId? and oneId is twoId
        else
            return false

    # Be sure that the tree structure for the given path exists
    ensureParentExist: (side, doc, callback) =>
        parentId = path.dirname doc._id
        if parentId is '.'
            callback()
        else
            @pouch.db.get parentId, (err, folder) =>
                if folder
                    callback()
                else
                    parentDoc =
                        _id: parentId
                        path: path.dirname doc.path
                        docType: 'folder'
                        creationDate: new Date
                        lastModification: new Date
                    @ensureParentExist side, parentDoc, (err) =>
                        if err
                            callback err
                        else
                            @putFolder side, parentDoc, callback

    # Mark the next rev for this side
    #
    # To track which side has made which modification, a revision number is
    # associated to each side. When a side make a modification, we extract the
    # revision from the previous state, increment it by one to have the next
    # revision and associate this number to the side that makes the
    # modification.
    markSide: (side, doc, prev) ->
        rev = 0
        rev = @pouch.extractRevNumber prev if prev
        doc.sides ?= clone prev?.sides or {}
        doc.sides[side] = ++rev
        doc

    # Resolve a conflict by renaming a file/folder
    # A suffix composed of -conflict- and the date is added to the path.
    resolveConflict: (side, doc, callback) ->
        dst  = clone doc
        date = new Date().toISOString()
        ext  = path.extname doc.path
        dir  = path.dirname doc.path
        base = path.basename doc.path, ext
        dst.path = "#{path.join dir, base}-conflict-#{date}#{ext}"
        @[side].resolveConflict dst, doc, (err) ->
            callback err, dst


    ### Actions ###

    # Add a file, if it doesn't already exist,
    # and create the tree structure if needed
    addFile: (side, doc, callback) ->
        @pouch.db.get doc._id, (err, file) =>
            @markSide side, doc, file
            if file?.docType is 'folder'
                @resolveConflict side, doc, callback
            else if file and @sameBinary file, doc
                doc._rev = file._rev
                doc.size  ?= file.size
                doc.class ?= file.class
                doc.mime  ?= file.mime
                doc.tags  ?= file.tags or []
                @pouch.db.put doc, callback
            else if file?.checksum
                @resolveConflict side, doc, callback
            else
                doc._rev = file._rev if file
                doc.tags ?= []
                @ensureParentExist side, doc, =>
                    @pouch.db.put doc, callback

    # Update a file, when its metadata or its content has changed
    updateFile: (side, doc, callback) ->
        @pouch.db.get doc._id, (err, file) =>
            @markSide side, doc, file
            if file?.docType is 'folder'
                callback new Error "Can't resolve this conflict!"
            else if file
                doc._rev = file._rev
                doc.tags ?= file.tags or []
                doc.remote ?= file.remote
                # Preserve the creation date even if the file system lost it!
                doc.creationDate = file.creationDate
                if @sameBinary file, doc
                    doc.size  ?= file.size
                    doc.class ?= file.class
                    doc.mime  ?= file.mime
                if @sameFile file, doc
                    callback null
                else
                    @pouch.db.put doc, callback
            else
                doc.tags ?= []
                doc.creationDate ?= new Date
                @ensureParentExist side, doc, =>
                    @pouch.db.put doc, callback

    # Create or update a folder
    putFolder: (side, doc, callback) ->
        @pouch.db.get doc._id, (err, folder) =>
            @markSide side, doc, folder
            if folder?.docType is 'file'
                @resolveConflict side, doc, callback
            else if folder
                doc._rev = folder._rev
                doc.tags ?= folder.tags or []
                doc.creationDate ?= folder.creationDate
                if @sameFolder folder, doc
                    callback null
                else
                    @pouch.db.put doc, callback
            else
                doc.tags ?= []
                doc.creationDate ?= new Date
                @ensureParentExist side, doc, =>
                    @pouch.db.put doc, callback

    # Rename or move a file
    moveFile: (side, doc, was, callback) ->
        if was.sides?[side]
            @pouch.db.get doc._id, (err, file) =>
                @markSide side, doc, file
                @markSide side, was, was
                doc.creationDate ?= was.creationDate
                doc.size         ?= was.size
                doc.class        ?= was.class
                doc.mime         ?= was.mime
                doc.tags         ?= was.tags or []
                was.moveTo        = doc._id
                was._deleted      = true
                delete was.errors
                if file and @sameFile file, doc
                    callback null
                else if file
                    @resolveConflict side, doc, (err, dst) =>
                        was.moveTo = dst._id
                        dst.sides = {}
                        dst.sides[side] = 1
                        @pouch.db.bulkDocs [was, dst], callback
                else
                    @ensureParentExist side, doc, =>
                        @pouch.db.bulkDocs [was, doc], callback
        else # It can happen after a conflict
            @addFile side, doc, callback

    # Rename or move a folder (and every file and folder inside it)
    moveFolder: (side, doc, was, callback) ->
        if was.sides?[side]
            @pouch.db.get doc._id, (err, folder) =>
                @markSide side, doc, folder
                @markSide side, was, was
                doc.creationDate ?= was.creationDate
                doc.tags         ?= was.tags or []
                if folder
                    @resolveConflict side, doc, (err, dst) =>
                        dst.sides = {}
                        dst.sides[side] = 1
                        @moveFolderRecursively dst, was, callback
                else
                    @ensureParentExist side, doc, =>
                        @moveFolderRecursively doc, was, callback
        else # It can happen after a conflict
            @putFolder side, doc, callback

    # Move a folder and all the things inside it
    moveFolderRecursively: (folder, was, callback) =>
        @pouch.byRecursivePath was._id, (err, docs) =>
            if err
                callback err
            else
                was._deleted = true
                was.moveTo   = folder._id
                bulk = [was, folder]
                for doc in docs
                    src = clone doc
                    src._deleted = true
                    # moveTo is used for comparison. It's safer to take _id
                    # than path for this case, as explained in doc/design.md
                    src.moveTo = doc._id.replace was._id, folder._id
                    delete src.errors
                    bulk.push src
                    dst = clone doc
                    dst._id = src.moveTo
                    delete dst._rev
                    bulk.push dst
                    delete dst.errors
                @pouch.db.bulkDocs bulk, callback

    # Remove a file from PouchDB
    #
    # As the watchers often detect the deletion of a folder before the deletion
    # of the files inside it, deleteFile can be called for a file that has
    # already been removed. This is not considerated as an error.
    deleteFile: (side, doc, callback) ->
        @pouch.db.get doc._id, (err, file) =>
            if err?.status is 404
                callback null
            else if err
                callback err
            else if file.sides?[side]
                @markSide side, file, file
                file._deleted = true
                delete file.errors
                @pouch.db.put file, callback
            else # It can happen after a conflict
                callback null

    # Remove a folder
    #
    # When a folder is removed in PouchDB, we also remove the files and folders
    # inside it to ensure consistency. The watchers often detects the deletion
    # of a nested folder after the deletion of its parent. In this case, the
    # call to deleteFolder for the child is considered as successful, even if
    # the folder is missing in pouchdb (error 404).
    deleteFolder: (side, doc, callback) ->
        @pouch.db.get doc._id, (err, folder) =>
            if err?.status is 404
                callback null
            else if err
                callback err
            else if folder.sides?[side]
                @deleteFolderRecursively side, folder, callback
            else # It can happen after a conflict
                callback null

    # Remove a folder and every thing inside it
    deleteFolderRecursively: (side, folder, callback) ->
        @pouch.byRecursivePath folder._id, (err, docs) =>
            if err
                callback err
            else
                # In the changes feed, nested subfolder must be deleted
                # before their parents, hence the reverse order.
                docs = docs.reverse()
                docs.push folder
                for doc in docs
                    @markSide side, doc, doc
                    doc._deleted = true
                    delete doc.errors
                @pouch.db.bulkDocs docs, callback


module.exports = Merge
