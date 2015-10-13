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
# TODO overwrite, update metadata
class Normalizer
    constructor: (@pouch) ->

    ### Helpers ###

    # Return true if the document has a valid path and name
    # TODO what other things are not authorized? ~? $?
    invalidPathOrName: (doc) ->
        doc.path ?= ''
        doc.name ?= ''
        parents = doc.path.split '/'
        return '..' in parents or
               doc.name is '' or
               doc.name is '.' or
               doc.name is '..' or
               '/' in doc.name     # TODO to be tested

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
            @pouch.folders().get doc.path, (folder) =>
                if folder
                    callback()
                else
                    newFolder =
                        name: path.basename doc.path
                        path: path.dirname  doc.path
                    @addFolder newFolder, callback

    # Delete every files and folders inside the given folder
    emptyFolder: (folder, callback) =>
        fullpath = path.join folder.path, folder.name
        @pouch.byPath fullpath, (err, docs) =>
            if err
                log.error err
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
    addFile: (doc, callback) ->
        if invalidPathOrName doc
            log.warn "Invalid path or name: #{JSON.stringify doc, null, 2}"
        else if invalidChecksum doc
            log.warn "Invalid checksum: #{JSON.stringify doc, null, 2}"
        else
            doc.id               ?= Pouch.newId()
            doc.docType           = 'file'
            doc.creationDate     ?= new Date()
            doc.lastModification ?= new Date()
            ensureFolderExist doc, =>
                @pouch.db.put doc, (err) ->
                    log.error "Can't save #{JSON.stringify doc, null, 2}"
                    log.error err
                    callback? err

    # Expectations:
    #   - the folder path and name are present and valid
    # Actions:
    #   - add the creation date if missing
    #   - add the last modification date if missing
    #   - create the tree structure if needed
    addFolder: (doc, callback) ->
        if invalidPathOrName doc
            log.warn "Invalid path or name: #{JSON.stringify doc, null, 2}"
        else
            doc.id               ?= Pouch.newId()
            doc.docType           = 'folder'
            doc.creationDate     ?= new Date()
            doc.lastModification ?= new Date()
            ensureFolderExist doc, =>
                @pouch.db.put doc, (err) ->
                    log.error "Can't save #{JSON.stringify doc, null, 2}"
                    log.error err
                    callback? err

    # Expectations:
    #   - the file id is present
    #   - the new file path and name are present and valid
    # Actions:
    #   - create the tree structure if needed
    #   - update the last modification date
    # TODO
    #   - overwrite the destination if it was present
    moveFile: (doc, callback) ->
        if not doc.id
            log.warn "Missing id: #{JSON.stringify doc, null, 2}"
        if invalidPathOrName doc
            log.warn "Invalid path or name: #{JSON.stringify doc, null, 2}"
        else if invalidChecksum doc
            log.warn "Invalid checksum: #{JSON.stringify doc, null, 2}"
        else
            doc.docType          = 'file'
            doc.lastModification = new Date()
            ensureFolderExist doc, =>
                @pouch.db.put doc, (err) ->
                    log.error "Can't save #{JSON.stringify doc, null, 2}"
                    log.error err
                    callback? err

    # Expectations:
    #   - the folder id is present
    #   - the new folder path and name are present and valid
    # Actions:
    #   - create the tree structure if needed
    #   - update the last modification date
    # TODO
    #   - move every file and folder inside this folder
    #   - overwrite the destination if it was present
    moveFolder: (doc, callback) ->
        if not doc.id
            log.warn "Missing id: #{JSON.stringify doc, null, 2}"
        if invalidPathOrName doc
            log.warn "Invalid path or name: #{JSON.stringify doc, null, 2}"
        else
            doc.docType          = 'folder'
            doc.lastModification = new Date()
            ensureFolderExist doc, =>
                @pouch.db.put doc, (err) ->
                    log.error "Can't save #{JSON.stringify doc, null, 2}"
                    log.error err
                    callback? err

    # Expectations:
    #   - the file can be found by its id or by its fullpath
    #   - the file still exists in pouch
    deleteFile: (doc, callback) ->
        async.waterfall [
            # Find the file
            (next) =>
                if doc.id
                    @pouch.db.get doc.id, next
                else
                    @pouch.files().get doc.fullpath, next

            # Delete it
            (file, next) =>
                @pouch.db.remove file, next

        ], (err) ->
            if err
                log.error "Can't delete #{JSON.stringify doc, null, 2}"
                log.error err
                callback? err

    # Expectations:
    #   - the folder can be found by its id or by its fullpath
    #   - the folder still exists in pouch
    # Actions:
    #   - delete every file and folder inside this folder
    deleteFolder: (doc, callback) ->
        async.waterfall [
            # Find the folder
            (next) =>
                if doc.id
                    @pouch.db.get doc.id, next
                else
                    @pouch.folder().get doc.fullpath, next

            # Delete everything inside this folder
            (folder, next) =>
                @emptyFolder folder, (err) ->
                    next err, folder

            # Delete the folder
            (folder, next) =>
                @pouch.db.remove folder, next

        ], (err) ->
            if err
                log.error "Can't delete #{JSON.stringify doc, null, 2}"
                log.error err
                callback? err


module.exports = Normalizer
