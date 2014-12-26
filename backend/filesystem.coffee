fs       = require 'fs-extra'
path     = require 'path'
async    = require 'async'
mime     = require 'mime'
crypto   = require 'crypto'
request  = require 'request-json-light'
log      = require('printit')
    prefix: 'Filesystem    '

config    = require './config'
pouch     = require './db'
publisher = require './publisher'
progress = require './progress'


filesystem =

    # Lock filesystem watching
    locked: false
    filesBeingCopied: {}

    # Build useful path from a given path.
    # (absolute, relative, filename, parent path, and parent absolute path).
    getPaths: (filePath) ->
        remoteConfig = config.getConfig()

        # Assuming filePath is 'hello/world.html':
        absolute  = path.resolve filePath # /home/sync/hello/world.html
        relative = path.relative remoteConfig.path, absolute # hello/world.html
        name = path.basename filePath # world.html
        parent = path.dirname path.join path.sep, relative # /hello
        absParent = path.dirname absolute # /home/sync/hello

        # Do not keep '/'
        parent = '' if parent is path.sep

        {absolute, relative, name, parent, absParent}


    # Return folder list in given dir. Parent path, filename and full path
    # are stored for each file.
    # TODO: add test and make async
    walkDirSync: (dir, filelist) =>
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
    walkFileSync: (dir, filelist) =>
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


    # Check that a file/folder exists and is in the synchronized directory
    checkLocation: (fileOrFolderpath, callback) ->
        paths = @getPaths fileOrFolderpath
        if paths.relative isnt '' \
           and paths.relative.substring(0,2) isnt '..'
            fs.exists paths.absolute, (exists) ->
                if not exists
                    callback new Error "#{paths.absolute} does not exist"
                else
                    callback()
        else
            callback new Error """
#{paths.absolute} is not located in the synchronized directory
"""

    # TODO add test
    # TODO make a micromodule from it?
    getFileClass: (filename, callback) ->
        mimeType = mime.lookup filename
        switch mimeType.split('/')[0]
            when 'image' then fileClass = "image"
            when 'application' then fileClass = "document"
            when 'text' then fileClass = "document"
            when 'audio' then fileClass = "music"
            when 'video' then fileClass = "video"
            else
                fileClass = "file"
        callback null, { mimeType, fileClass }


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
        #
        # Check if the size of the file has changed during the last second
        #
        unless filePath in @filesBeingCopied
            @filesBeingCopied[filePath] = true

        filesystem.getSize filePath, (err, earlySize) ->
            setTimeout () ->
                filesystem.getSize filePath, (err, lateSize) ->
                    if earlySize is lateSize
                        delete filesystem.filesBeingCopied[filePath]
                        callback()
                    else
                        filesystem.isBeingCopied filePath, callback
            , 2000 # TODO: Reduce this to get a faster upload

    # Check if a file corresponding to given checksum already exists.
    fileExistsLocally: (checksum, callback) ->
        pouch.binaries.get key: checksum, (err, res) ->
            if err
                callback err
            else if not res?.rows? or res.rows.length is 0
                callback null, false
            else
                binaryDoc = res.rows[0].value
                fs.exists binaryDoc.path, (exists) ->
                    if exists
                        callback null, binaryDoc.path
                    else
                        callback null, false

    # Download given binary to given path and save binary metadata in local DB.
    downloadBinary: (binaryId, targetPath, size, callback) ->

        # We maintain a local 'binary' document for each file present on the
        # filesystem. It allows us to have more flexibility on file checksum
        # or path comparison.
        # Note: Those 'binary' documents have the same ID/rev/doctype than
        # remote ones, but there is no replication whatsoever.

        doc = docType: 'Binary'

        async.waterfall [

            # Ensure that local binary document is deleted
            (next) ->
                pouch.db.remove binaryId, (err, res) ->
                    if err and err.status isnt 404 then next(err) else next()

            # Download the CouchDB attachment
            (next) ->
                filesystem.downloadAttachment binaryId, targetPath, size, next

            # Get the remote binary document
            (next) ->
                pouch.getRemoteDoc binaryId, (err, res) ->
                    if err and err isnt 404
                        next err
                    else
                        next null, res or _id: binaryId

            # Get the checksum
            (remoteBinaryDoc, next) ->
                doc._id =  remoteBinaryDoc._id
                doc._rev =  remoteBinaryDoc._rev

                if remoteBinaryDoc.checksum?
                    next null, remoteBinaryDoc.checksum
                else
                    filesystem.checksum targetPath, next

            # Save information on a local binary DB document
            (checksum, next) ->
                doc.path = targetPath
                doc.checksum = checksum
                pouch.db.get doc._id, (err, preDoc) ->
                    if preDoc?
                        doc._rev = preDoc._rev
                    pouch.db.put doc, next

        ], callback


    # Download given binary attachment to given location.
    downloadAttachment: (binaryId, targetPath, callback) ->
        remoteConfig = config.getConfig()
        deviceName = config.getDeviceName()

        client = request.newClient remoteConfig.url
        client.setBasicAuth deviceName, remoteConfig.devicePassword

        urlPath = "cozy/#{binaryId}/file"

        log.info "Downloading: #{targetPath}..."
        publisher.emit 'binaryDownloadStart', targetPath

        client.saveFileAsStream urlPath, targetPath, (err, res) ->
            if err
                callback err
            else
                fileStream = fs.createWriteStream targetPath
                res.pipe fileStream
                progress.showDownload size, res

                res.on 'finish', ->
                    log.info "Binary downloaded: #{targetPath}"
                    publisher.emit 'binaryDownloaded', targetPath
                    callback()


module.exports = filesystem
