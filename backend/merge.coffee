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
#   - sides
#
# Folder:
#   - _id / _rev
#   - docType: 'folder'
#   - creationDate
#   - lastModification
#   - tags
#   - sides
#
# Conflicts can happen when we try to write one document for a path when
# another document already exists for the same path. We don't try to be smart
# and the rename one the two documents with a -conflict suffix.
#
# TODO update backends metadata
# TODO avoid put in pouchdb if nothing has changed
class Merge
    constructor: (@pouch) ->

    ### Helpers ###

    # Return true if the document has not a valid id
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

    # Return true if the checksum is invalid
    # If the checksum is missing, it is not invalid, just missing,
    # so it returns false.
    # SHA-1 has 40 hexadecimal letters
    invalidChecksum: (doc) ->
        if doc.checksum?
            doc.checksum = doc.checksum.toLowerCase()
            return not doc.checksum.match /^[a-f0-9]{40}$/
        else
            return false

    # Return true if the two files have the same content
    sameBinary: (one, two) ->
        if one.checksum? and one.checksum is two.checksum
            return true
        else if one.remote?.file? and two.remote?.file?
            oneId = one.remote.file._id
            twoId = two.remote.file._id
            return oneId and oneId is twoId
        else
            return false

    # Be sure that the tree structure for the given path exists
    # TODO bulk create/update and check status, instead of recursive?
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
    #   - the checksum is valid, if present
    # Actions:
    #   - force the 'file' docType
    #   - add the creation date if missing
    #   - add the last modification date if missing
    #   - create the tree structure if needed
    # TODO conflict
    # TODO test doc.overwrite
    addFile: (doc, callback) ->
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
                if file and @sameBinary file, doc
                    doc._rev = file._rev
                    doc.creationDate ?= file.creationDate
                    doc.size  ?= file.size
                    doc.class ?= file.class
                    doc.mime  ?= file.mime
                    delete doc.overwrite
                    @pouch.db.put doc, callback
                else if file
                    # TODO conflict
                    callback new Error 'Conflicts are not yet handled'
                else
                    doc.creationDate ?= new Date
                    @ensureParentExist doc, =>
                        @pouch.db.put doc, callback

    # Expectations:
    #   - the file path and name are present and valid
    #   - the checksum is valid, if present
    # Actions:
    #   - force the 'file' docType
    #   - add the creation date if missing
    #   - add the last modification date if missing
    #   - create the tree structure if needed
    #   - overwrite a possible existing file with the same path
    # TODO conflict with a folder -> file is renamed with -conflict suffix
    # TODO test doc.overwrite
    updateFile: (doc, callback) ->
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
                    if @sameBinary file, doc
                        doc.size  ?= file.size
                        doc.class ?= file.class
                        doc.mime  ?= file.mime
                        delete doc.overwrite
                    else
                        doc.overwrite = true
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
    # TODO conflict with a file -> file is renamed with -conflict suffix
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
    #   - the checksum is valid, if present
    #   - the two paths are not the same
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
        else if doc._id is was._id
            log.warn "Invalid move: #{JSON.stringify was, null, 2}"
            log.warn "to #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid move'
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
                    # TODO should be a conflict?
                    doc._rev      = file._rev
                    doc.overwrite = true
                    @pouch.db.bulkDocs [was, doc], callback
                else
                    delete doc.overwrite
                    @ensureParentExist doc, =>
                        @pouch.db.bulkDocs [was, doc], callback

    # Expectations:
    #   - the new folder path and name are present and valid
    #   - the old folder path and name are present and valid
    #   - the two paths are not the same
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
        else if doc._id is was._id
            log.warn "Invalid move: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid move'
        else if not was._rev
            log.warn "Missing rev: #{JSON.stringify was, null, 2}"
            callback new Error 'Missing rev'
        else
            @pouch.db.get doc._id, (err, folder) =>
                doc.docType           = 'folder'
                doc.creationDate     ?= was.creationDate
                doc.lastModification ?= new Date
                if folder
                    # TODO maybe it is simpler to add a -conflict suffix
                    doc._rev = folder._rev
                    @moveFolderRecursively doc, was, callback
                else
                    @ensureParentExist doc, =>
                        @moveFolderRecursively doc, was, callback

    # Move a folder and all the things inside it
    # TODO Check if folders/files exists in destination
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
                    src.moveTo = doc._id.replace was._id, folder._id
                    bulk.push src
                    dst = clone doc
                    dst._id = src.moveTo
                    delete dst._rev
                    bulk.push dst
                @pouch.db.bulkDocs bulk, callback

    # Expectations:
    #   - the file still exists in pouch
    #   - the file can be found by its _id
    deleteFile: (doc, callback) ->
        @pouch.db.get doc._id, (err, file) =>
            if err
                callback err
            else
                file._deleted = true
                @pouch.db.put file, callback

    # Expectations:
    #   - the folder still exists in pouch
    #   - the folder can be found by its _id
    # Actions:
    #   - delete every file and folder inside this folder
    deleteFolder: (doc, callback) ->
        @pouch.db.get doc._id, (err, folder) =>
            if err
                callback err
            else
                @pouch.byRecursivePath folder._id, (err, docs) =>
                    if err
                        callback err
                    else
                        # In the changes feed, nested subfolder must be deleted
                        # before their parents, hence the reverse order.
                        docs = docs.reverse()
                        docs.push folder
                        for doc in docs
                            doc._deleted = true
                        @pouch.db.bulkDocs docs, callback


module.exports = Merge
