async = require 'async'
clone = require 'lodash.clone'
path  = require 'path'
log   = require('printit')
    prefix: 'Merge         '

Pouch = require './pouch'


# When the local filesystem or the remote cozy detects a change, it calls this
# class to inform it. This class will check this event, add some informations,
# and save it in pouchdb. It avoids a lot of bogus data in pouchdb, like file
# created in the folder that doesn't exist.
#
# The documents in PouchDB have similar informations of those in CouchDB, but
# are not structured in the same way. In particular, the _id are uuid in CouchDB
# and the path to the file/folder in PouchDB.
#
# File:
#   - _id / _rev
#   - docType: 'file'
#   - checksum
#   - creationDate
#   - lastModification
#   - tags
#   - size
#   - class
#   - mime
#   - backends
#
# Folder:
#   - _id / _rev
#   - docType: 'folder'
#   - creationDate
#   - lastModification
#   - tags
#   - backends
#
# Conflicts can happen when we try to write one document for a path when
# another document already exists for the same path. The resolution depends of
# the type of the documents:
#   - for two files, we rename the latter with a -conflict suffix
#   - for two folders, we merge them
#   - for a file and a folder, TODO
#
# TODO update metadata
# TODO avoid put in pouchdb if nothing has changed
class Merge
    constructor: (@pouch) ->

    ### Helpers ###

    # Return true if the document has a valid id
    # (ie a path inside the mount point)
    # TODO what other things are not authorized? ~? $?
    # TODO forbid _design and _local?
    invalidId: (doc) ->
        return true unless doc._id
        doc._id = path.normalize doc._id
        doc._id = doc._id.replace /^\//, ''
        parts = doc._id.split path.sep
        return doc._id is '.' or
            doc._id is '' or
            parts[0] is '..'

    # Return true if the checksum is valid
    # SHA-1 has 40 hexadecimal letters
    invalidChecksum: (doc) ->
        doc.checksum ?= ''
        doc.checksum = doc.checksum.toLowerCase()
        return not doc.checksum.match /^[a-f0-9]{40}$/

    # Be sure that the tree structure for the given path exists
    ensureParentExist: (doc, callback) =>
        parent = path.dirname doc._id
        if parent is '.'
            callback()
        else
            @pouch.db.get parent, (err, folder) =>
                if folder
                    callback()
                else
                    @ensureParentExist _id: parent, (err) =>
                        if err
                            callback err
                        else
                            @putFolder _id: parent, callback

    # Delete every files and folders inside the given folder
    emptyFolder: (folder, callback) =>
        @pouch.byRecursivePath folder._id, (err, docs) =>
            if err
                log.error err
                callback err
            else if docs.length is 0
                callback null
            else
                # In the changes feed, nested subfolder must be deleted
                # before their parents, hence the reverse order.
                docs = docs.reverse()
                for doc in docs
                    doc._deleted = true
                @pouch.db.bulkDocs docs, callback

    # Helper to save a file or a folder
    # (create, update metadata or overwrite a file)
    putDoc: (doc, callback) =>
        if doc.docType is 'file'
            @putFile doc, callback
        else if doc.docType is 'folder'
            @putFolder doc, callback
        else
            callback new Error "Unexpected docType: #{doc.docType}"

    # Helper to move/rename a file or a folder
    moveDoc: (doc, was, callback) =>
        if doc.docType isnt was.docType
            callback new Error "Incompatible docTypes: #{doc.docType}"
        else if doc.docType is 'file'
            @moveFile doc, was, callback
        else if doc.docType is 'folder'
            @moveFolder doc, was, callback
        else
            callback new Error "Unexpected docType: #{doc.docType}"

    # Simple helper to delete a file or a folder
    deleteDoc: (doc, callback) =>
        if doc.docType is 'file'
            @deleteFile doc, callback
        else if doc.docType is 'folder'
            @deleteFolder doc, callback
        else
            callback new Error "Unexpected docType: #{doc.docType}"


    ### Actions ###

    # Expectations:
    #   - the file path and name are present and valid
    #   - the checksum is present
    # Actions:
    #   - force the 'file' docType
    #   - add the creation date if missing
    #   - add the last modification date if missing
    #   - create the tree structure if needed
    #   - overwrite a possible existing file with the same path
    # TODO how to tell if it's an overwrite or a conflict?
    # TODO conflict with a folder
    putFile: (doc, callback) ->
        if @invalidId doc
            log.warn "Invalid id: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid id'
        else if @invalidChecksum doc
            log.warn "Invalid checksum: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid checksum'
        else
            @pouch.db.get doc._id, (err, file) =>
                doc.docType = 'file'
                doc.lastModification ?= new Date
                if file
                    doc._rev = file._rev
                    doc.creationDate ?= file.creationDate
                    if file.checksum is doc.checksum
                        doc.size  ?= file.size
                        doc.class ?= file.class
                        doc.mime  ?= file.mime
                    @pouch.db.put doc, callback
                else
                    doc.creationDate ?= new Date
                    @ensureParentExist doc, =>
                        @pouch.db.put doc, callback

    # Expectations:
    #   - the folder path and name are present and valid
    # Actions:
    #   - add the creation date if missing
    #   - add the last modification date if missing
    #   - create the tree structure if needed
    #   - overwrite metadata if this folder alredy existed in pouch
    # TODO how to tell if it's an overwrite or a conflict?
    # TODO conflict with a file
    # TODO how can we remove a tag?
    putFolder: (doc, callback) ->
        if @invalidId doc
            log.warn "Invalid id: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid id'
        else
            @pouch.db.get doc._id, (err, folder) =>
                doc.docType = 'folder'
                doc.lastModification ?= new Date
                if folder
                    doc._rev = folder._rev
                    doc.creationDate ?= folder.creationDate
                    doc.tags ?= []
                    for tag in folder.tags or []
                        doc.tags.push tag unless tag in doc.tags
                    @pouch.db.put doc, callback
                else
                    doc.creationDate ?= new Date
                    @ensureParentExist doc, =>
                        @pouch.db.put doc, callback

    # Expectations:
    #   - the new file path and name are present and valid
    #   - the old file path and name are present and valid
    #   - the checksum is present
    #   - the revision for the old file is present
    # Actions:
    #   - force the 'file' docType
    #   - add the creation date if missing
    #   - add the last modification date if missing
    #   - add a hint to make writers know that it's a move (moveTo)
    #   - create the tree structure if needed
    #   - overwrite the destination if it was present
    moveFile: (doc, was, callback) ->
        if @invalidId doc
            log.warn "Invalid id: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid id'
        else if @invalidId was
            log.warn "Invalid id: #{JSON.stringify was, null, 2}"
            callback new Error 'Invalid id'
        else if @invalidChecksum doc
            log.warn "Invalid checksum: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid checksum'
        else if not was._rev
            log.warn "Missing rev: #{JSON.stringify was, null, 2}"
            callback new Error 'Missing rev'
        else
            @pouch.db.get doc._id, (err, file) =>
                doc.docType           = 'file'
                doc.creationDate     ?= was.creationDate
                doc.lastModification ?= new Date
                doc.size             ?= was.size
                doc.class            ?= was.class
                doc.mime             ?= was.mime
                was.moveTo            = doc._id
                was._deleted          = true
                if file
                    doc._rev = file._rev
                    @pouch.db.bulkDocs [was, doc], callback
                else
                    @ensureParentExist doc, =>
                        @pouch.db.bulkDocs [was, doc], callback

    # Expectations:
    #   - the new folder path and name are present and valid
    #   - the old folder path and name are present and valid
    #   - the revision for the old folder is present
    # Actions:
    #   - force the 'folder' docType
    #   - add the creation date if missing
    #   - add the last modification date if missing
    #   - add a hint to make writers know that it's a move (moveTo)
    #   - create the tree structure if needed
    #   - move every file and folder inside this folder
    #   - overwrite the destination if it was present
    # TODO
    #   - tags
    moveFolder: (doc, was, callback) ->
        if @invalidId doc
            log.warn "Invalid id: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid id'
        else if @invalidId was
            log.warn "Invalid id: #{JSON.stringify was, null, 2}"
            callback new Error 'Invalid id'
        else if not was._rev
            log.warn "Missing rev: #{JSON.stringify was, null, 2}"
            callback new Error 'Missing rev'
        else
            @pouch.db.get doc._id, (err, folder) =>
                doc.docType           = 'folder'
                doc.creationDate     ?= was.creationDate
                doc.lastModification ?= new Date
                was.moveTo            = doc._id
                was._deleted          = true
                if folder
                    # TODO maybe it is simpler to add a -conflict suffix
                    doc._rev = folder._rev
                    @moveFolderRecursively doc, was, callback
                else
                    @ensureParentExist doc, =>
                        @moveFolderRecursively doc, was, callback

    # TODO Add comments, tests
    # TODO Check if folders/files exists in destination
    moveFolderRecursively: (doc, was, callback) =>
        @pouch.byRecursivePath doc._id, (err, docs) =>
            if err
                callback err
            else
                bulk = [was, doc]
                for doc in docs
                    src = clone doc
                    src._deleted = true
                    src.moved = true
                    bulk.push src
                    dst = clone doc
                    dst._id = dst._id.replace was._id, doc._id
                    delete dst._rev
                    dst.moved = true
                    bulk.push dst
                @pouch.db.bulkDocs bulk, callback

    # Expectations:
    #   - the file still exists in pouch
    #   - the file can be found by its _id
    deleteFile: (doc, callback) ->
        async.waterfall [
            # Find the file
            (next) =>
                @pouch.db.get doc._id, next
            # Delete it
            (file, next) =>
                file._deleted = true
                @pouch.db.put file, next
        ], callback

    # Expectations:
    #   - the folder still exists in pouch
    #   - the folder can be found by its _id
    # Actions:
    #   - delete every file and folder inside this folder
    deleteFolder: (doc, callback) ->
        async.waterfall [
            # Find the folder
            (next) =>
                @pouch.db.get doc._id, next
            # Delete everything inside this folder
            (folder, next) =>
                @emptyFolder folder, (err) ->
                    next err, folder
            # Delete the folder
            (folder, next) =>
                folder._deleted = true
                @pouch.db.put folder, next
        ], callback


module.exports = Merge
