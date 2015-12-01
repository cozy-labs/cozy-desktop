async   = require 'async'
clone   = require 'lodash.clone'
isEqual = require 'lodash.isequal'
path    = require 'path'
pick    = require 'lodash.pick'
log     = require('printit')
    prefix: 'Merge         '

Pouch = require './pouch'


# When the local filesystem or the remote cozy detects a change, it calls this
# class to inform it. This class will check this event, add some informations,
# and save it in pouchdb. It avoids a lot of bogus data in pouchdb, like file
# created in the folder that doesn't exist.
#
# The documents in PouchDB have similar informations of those in CouchDB, but
# are not structured in the same way. In particular, the _id are uuid in CouchDB
# and the path to the file/folder (in a normalized form) in PouchDB.
#
# File:
#   - _id / _rev
#   - docType: 'file'
#   - path
#   - checksum
#   - creationDate
#   - lastModification
#   - tags
#   - size
#   - class
#   - mime
#   - sides
#   - remote
#
# Folder:
#   - _id / _rev
#   - docType: 'folder'
#   - path
#   - creationDate
#   - lastModification
#   - tags
#   - sides
#   - remote
#
# Conflicts can happen when we try to write one document for a path when
# another document already exists for the same path. We don't try to be smart
# and the rename one the two documents with a -conflict suffix.
#
# TODO add some tests for case-insensitivity
class Merge
    constructor: (@pouch) ->
        switch process.platform
            when 'linux', 'freebsd', 'sunos'
                @buildId = @buildIdUnix
            when 'darwin'
                @buildId = @buildIdHFS
            else
                log.error "Sorry, #{process.platform} is not supported!"
                process.exit 1

    ### Helpers ###

    # Build an _id from the path for a case sensitive file system (Linux, BSD)
    buildIdUnix: (doc) ->
        doc._id = doc.path

    # Build an _id from the path for OSX (HFS+ file system):
    # - case preservative, but not case sensitive
    # - unicode NFD normalization (sort of)
    #
    # See https://nodejs.org/en/docs/guides/working-with-different-filesystems/
    # for why toUpperCase is better than toLowerCase
    #
    # Note: String.prototype.normalize is not available on node 0.10 and does
    # nothing when node is compiled without intl option.
    buildIdHFS: (doc) ->
        id = doc.path
        id = id.normalize 'NFD' if id.normalize
        doc._id = id.toUpperCase()

    # Return true if the document has not a valid path
    # (ie a path inside the mount point)
    # TODO what other things are not authorized? ~? $?
    # TODO forbid _design and _local?
    invalidPath: (doc) ->
        return true unless doc.path
        doc.path = path.normalize doc.path
        doc.path = doc.path.replace /^\//, ''
        parts = doc.path.split path.sep
        return doc.path is '.' or
            doc.path is '' or
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
            'tags', 'size', 'class', 'mime']
        one = pick one, fields
        two = pick two, fields
        return isEqual one, two

    # Return true if the two files have the same binary content
    sameBinary: (one, two) ->
        if one.checksum? and one.checksum is two.checksum
            return true
        else if one.remote? and two.remote?
            oneId = one.remote._id
            twoId = two.remote._id
            return oneId? and oneId is twoId
        else
            return false

    # Be sure that the tree structure for the given path exists
    # TODO bulk create/update and check status, instead of recursive?
    ensureParentExist: (side, doc, callback) =>
        parent = path.dirname doc._id
        if parent is '.'
            callback()
        else
            @pouch.db.get parent, (err, folder) =>
                if folder
                    callback()
                else
                    parentDoc =
                        _id: parent
                        path: path.dirname doc.path
                    @ensureParentExist side, parentDoc, (err) =>
                        if err
                            callback err
                        else
                            @putFolder side, parentDoc, callback

    # Simple helper to add a file or a folder
    addDoc: (side, doc, callback) =>
        if doc.docType is 'file'
            @addFile side, doc, callback
        else if doc.docType is 'folder'
            @putFolder side, doc, callback
        else
            callback new Error "Unexpected docType: #{doc.docType}"

    # Simple helper to update a file or a folder
    updateDoc: (side, doc, callback) =>
        if doc.docType is 'file'
            @updateFile side, doc, callback
        else if doc.docType is 'folder'
            @putFolder side, doc, callback
        else
            callback new Error "Unexpected docType: #{doc.docType}"

    # Helper to move/rename a file or a folder
    moveDoc: (side, doc, was, callback) =>
        if doc.docType isnt was.docType
            callback new Error "Incompatible docTypes: #{doc.docType}"
        else if doc.docType is 'file'
            @moveFile side, doc, was, callback
        else if doc.docType is 'folder'
            @moveFolder side, doc, was, callback
        else
            callback new Error "Unexpected docType: #{doc.docType}"

    # Simple helper to delete a file or a folder
    deleteDoc: (side, doc, callback) =>
        if doc.docType is 'file'
            @deleteFile side, doc, callback
        else if doc.docType is 'folder'
            @deleteFolder side, doc, callback
        else
            callback new Error "Unexpected docType: #{doc.docType}"

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
    addFile: (side, doc, callback) ->
        if @invalidPath doc
            log.warn "Invalid path: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid path'
        else if @invalidChecksum doc
            log.warn "Invalid checksum: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid checksum'
        else
            @buildId doc
            @pouch.db.get doc._id, (err, file) =>
                @markSide side, doc, file
                doc.docType = 'file'
                doc.lastModification ?= new Date
                if file and @sameBinary file, doc
                    doc._rev = file._rev
                    doc.creationDate ?= file.creationDate
                    doc.size  ?= file.size
                    doc.class ?= file.class
                    doc.mime  ?= file.mime
                    @pouch.db.put doc, callback
                else if file
                    # TODO conflict
                    callback new Error 'Conflicts are not yet handled'
                else
                    doc.creationDate ?= new Date
                    @ensureParentExist side, doc, =>
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
    # TODO are tags preserved when doing a touch on a local file?
    updateFile: (side, doc, callback) ->
        if @invalidPath doc
            log.warn "Invalid path: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid path'
        else if @invalidChecksum doc
            log.warn "Invalid checksum: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid checksum'
        else
            @buildId doc
            @pouch.db.get doc._id, (err, file) =>
                @markSide side, doc, file
                doc.docType = 'file'
                doc.lastModification ?= new Date
                if file
                    doc._rev = file._rev
                    doc.creationDate ?= file.creationDate
                    if @sameBinary file, doc
                        doc.size  ?= file.size
                        doc.class ?= file.class
                        doc.mime  ?= file.mime
                    if @sameFile file, doc
                        callback null
                    else
                        @pouch.db.put doc, callback
                else
                    doc.creationDate ?= new Date
                    @ensureParentExist side, doc, =>
                        @pouch.db.put doc, callback

    # Expectations:
    #   - the folder path and name are present and valid
    # Actions:
    #   - add the creation date if missing
    #   - add the last modification date if missing
    #   - create the tree structure if needed
    #   - overwrite metadata if this folder alredy existed in pouch
    # TODO conflict with a file -> file is renamed with -conflict suffix
    putFolder: (side, doc, callback) ->
        if @invalidPath doc
            log.warn "Invalid path: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid path'
        else
            @buildId doc
            @pouch.db.get doc._id, (err, folder) =>
                @markSide side, doc, folder
                doc.docType = 'folder'
                doc.lastModification ?= new Date
                if folder
                    doc._rev = folder._rev
                    doc.creationDate ?= folder.creationDate
                    doc.tags ?= folder.tags
                    if @sameFolder folder, doc
                        callback null
                    else
                        @pouch.db.put doc, callback
                else
                    doc.creationDate ?= new Date
                    @ensureParentExist side, doc, =>
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
    moveFile: (side, doc, was, callback) ->
        if @invalidPath doc
            log.warn "Invalid path: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid path'
        else if @invalidPath was
            log.warn "Invalid path: #{JSON.stringify was, null, 2}"
            callback new Error 'Invalid path'
        else if @invalidChecksum doc
            log.warn "Invalid checksum: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid checksum'
        else if doc.path is was.path
            log.warn "Invalid move: #{JSON.stringify was, null, 2}"
            log.warn "to #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid move'
        else if not was._rev
            log.warn "Missing rev: #{JSON.stringify was, null, 2}"
            callback new Error 'Missing rev'
        else
            @buildId doc
            @buildId was
            @pouch.db.get doc._id, (err, file) =>
                @markSide side, doc, file
                @markSide side, was, was
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
                    doc._rev = file._rev
                    @pouch.db.bulkDocs [was, doc], callback
                else
                    @ensureParentExist side, doc, =>
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
    moveFolder: (side, doc, was, callback) ->
        if @invalidPath doc
            log.warn "Invalid path: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid path'
        else if @invalidPath was
            log.warn "Invalid path: #{JSON.stringify was, null, 2}"
            callback new Error 'Invalid path'
        else if doc.path is was.path
            log.warn "Invalid move: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid move'
        else if not was._rev
            log.warn "Missing rev: #{JSON.stringify was, null, 2}"
            callback new Error 'Missing rev'
        else
            @buildId doc
            @buildId was
            @pouch.db.get doc._id, (err, folder) =>
                @markSide side, doc, folder
                @markSide side, was, was
                doc.docType           = 'folder'
                doc.creationDate     ?= was.creationDate
                doc.lastModification ?= new Date
                doc.tags             ?= was.tags
                if folder
                    # TODO maybe it is simpler to add a -conflict suffix
                    doc._rev = folder._rev
                    @moveFolderRecursively doc, was, callback
                else
                    @ensureParentExist side, doc, =>
                        @moveFolderRecursively doc, was, callback

    # Move a folder and all the things inside it
    # TODO kill this method
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

    # Remove a file from PouchDB
    #
    # As the watchers often detect the deletion of a folder before the deletion
    # of the files inside it, deleteFile can be called for a file that has
    # already been removed. This is not considerated as an error.
    deleteFile: (side, doc, callback) ->
        @buildId doc
        @pouch.db.get doc._id, (err, file) =>
            if err?.status is 404
                callback null
            else if err
                callback err
            else
                @markSide side, file, file
                file._deleted = true
                @pouch.db.put file, callback

    # Remove a folder and every file and folder inside it
    #
    # When a folder is removed in PouchDB, we also remove the files and folders
    # inside it to ensure consistency. The watchers often detects the deletion
    # of a nested folder after the deletion of its parent. In this case, the
    # call to deleteFolder for the child is considered as successful, even if
    # the folder is missing in pouchdb (error 404).
    #
    # TODO add an integration test where a folder with a lot of files is removed
    deleteFolder: (side, doc, callback) ->
        @buildId doc
        @pouch.db.get doc._id, (err, folder) =>
            if err?.status is 404
                callback null
            else if err
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
                        # TODO find why we have undefined values here sometimes
                        docs = (doc for doc in docs when doc?)
                        for doc in docs
                            @markSide side, doc, doc
                            doc._deleted = true
                        @pouch.db.bulkDocs docs, callback


module.exports = Merge
