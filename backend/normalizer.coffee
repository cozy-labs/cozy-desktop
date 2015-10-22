async = require 'async'
path  = require 'path'
log   = require('printit')
    prefix: 'Normalizer    '

Pouch = require './pouch'


# When the local filesystem or the remote cozy detects a change, it calls this
# class to inform it. This class will check this event, add some informations,
# and save it in pouchdb. It avoids a lot of bogus data in pouchdb, like file
# created in the folder that doesn't exist.
#
# File:
#   - _id / _rev
#   - docType: 'file'
#   - name
#   - path
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
#   - name
#   - path
#   - creationDate
#   - lastModification
#   - tags
#   - backends
#
# Conflicts can happen when we try to write one document for a path, and
# another document already exists with the same path. The resolution depends of
# the type of the documents:
#   - for two files, we rename the latter with a -conflict suffix
#   - for two folders, we merge them
#   - for a file and a folder, TODO
#
# TODO find a better name than Normalizer for this class
# TODO update metadata
class Normalizer
    constructor: (@pouch) ->

    ### Helpers ###

    # Return true if the document has a valid path and name
    # TODO what other things are not authorized? ~? $?
    invalidPathOrName: (doc) ->
        doc.path ?= ''
        doc.name ?= ''
        doc.path = '' if doc.path is '.'
        doc.path = doc.path.replace /^\//, ''
        parents = doc.path.split '/'
        return '..' in parents or
               doc.name is '' or
               doc.name is '.' or
               doc.name is '..' or
               '/' in doc.name

    # Return true if the checksum is valid
    # SHA-1 has 40 hexadecimal letters
    invalidChecksum: (doc) ->
        doc.checksum ?= ''
        doc.checksum = doc.checksum.toLowerCase()
        return not doc.checksum.match /^[a-f0-9]{40}$/

    # Be sure that the tree structure for the given path exists
    ensureParentExist: (doc, callback) =>
        if doc.path is ''
            callback()
        else
            @pouch.getFolder doc.path, (err, folder) =>
                if folder
                    callback()
                else
                    newFolder =
                        name: path.basename doc.path
                        path: path.dirname  doc.path
                    @putFolder newFolder, callback

    # Delete every files and folders inside the given folder
    emptyFolder: (folder, callback) =>
        fullpath = path.join folder.path, folder.name
        @pouch.byPath fullpath, (err, docs) =>
            if err
                log.error err
                callback err
            else
                async.eachSeries docs, (doc, next) =>
                    if doc.docType is 'folder'
                        @deleteFolder doc, next
                    else
                        @pouch.db.remove doc, next
                , callback

    # Helper to save a file or a folder
    # (create, move, update the metadata or the content)
    # TODO move
    putDoc: (doc, callback) =>
        if doc.docType is 'file'
            @putFile doc, callback
        else if doc.docType is 'folder'
            @putFolder doc, callback
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
    putFile: (doc, callback) ->
        if @invalidPathOrName doc
            log.warn "Invalid path or name: #{JSON.stringify doc, null, 2}"
            callback? new Error 'Invalid path or name'
        else if @invalidChecksum doc
            log.warn "Invalid checksum: #{JSON.stringify doc, null, 2}"
            callback? new Error 'Invalid checksum'
        else
            fullpath = path.join doc.path, doc.name
            @pouch.getFile fullpath, (err, file) =>
                doc.docType = 'file'
                if file and
                        (file._id is doc._id or
                         file.checksum is doc.checksum)
                    doc._id  = file._id
                    doc._rev = file._rev
                    doc.creationDate ?= file.creationDate
                    if file.checksum is doc.checksum
                        doc.size  ?= file.size
                        doc.class ?= file.class
                        doc.mime  ?= file.mime
                else
                    doc._id ?= Pouch.newId()
                    doc.creationDate ?= (new Date).toString()
                    if file
                        ext  = path.extname doc.name
                        base = path.basename doc.name, ext
                        doc.name = "#{base}-conflict#{ext}"
                doc.lastModification ?= (new Date).toString()
                @ensureParentExist doc, =>
                    @pouch.db.put doc, callback

    # Expectations:
    #   - the folder path and name are present and valid
    # Actions:
    #   - add the creation date if missing
    #   - add the last modification date if missing
    #   - create the tree structure if needed
    #   - overwrite metadata if this folder alredy existed in pouch
    putFolder: (doc, callback) ->
        if @invalidPathOrName doc
            log.warn "Invalid path or name: #{JSON.stringify doc, null, 2}"
            callback? new Error 'Invalid path or name'
        else
            fullpath = path.join doc.path, doc.name
            @pouch.getFolder fullpath, (err, folder) =>
                doc.docType = 'folder'
                if folder
                    doc._id  = folder._id
                    doc._rev = folder._rev
                    doc.creationDate ?= folder.creationDate
                else
                    doc._id ?= Pouch.newId()
                doc.creationDate     ?= (new Date).toString()
                doc.lastModification ?= (new Date).toString()
                @ensureParentExist doc, =>
                    @pouch.db.put doc, callback

    # Expectations:
    #   - the file id is present
    #   - the new file path and name are present and valid
    # Actions:
    #   - create the tree structure if needed
    # TODO
    #   - overwrite the destination if it was present
    moveFile: (doc, callback) ->
        if not doc._id
            log.warn "Missing _id: #{JSON.stringify doc, null, 2}"
            callback? new Error 'Missing id'
        else if doc.docType isnt 'file'
            log.warn "Invalid docType: #{JSON.stringify doc, null, 2}"
            callback? new Error 'Invalid docType'
        else if @invalidPathOrName doc
            log.warn "Invalid path or name: #{JSON.stringify doc, null, 2}"
            callback? new Error 'Invalid path or name'
        else if @invalidChecksum doc
            log.warn "Invalid checksum: #{JSON.stringify doc, null, 2}"
            callback? new Error 'Invalid checksum'
        else
            @ensureParentExist doc, =>
                @pouch.db.put doc, callback

    # Expectations:
    #   - the folder id is present
    #   - the new folder path and name are present and valid
    # Actions:
    #   - create the tree structure if needed
    # TODO
    #   - move every file and folder inside this folder
    #   - overwrite the destination if it was present
    moveFolder: (doc, callback) ->
        if not doc._id
            log.warn "Missing _id: #{JSON.stringify doc, null, 2}"
            callback? new Error 'Missing id'
        else if doc.docType isnt 'folder'
            log.warn "Invalid docType: #{JSON.stringify doc, null, 2}"
            callback? new Error 'Invalid docType'
        else if @invalidPathOrName doc
            log.warn "Invalid path or name: #{JSON.stringify doc, null, 2}"
            callback? new Error 'Invalid path or name'
        else
            @ensureParentExist doc, =>
                @pouch.db.put doc, callback

    # Expectations:
    #   - the file can be found by its id or by its fullpath
    #   - the file still exists in pouch
    deleteFile: (doc, callback) ->
        async.waterfall [
            # Find the file
            (next) =>
                if doc._id
                    @pouch.db.get doc._id, next
                else if doc.fullpath
                    @pouch.getFile doc.fullpath, next
                else
                    next new Error 'Invalid call to deleteFile'

            # Delete it
            (file, next) =>
                file._deleted = true
                @pouch.db.put file, next
        ], callback

    # Expectations:
    #   - the folder can be found by its _id or by its fullpath
    #   - the folder still exists in pouch
    # Actions:
    #   - delete every file and folder inside this folder
    deleteFolder: (doc, callback) ->
        async.waterfall [
            # Find the folder
            (next) =>
                if doc._id
                    @pouch.db.get doc._id, next
                else if doc.fullpath
                    @pouch.getFolder doc.fullpath, next
                else
                    next new Error 'Invalid call to deleteFolder'

            # Delete everything inside this folder
            (folder, next) =>
                @emptyFolder folder, (err) ->
                    next err, folder

            # Delete the folder
            (folder, next) =>
                folder._deleted = true
                @pouch.db.put folder, next
        ], callback


module.exports = Normalizer
