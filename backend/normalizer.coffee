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
    ensureFolderExist: (doc, callback) =>
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


    ### Actions ###

    # Expectations:
    #   - the file path and name are present and valid
    #   - the checksum is present
    # Actions:
    #   - force the 'file' docType
    #   - add the creation date if missing
    #   - add the last modification date if missing
    #   - create the tree structure if needed
    # TODO
    #   - overwrite a possible existing file with the same path
    putFile: (doc, callback) ->
        if @invalidPathOrName doc
            log.warn "Invalid path or name: #{JSON.stringify doc, null, 2}"
            callback? 'Invalid path or name'
        else if @invalidChecksum doc
            log.warn "Invalid checksum: #{JSON.stringify doc, null, 2}"
            callback? 'Invalid checksum'
        else
            doc._id              ?= Pouch.newId()
            doc.docType           = 'file'
            doc.creationDate     ?= (new Date).toString()
            doc.lastModification ?= (new Date).toString()
            @ensureFolderExist doc, =>
                @pouch.db.put doc, (err) ->
                    if callback
                        callback err
                    else if err
                        log.error "Can't save #{JSON.stringify doc, null, 2}"
                        log.error err

    # Expectations:
    #   - the folder path and name are present and valid
    # Actions:
    #   - add the creation date if missing
    #   - add the last modification date if missing
    #   - create the tree structure if needed
    # TODO
    #   - overwrite a possible existing folder with the same path
    putFolder: (doc, callback) ->
        if @invalidPathOrName doc
            log.warn "Invalid path or name: #{JSON.stringify doc, null, 2}"
            callback? 'Invalid path or name'
        else
            doc._id              ?= Pouch.newId()
            doc.docType           = 'folder'
            doc.creationDate     ?= (new Date).toString()
            doc.lastModification ?= (new Date).toString()
            @ensureFolderExist doc, =>
                @pouch.db.put doc, (err) ->
                    if callback
                        callback err
                    else if err
                        log.error "Can't save #{JSON.stringify doc, null, 2}"
                        log.error err

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
            callback? 'Missing id'
        else if doc.docType isnt 'file'
            log.warn "Invalid docType: #{JSON.stringify doc, null, 2}"
            callback? 'Invalid docType'
        else if @invalidPathOrName doc
            log.warn "Invalid path or name: #{JSON.stringify doc, null, 2}"
            callback? 'Invalid path or name'
        else if @invalidChecksum doc
            log.warn "Invalid checksum: #{JSON.stringify doc, null, 2}"
            callback? 'Invalid checksum'
        else
            @ensureFolderExist doc, =>
                @pouch.db.put doc, (err) ->
                    if callback
                        callback err
                    else if err
                        log.error "Can't save #{JSON.stringify doc, null, 2}"
                        log.error err

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
            callback? 'Missing id'
        else if doc.docType isnt 'folder'
            log.warn "Invalid docType: #{JSON.stringify doc, null, 2}"
            callback? 'Invalid docType'
        else if @invalidPathOrName doc
            log.warn "Invalid path or name: #{JSON.stringify doc, null, 2}"
            callback? 'Invalid path or name'
        else
            @ensureFolderExist doc, =>
                @pouch.db.put doc, (err) ->
                    if callback
                        callback err
                    else if err
                        log.error "Can't save #{JSON.stringify doc, null, 2}"
                        log.error err

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
                    callback 'Invalid call to deleteFile'

            # Delete it
            (file, next) =>
                @pouch.db.remove file, next

        ], (err) ->
            if callback
                callback err
            else if err
                log.error "Can't delete #{JSON.stringify doc, null, 2}"
                log.error err

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
                    callback 'Invalid call to deleteFolder'

            # Delete everything inside this folder
            (folder, next) =>
                @emptyFolder folder, (err) ->
                    next err, folder

            # Delete the folder
            (folder, next) =>
                @pouch.db.remove folder, next

        ], (err) ->
            if callback
                callback err
            else if err
                log.error "Can't delete #{JSON.stringify doc, null, 2}"
                log.error err


module.exports = Normalizer
