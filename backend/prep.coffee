path    = require 'path'
log     = require('printit')
    prefix: 'Prep '


# When the local filesystem or the remote cozy detects a change, it calls this
# class to inform it. This class will check this event, add some informations,
# and give it to merge, so it can be saved in pouchdb.
#
# The documents in PouchDB have similar informations of those in CouchDB, but
# are not structured in the same way. In particular, the _id are uuid in CouchDB
# and the path to the file/folder (in a normalized form) in PouchDB.
class Prep
    constructor: (@merge) ->
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


    ### Actions ###

    # Expectations:
    #   - the file path is present and valid
    #   - the checksum is valid, if present
    addFile: (side, doc, callback) ->
        if @invalidPath doc
            log.warn "Invalid path: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid path'
        else if @invalidChecksum doc
            log.warn "Invalid checksum: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid checksum'
        else
            doc.docType = 'file'
            doc.creationDate ?= new Date
            doc.lastModification ?= new Date
            if doc.lastModification is 'Invalid date'
                doc.lastModification = new Date
            @buildId doc
            @merge.addFile side, doc, callback

    # Expectations:
    #   - the file path is present and valid
    #   - the checksum is valid, if present
    updateFile: (side, doc, callback) ->
        if @invalidPath doc
            log.warn "Invalid path: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid path'
        else if @invalidChecksum doc
            log.warn "Invalid checksum: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid checksum'
        else
            doc.docType = 'file'
            doc.lastModification ?= new Date
            if doc.lastModification is 'Invalid date'
                doc.lastModification = new Date
            @buildId doc
            @merge.updateFile side, doc, callback

    # Expectations:
    #   - the folder path is present and valid
    putFolder: (side, doc, callback) ->
        if @invalidPath doc
            log.warn "Invalid path: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid path'
        else
            doc.docType = 'folder'
            doc.lastModification ?= new Date
            if doc.lastModification is 'Invalid date'
                doc.lastModification = new Date
            @buildId doc
            @merge.putFolder side, doc, callback

    # Expectations:
    #   - the new file path is present and valid
    #   - the old file path is present and valid
    #   - the checksum is valid, if present
    #   - the two paths are not the same
    #   - the revision for the old file is present
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
            doc.docType = 'file'
            doc.lastModification ?= new Date
            if doc.lastModification is 'Invalid date'
                doc.lastModification = new Date
            @buildId doc
            @buildId was
            @merge.moveFile side, doc, was, callback

    # Expectations:
    #   - the new folder path is present and valid
    #   - the old folder path is present and valid
    #   - the two paths are not the same
    #   - the revision for the old folder is present
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
            doc.docType = 'folder'
            doc.lastModification ?= new Date
            if doc.lastModification is 'Invalid date'
                doc.lastModification = new Date
            @buildId doc
            @buildId was
            @merge.moveFolder side, doc, was, callback

    # Expectations:
    #   - the file path is present and valid
    deleteFile: (side, doc, callback) ->
        if @invalidPath doc
            log.warn "Invalid path: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid path'
        else
            doc.docType = 'file'
            @buildId doc
            @merge.deleteFile side, doc, callback

    # Expectations:
    #   - the folder path is present and valid
    deleteFolder: (side, doc, callback) ->
        if @invalidPath doc
            log.warn "Invalid path: #{JSON.stringify doc, null, 2}"
            callback new Error 'Invalid path'
        else
            doc.docType = 'folder'
            @buildId doc
            @merge.deleteFolder side, doc, callback


module.exports = Prep
