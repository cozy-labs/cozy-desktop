fs       = require 'fs-extra'
mkdirp   = require 'mkdirp'
touch    = require 'touch'
path     = require 'path'
uuid     = require 'node-uuid'
mime     = require 'mime'
chokidar = require 'chokidar'
rimraf   = require 'rimraf'
log      = require('printit')
    prefix: 'Filesystem '

config = require './config'
pouch = require './db'
binary = require './binary'
async = require 'async'
events = require 'events'


remoteConfig = config.getConfig()

filesystem =

    isInSyncDir: (filePath) ->
        paths = @getPaths filePath
        return paths.relative isnt '' \
           and paths.relative.substring(0,2) isnt '..'


    deleteAll: (dirPath, callback) ->
        del = require 'del'
        del "#{dirPath}/*", force: true, callback


    getPaths: (filePath) ->
        remoteConfig = config.getConfig()

        # Assuming filePath is 'hello/world.html':
        absolute  = path.resolve filePath # /home/sync/hello/world.html
        relative  = path.relative remoteConfig.path, absolute # hello/world.html
        name      = path.basename filePath # world.html
        parent    = path.dirname path.join path.sep, relative # /hello
        absParent = path.dirname absolute # /home/sync/hello

        # Do not keep '/'
        parent    = '' if parent is '/'

        absolute: absolute
        relative: relative
        name: name
        parent: parent
        absParent: absParent


    makeDirectoryFromDoc: (doc, callback) ->
        remoteConfig = config.getConfig()
        doc = doc.value
        absPath = path.join remoteConfig.path, doc.path, doc.name
        dirPaths = filesystem.getPaths absPath

        # Create directory
        updateDates = (err) ->
            if err
                callback err
            else
                binary.infoPublisher.emit 'directoryCreated', absPath

                # Update directory information
                creationDate = new Date(doc.creationDate)
                modificationDate = new Date(doc.lastModification)
                absPath = dirPaths.absolute
                fs.utimes absPath, creationDate, modificationDate, callback

        mkdirp dirPaths.absolute, updateDates


    # Changes is the queue of operations, it contains
    # files that are being downloaded, and files to upload.
    changes: async.queue (task, callback) ->
        #console.log task.operation, task.file
        deviceName = config.getDeviceName()

        if task.operation in [
            'get'
            'delete'
            'newFolder'
            'catchup'
            'reDownload'
            'applyFolderDBChanges']
            filesystem.watchingLocked = true
            callbackOrig = callback
            callback = (err, res) ->
                #console.log 'done'
                filesystem.watchingLocked = false
                callbackOrig err, res
        #else
        #    callback_orig = callback
        #    callback = (err, res) ->
        #        console.log 'done'
        #        callback_orig err, res

        switch task.operation
            when 'post'
                if task.file?
                    filesystem.createFileDoc task.file, true, callback
            when 'put'
                if task.file?
                    filesystem.createFileDoc task.file, false, callback
            when 'get'
                if task.doc?
                    binary.fetchFromDoc deviceName, task.doc, callback
            when 'deleteDoc'
                if task.file?
                    filesystem.deleteDoc task.file, callback
            when 'delete'
                if task.id?
                    filesystem.deleteFromId task.id, callback
            when 'newFolder'
                if task.path
                    mkdirp task.path, callback
            when 'catchup'
                filesystem.applyFileDBChanges true, callback
            when 'reDownload'
                filesystem.applyFileDBChanges false, callback
            else
                # 'applyFolderDBChanges'
                filesystem.applyFolderDBChanges callback
    , 1


    applyFolderDBChanges: (callback) ->

        pouch.db.query 'folder/all', (err, result) ->
            if err then return callback err

            walkSync = (dir, filelist) =>
                files = fs.readdirSync dir
                filelist = filelist || []
                for file in files
                    if fs.statSync("#{dir}/#{file}").isDirectory()
                        parent = path.relative remoteConfig.path, dir
                        parent = path.join path.sep, parent if parent isnt ''
                        filelist.push [parent, file, "#{dir}/#{file}"]
                        filelist = walkSync("#{dir}/#{file}/", filelist)
                return filelist

            async.each walkSync(remoteConfig.path), (dir, cb) ->
                fullPath = "#{dir[0]}/#{dir[1]}"
                pouch.db.query 'folder/byFullPath', key: fullPath, (err, res) ->
                    if res.rows.length is 0 and fs.existsSync dir[2]
                        log.info "Removing directory: #{dir[2]} (not remotely listed)"
                        fs.remove dir[2], cb
                    else
                        cb null
            , (err) ->
                if err
                    callback err
                else
                    async.eachSeries result['rows'],
                       filesystem.makeDirectoryFromDoc,
                       callback


    applyFileDBChanges: (keepLocalDeletions, callback) ->
        deviceName = config.getDeviceName()
        keepLocalDeletions ?= false

        downloadIfNotExists = (doc, callback) =>
            doc = doc.value
            filePath = path.resolve remoteConfig.path, doc.path, doc.name
            if fs.existsSync filePath
                callback null
            else
                if keepLocalDeletions
                    # If we want to priorize local changes, delete DB doc
                    filesystem.deleteDoc filePath, callback
                else
                    # Else download file
                    binary.fetchFromDoc deviceName, doc, callback

        getFolders = (err, result) ->
            if err and err.status isnt 404
                callback err
            else
                result = { 'rows': [] } if err?.status is 404
                pouch.db.query 'folder/all', (err, result2) ->
                    if err and err.status isnt 404
                        callback err
                    else
                        result2 = { 'rows': [] } if err?.status is 404
                        results = result['rows'].concat(result2['rows'])
                        async.each results, downloadIfNotExists, callback

        pouch.db.query 'file/all', getFolders


    createDirectoryDoc: (dirPath, ignoreExisting, callback) ->
        dirPaths = @getPaths dirPath

        updateDirectoryInformation = (existingDoc, newDoc) ->
            newDoc._id = existingDoc._id
            newDoc._rev = existingDoc._rev
            newDoc.creationDate = existingDoc.creationDate
            newDoc.tags = existingDoc.tags
            if new Date(existingDoc.lastModification) \
             > new Date(newDoc.lastModification)
                newDoc.lastModification = existingDoc.lastModification
            return newDoc

        checkDirectoryExistence = (newDoc) ->
            pouch.db.query 'folder/byFullPath'
            , key: "#{newDoc.path}/#{newDoc.name}"
            , (err, res) ->
                if err and err.status isnt 404
                    callback err
                else if res.rows.length > 0
                    if ignoreExisting
                        callback null
                    else
                        newDoc =
                            updateDirectoryInformation res.rows[0].value, newDoc
                        pouch.db.put newDoc, callback
                else
                    pouch.db.put newDoc, callback

        updateDirectoryStats = (newDoc) ->
            fs.stat dirPaths.absolute, (err, stats) ->
                newDoc.creationDate = stats.mtime
                newDoc.lastModification = stats.mtime

                checkDirectoryExistence newDoc

        createParentDirectory = (newDoc) =>
            filesystem.createDirectoryDoc dirPaths.absParent, true, (err, res) ->
                if err
                    log.error "An error occured at parent
                               directory's creation"
                    callback err
                else
                    updateDirectoryStats newDoc

        checkDirectoryLocation = () =>
            remoteConfig = config.getConfig()
            if not @isInSyncDir(dirPath) or not fs.existsSync(dirPaths.absolute)
                unless dirPath is '' or dirPath is remoteConfig.path
                    log.error "Directory is not located in the
                               synchronized directory: #{dirPaths.absolute}"
                # Do not throw error
                callback null
            else
                createParentDirectory
                    _id: uuid.v4().split('-').join('')
                    docType: 'Folder'
                    name: dirPaths.name
                    path: dirPaths.parent
                    tags: []

        checkDirectoryLocation()


    # TODO refactor it in smaller functions.
    createFileDoc: (filePath, ignoreExisting, callback) ->
        filePaths = @getPaths filePath

        saveBinaryDocument = (newDoc) ->

            # Save location and checksum locally to
            # facilitate further operations
            binary.saveLocation filePaths.absolute
                                , newDoc.binary.file.id
                                , newDoc.binary.file.rev
                                , (err, doc) ->
                if err
                    callback err
                else
                    newDoc.binary.file.checksum = doc.checksum
                    pouch.db.put newDoc, callback


        uploadBinary = (newDoc, binaryDoc) ->
            binary.uploadAsAttachment binaryDoc.id
                                    , binaryDoc.rev
                                    , filePaths.absolute
                                    , (err, newBinaryDoc) ->
                if err
                    callback err
                else
                    newDoc.binary =
                        file:
                            id: newBinaryDoc.id
                            rev: newBinaryDoc.rev

                    saveBinaryDocument newDoc

        updateFileInformation = (existingDoc, newDoc) ->

            # Fullfill document information
            newDoc._id = existingDoc._id
            newDoc._rev = existingDoc._rev
            newDoc.creationDate = existingDoc.creationDate
            newDoc.tags = existingDoc.tags
            newDoc.binary = existingDoc.binary
            if new Date(existingDoc.lastModification) \
             > new Date(newDoc.lastModification)
                newDoc.lastModification = existingDoc.lastModification
            return newDoc

        populateBinaryInformation = (newDoc) ->
            if newDoc.binary?
                # Get the ID and the revision of the remote binary document
                # (since binary documents are not synchronized with the local
                # pouchDB)
                binary.getRemoteDoc newDoc.binary.file.id, (err, binaryDoc) ->
                    if err
                        callback err
                    else
                        uploadBinary newDoc, binaryDoc
            else
                # If binary does not exist remotely yet, we have to
                # create an empty binary document remotely to have
                # an ID and a revision
                binary.createEmptyRemoteDoc (err, binaryDoc) ->
                    if err
                        callback err
                    else
                        uploadBinary newDoc, binaryDoc

        checkBinaryExistence = (newDoc, checksum) ->
            # Check if the binary doc exists, using its checksum
            # It would mean that binary is already uploaded
            binary.docAlreadyExists checksum, (err, doc) ->
                if err
                    callback err
                #else if doc
                #    # Binary document exists
                #    newDoc.binary =
                #        file:
                #            id: doc._id
                #            rev: doc._rev
                #    saveBinaryDocument newDoc
                else
                    populateBinaryInformation newDoc

        checkFileExistence = (newDoc) ->

            binary.checksum filePaths.absolute, (err, checksum) ->
                # Get the existing file (if exists) to prefill
                # document with its information
                pouch.allFiles false, (err, existingDocs) ->
                    if err and err.status isnt 404
                        callback err
                    else
                        if existingDocs
                            # Loop through existing files
                            for existingDoc in existingDocs.rows
                                existingDoc = existingDoc.value
                                if (existingDoc.name is newDoc.name \
                                and existingDoc.path is newDoc.path)
                                    if (existingDoc.binary?.file?.checksum? \
                                    and existingDoc.binary.file.checksum \
                                    is checksum) and ignoreExisting
                                        return callback null
                                    # File already exists
                                    newDoc = updateFileInformation existingDoc,
                                        newDoc

                        checkBinaryExistence newDoc, checksum

        updateFileStats = (newDoc) ->

            # Update size and dates using the value of the FS
            fs.stat filePaths.absolute, (err, stats) ->
                newDoc.creationDate = stats.mtime
                newDoc.lastModification = stats.mtime
                newDoc.size = stats.size

                checkFileExistence newDoc

        createParentDirectory = (newDoc) =>
            @createDirectoryDoc filePaths.absParent, true, (err, res) ->
                if err
                    log.error "An error occured at parent directory's creation"
                    callback err
                else
                    updateFileStats newDoc

        checkFileLocation = () =>
            remoteConfig = config.getConfig()
            if not @isInSyncDir(filePath) \
            or not fs.existsSync(filePaths.absolute)
                unless filePath is '' or filePath is remoteConfig.path
                    log.error "File is not located in the
                               synchronized directory: #{filePaths.absolute}"
                # Do not throw error
                callback null
            else
                # We pass the new document through every local functions
                createParentDirectory
                    _id: uuid.v4().split('-').join('')
                    docType: 'File'
                    class: 'document'
                    name: filePaths.name
                    path: filePaths.parent
                    mime: mime.lookup filePaths.name
                    tags: []

        checkFileLocation()

    deleteFromId: (id, callback) ->
        pouch.db.get id, (err, res) ->
            if err and err.status isnt 404
                callback err
            else if res?.path? and fs.existsSync res.path
                fs.unlink res.path, ->
                    callback null
            else
                if err and err.status is 404
                    callback null
                else
                    callback err


    # TODO refactor it in smaller functions.
    deleteDoc: (filePath, callback) ->
        filePaths = @getPaths filePath

        markAsDeleted = (deletedDoc) ->

            # Use the same pethod as in DS:
            # https://github.com/cozy/cozy-data-system/blob/master/server/lib/db_remove_helper.coffee#L7
            emptyDoc =
                _id: deletedDoc._id
                _rev: deletedDoc._rev
                _deleted: false
                docType: deletedDoc.docType

            # Since we use the same function to delete a file and a folder
            # we have to check if the binary key exists
            if deletedDoc.binary?
                emptyDoc.binary = deletedDoc.binary

            pouch.db.put emptyDoc, (err, res) ->
                if err
                    callback err
                else
                    pouch.db.remove res.id, res.rev, callback

        getDoc = (deletedFileName, deletedFilePath) ->

            # We want to search through files and folders
            options =
                include_docs: true
                key: "#{filePaths.parent}/#{filePaths.name}"
            pouch.db.query 'file/byFullPath', options, (err, existingDocs) ->
                if existingDocs.rows.length is 0
                    pouch.db.query 'folder/byFullPath', options, (err, existingDocs) ->
                        if existingDocs.rows.length is 0
                            # Document is already deleted
                            callback null
                        else
                            markAsDeleted existingDocs.rows[0].value
                else
                    markAsDeleted existingDocs.rows[0].value

        getDoc filePaths.name, filePaths.parent


    # TODO refactor it in smaller functions.
    watchChanges: (continuous, fromNow) ->
        remoteConfig = config.getConfig()
        fromNow ?= false
        continuous ?= fromNow

        filesBeingCopied = {}

        # Function to check if file is being copied
        # to avoid chokidar to detect file multiple times
        fileIsCopied = (filePath, callback) ->
            unless filePath in filesBeingCopied
                filesBeingCopied[filePath] = true
            getSize = (filePath, callback) ->
                if fs.existsSync filePath
                    fs.stat filePath, (err, stats) ->
                        callback err, stats.size

            # Check if the size of the file has changed during
            # the last second
            getSize filePath, (err, earlySize) ->
                setTimeout () ->
                    getSize filePath, (err, lateSize) ->
                        if earlySize is lateSize
                            delete filesBeingCopied[filePath]
                            callback()
                        else
                            fileIsCopied filePath, callback
                , 2000

        # Use chokidar since the standard watch() function from
        # fs module has some issues.
        # More info on https://github.com/paulmillr/chokidar
        watcher = chokidar.watch remoteConfig.path,
            ignored: /[\/\\]\./
            persistent: continuous
            ignoreInitial: fromNow

        # New file detected
        .on 'add', (filePath) =>
            if not @watchingLocked and not filesBeingCopied[filePath]?
                log.info "File added: #{filePath}"
                fileIsCopied filePath, =>
                    @changes.push { operation: 'post', file: filePath }, ->

        # New directory detected
        .on 'addDir', (dirPath) =>
            if not @watchingLocked
                if dirPath isnt remoteConfig.path
                    #log.info "Directory added: #{dirPath}"
                    log.info "Directory added: #{dirPath}"
                    @createDirectoryDoc dirPath, true, ->

        # File deletion detected
        .on 'unlink', (filePath) =>
            log.info "File deleted: #{filePath}"
            @changes.push { operation: 'deleteDoc', file: filePath }, ->

        # Folder deletion detected
        .on 'unlinkDir', (dirPath) =>
            log.info "Folder deleted: #{dirPath}"
            @changes.push { operation: 'deleteDoc', file: dirPath }, ->

        # File update detected
        .on 'change', (filePath) =>
            if not @watchingLocked and not filesBeingCopied[filePath]?
                log.info "File changed: #{filePath}"
                fileIsCopied filePath, =>
                    @changes.push { operation: 'put', file: filePath }, ->

        .on 'error', (err) ->
            log.error 'An error occured while watching changes:'
            console.error err


module.exports = filesystem
