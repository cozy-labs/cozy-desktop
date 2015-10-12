fs       = require 'fs-extra'
path     = require 'path'
async    = require 'async'
mime     = require 'mime'
crypto   = require 'crypto'
request  = require 'request-json-light'
log      = require('printit')
    prefix: 'Filesystem    '

config    = require '../config'
pouch     = require '../pouch'
progress  = require '../progress'
# TODO publisher = require '../publisher'


filesystem =

    # Lock filesystem watching
    locked: false
    filesBeingCopied: {}

    # Build useful path from a given path.
    # (absolute, relative, filename, parent path, and parent absolute path).
    getPaths: (filePath) ->
        remote = config.getConfig().path

        # Assuming filePath is 'hello/world.html':
        absolute  = path.resolve remote, filePath  # /home/sync/hello/world.html
        relative = path.relative remote, absolute  # hello/world.html
        name = path.basename filePath              # world.html
        parent = path.dirname path.join path.sep, relative  # /hello
        absParent = path.dirname absolute          # /home/sync/hello

        # Do not keep '/'
        parent = '' if parent is path.sep

        {absolute, relative, name, parent, absParent}

    # Return mimetypes and class (like in classification) of a file.
    # ex: pic.png returns 'image/png' and 'image'.
    getFileClass: (filename, callback) ->
        mimeType = mime.lookup filename
        fileClass = switch mimeType.split('/')[0]
            when 'image'       then "image"
            when 'application' then "document"
            when 'text'        then "document"
            when 'audio'       then "music"
            when 'video'       then "video"
            else                    "file"
        callback null, {mimeType, fileClass}

    # Check that a file/folder exists and is in the synchronized directory
    checkLocation: (fileOrFolderpath, callback) ->
        paths = @getPaths fileOrFolderpath
        if paths.relative isnt '' \
                and paths.relative.substring(0,2) isnt '..'
            fs.exists paths.absolute, (exists) ->
                if not exists
                    callback new Error "#{paths.absolute} does not exist"
                else
                    callback null, true
        else
            callback new Error """
#{paths.absolute} is not located in the synchronized directory
"""

    # Return folder list in given dir. Parent path, filename and full path
    # are stored for each file.
    # TODO: add test and make async
    walkDirSync: (dir, filelist) ->
        remoteConfig = config.getConfig()

        files = fs.readdirSync dir
        filelist ?= []
        for filename in files
            filePath = path.join dir, filename
            if fs.statSync(filePath).isDirectory()
                parent = path.relative remoteConfig.path, dir
                parent = path.join(path.sep, parent) if parent isnt ''
                filelist.push {parent, filename, filePath}
                filelist = filesystem.walkDirSync filePath, filelist
        return filelist


    # Return file list in given dir. Parent path, filename and full path
    # are stored for each file.
    # TODO: add test and make async
    walkFileSync: (dir, filelist) ->
        remoteConfig = config.getConfig()

        files = fs.readdirSync dir
        filelist ?= []
        for filename in files
            filePath = path.join dir, filename
            if not fs.statSync(filePath).isDirectory()
                parent = path.relative remoteConfig.path, dir
                parent = path.join(path.sep, parent) if parent isnt ''
                filelist.push {parent, filename, filePath}
            else
                filelist = filesystem.walkFileSync filePath, filelist
        return filelist

    # Get checksum for given file.
    checksum: (filePath, callback) ->
        stream = fs.createReadStream filePath
        checksum = crypto.createHash 'sha1'
        checksum.setEncoding 'hex'

        stream.on 'end', ->
            checksum.end()
            callback null, checksum.read()

        stream.pipe checksum

    # Get size of given file.
    getSize: (filePath, callback) ->
        # TODO remove exists, stat should be enough
        fs.exists filePath, (exists) ->
            if exists
                fs.stat filePath, (err, stats) ->
                    if err?
                        callback err
                    else
                        callback null, stats.size
            else
                callback null, 0

    isBeingCopied: (filePath, callback) ->
        # Check if the size of the file has changed during the last second
        unless filePath in @filesBeingCopied
            @filesBeingCopied[filePath] = true

        filesystem.getSize filePath, (err, earlySize) ->
            if err
                delete filesystem.filesBeingCopied[filePath]
                callback err
            else
                setTimeout ->
                    filesystem.getSize filePath, (err, lateSize) ->
                        if err
                            delete filesystem.filesBeingCopied[filePath]
                            callback err
                        else
                            if earlySize is lateSize
                                delete filesystem.filesBeingCopied[filePath]
                                callback()
                            else
                                filesystem.isBeingCopied filePath, callback
                , 1000


    ### From pouch module ###

    # Create a file document in local database from given information.
    makeFileDoc: (filePath, callback) ->
        filePaths = filesystem.getPaths filePath
        async.series [

           (next) -> filesystem.getFileClass filePaths.name, next
           (next) -> fs.stat filePaths.absolute, next
           (next) -> dbHelpers.getDocForFile filePaths.absolute, next

        ], (err, results) ->

            # Do not mind if an existing document does not exists. It
            # means that we need a new file document.
            if err and err.status isnt 404
                log.error err
                return callback err

            [{mimeType, fileClass}, stats, existingDoc] = results

            infos = {fileClass, filePaths, mimeType, stats}
            if existingDoc?
                pouch.db.get existingDoc.binary.file.id, (err, doc) ->
                    if doc?
                        remoteConfig = config.getConfig()
                        doc.path =  path.join(
                            remoteConfig.path, filePaths.parent, filePaths.name)
                        pouch.db.put doc, (err) ->
                            if err
                                callback err
                            else
                                dbHelpers.makeFileDocFrom(
                                    existingDoc, infos, callback)
                    else
                        dbHelpers.makeFileDocFrom existingDoc, infos, callback

            else
                existingDoc = {}
                dbHelpers.makeFileDocFrom existingDoc, infos, callback


    makeFileDocFrom: (existingDoc, infos, callback) ->
        # Populate document information with the existing DB document
        # if it exists, or with the file stats otherwise.
        doc =
            _id: existingDoc._id or uuid.v4().split('-').join('')
            _rev: existingDoc._rev or null
            docType: 'File'
            class: infos.fileClass
            name: infos.filePaths.name
            path: infos.filePaths.parent
            mime: infos.mimeType
            lastModification: infos.stats.mtime
            creationDate: existingDoc.creationDate or infos.stats.mtime
            size: infos.stats.size
            tags: existingDoc.tags or []
            binary: existingDoc.binary or null

        # Keep the latest modification date
        if existingDoc.lastModification?
            existingFileLastMod = moment existingDoc.lastModification
            newFileLastMod = moment doc.lastModification

            if existingFileLastMod.isAfter newFileLastMod
                doc.lastModification = existingDoc.lastModification

        # Add the checksum here if it is not set
        if not doc.binary or not doc.binary.file.checksum
            filesystem.checksum infos.filePaths.absolute, (err, checksum) ->
                if err then callback err
                else
                    doc.binary ?= file: {}
                    doc.binary.file.checksum = checksum
                    callback null, doc

        else
            callback null, doc


    # Create a folder document in local database from given information.
    makeFolderDoc: (folderPath, callback) ->
        folderPaths = filesystem.getPaths folderPath

        # Check that the folder document exists already in DB
        key = "#{folderPaths.parent}/#{folderPaths.name}"
        pouch.folders.get key, (err, existingDoc) ->
            if err and err.status isnt 404
                return callback err

            # Get last modification date
            fs.stat folderPaths.absolute, (err, {mtime}) ->
                return callback err if err

                existingDoc ?= {}
                newDoc =
                    _id: existingDoc._id or uuid.v4().split('-').join('')
                    docType: 'Folder'
                    name: folderPaths.name
                    path: folderPaths.parent
                    tags: existingDoc.tags or []
                    creationDate: existingDoc.creationDate or mtime
                    lastModification: existingDoc.lastModification or mtime

                prevDate = new Date existingDoc.lastModification
                newDate = new Date mtime

                if prevDate > newDate
                    newDoc.lastModification = existingDoc.lastModification

                callback null, newDoc


    # TODO refactor: remove return statement in the middle and move the
    # final block to the filesystem module.
    getDocForFile: (filePath, callback) ->
        remoteConfig = config.getConfig()
        filePaths = filesystem.getPaths filePath

        # Find a potential existing document by its full path
        pouch.db.query 'file/byFullPath',
            key: "#{filePaths.parent}/#{filePaths.name}"
        , (err, res) ->

            # A 404 will be raised if no document were found
            # or if the 'file/byFullPath' filter is not set
            if err and err.status isnt 404
                return callback err

            # A res.rows of 0 item can be return
            if res.rows? and res.rows.length isnt 0
                return callback null, res.rows[0].value

            # Otherwise try to find a potential existing document by
            # looking for a similar checksum
            filesystem.checksum filePaths.absolute, (err, checksum) ->
                pouch.db.query 'file/byChecksum', key: checksum, (err, res) ->

                    # Same remark as above
                    if err and err.status isnt 404
                        return callback err

                    # If the file has been moved, there is a file with the same
                    # checksum. If there is more than one, we cannot ensure
                    # which file has been moved
                    if res.rows? and res.rows.length is 1
                        existingDoc = res.rows[0].value

                        unless existingDoc.path?
                            return pouch.db.remove existingDoc, ->
                                msg = 'Corrupted metadata, file deleted.'
                                callback new Error msg
                        movedFile = path.join remoteConfig.path
                                            , existingDoc.path
                                            , existingDoc.name

                        # If the old file exists at its location, then this is
                        # a duplication, not a moved file.
                        fs.exists movedFile, (fileExists) ->
                            unless fileExists
                                callback null, existingDoc
                            else
                                # UGLY TRICK
                                callback null,
                                    binary:
                                        file:
                                            checksum: checksum

                    else
                        # Return the checksum anyway to avoid its recalculation
                        # UGLY TRICK
                        callback null, { binary: file: checksum: checksum }


module.exports = filesystem
