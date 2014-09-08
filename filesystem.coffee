fs      = require 'fs'
mkdirp  = require 'mkdirp'
touch   = require 'touch'
path    = require 'path'
uuid    = require 'node-uuid'
log     = require('printit')
          prefix: 'Data Proxy | filesystem'

config  = require './config'
pouch   = require './db'
binary  = require './binary'

Promise = require 'bluebird'
Promise.longStackTraces()
Promise.promisifyAll lib for lib in [fs, mkdirp, touch, pouch, binary]

# Promisify specific functions
mkdirpAsync = Promise.promisify mkdirp.mkdirp
touchAsync  = Promise.promisify touch

remoteConfig = config.getConfig()

module.exports =

    makeDirectoryFromDoc: (doc, callback) ->
        dirName = path.join remoteConfig.path, doc.path, doc.name

        # Create directory
        mkdirpAsync(dirName)

        # Update directory information
        .then -> fs.utimesAsync(
                    dirName,
                    new Date(doc.creationDate),
                    new Date(doc.lastModification)
                 )

        .then -> callback()

        .catch (err) ->
            log.error err.toString()
            console.error err.stack


    touchFileFromDoc: (doc, callback) ->
        fileName = path.join remoteConfig.path, doc.path, doc.name

        # Ensure parent directory exists
        mkdirpAsync(path.join(remoteConfig.path, doc.path))

        # Get binary document from DB
        .then -> pouch.db.getAsync doc.binary.file.id
        .catch (err) ->
            return null if err.status is 404

        # Move binary if exists, otherwise touch the file
        .then (binaryDoc) ->
            if binaryDoc? and fs.existsSync binaryDoc.path
                binary.moveFromDocAsync binaryDoc, fileName
            else
                touchAsync fileName

        # Update file information
        .then -> fs.utimesAsync(
                    fileName,
                    new Date(doc.creationDate),
                    new Date(doc.lastModification)
                 )

        .then -> callback()

        .catch (err) ->
            log.error err
            console.error err.stack


    buildTree: (filePath, callback) ->
        # If filePath argument is set, rebuild FS information for this file only
        if filePath?
            log.info "Updating file info: #{filePath}"
        else
            log.info "Rebuilding filesystem tree"

        # Add folder filter if not exists
        pouch.addFilterAsync('folder').bind(@)

        # Query database
        .then -> pouch.db.queryAsync 'folder/all'

        # Filter interesting folder(s)
        .get('rows').filter (doc) ->
            return not filePath? \
                or filePath is path.join doc.value.path, doc.value.name

        # Create folder(s)
        .each (doc) -> @makeDirectoryFromDocAsync doc.value

        # Add file filter if not exists
        .then -> pouch.addFilterAsync 'file'

        # Query database
        .then -> pouch.db.queryAsync 'file/all'

        # Filter interesting file(s)
        .get('rows').filter (doc) ->
            return not filePath? \
                or filePath is path.join doc.value.path, doc.value.name

        # Create file(s)
        .each (doc) -> @touchFileFromDocAsync doc.value

        .then -> callback()
        .catch (err) ->
            log.error err.toString()
            console.error err.stack


    getPaths: (filePath) ->
        # Assuming filePath is 'hello/world.html':
        absolute = path.resolve filePath                      # /home/sync/hello/world.html
        relative = path.relative remoteConfig.path, absolute  # hello/world.html
        name     = path.basename filePath                     # world.html
        parent   = path.dirname path.join path.sep, relative  # /hello

        # Do not keep '/'
        parent   = '' if parent is '/'

        absolute: absolute
        relative: relative
        name: name
        parent: parent


    isInSyncDir: (filePath) ->
        paths = @getPaths filePath
        return paths.relative.substring(0,2) isnt '..'


    createDirectoryContentDoc: (dirPath, callback) ->

    createDirectoryDoc: (dirPath, callback) ->
        dirPaths = @getPaths dirPath

        # Check directory's location
        unless @isInSyncDir(dirPath) and fs.existsSync(dirPaths.absolute)
            log.error "Directory is not located in the 
                       synchronized directory: #{dirPaths.absolute}"
            return callback()


        # Initialize doc Object
        document =
            _id: uuid.v4().split('-').join('')
            docType: 'Folder'
            name: dirPaths.name
            path: dirPaths.parent
            tags: []

        # Add directory stats
        fs.statAsync(dirPaths.absolute)
        .then (stats) ->
            document.creationDate     = stats.mtime
            document.lastModification = stats.mtime

            pouch.db.queryAsync 'folder/all'
        # Look for directory with the same path/name
        .get('rows').filter (doc) ->
            return doc.value.name is document.name \
               and doc.value.path is document.path

        # If exists, update document information
        .each (doc) ->
            document._id          = doc.value._id
            document._rev         = doc.value._rev
            document.creationDate = doc.value.creationDate
            document.tags         = doc.value.tags
            if new Date(doc.value.lastModification) \
             > new Date(document.lastModification)
                document.lastModification = doc.value.lastModification

        # Otherwise do not mind if directory doc is not found
        .catch (err) ->
            throw err unless err.status is 404

        # Create or update directory document
        .then ->
            pouch.db.putAsync document

        .then -> callback()
        .catch (err) ->
            log.error err.toString()
            console.error err.stack


    createFileDoc: (path) ->



# Promisify above functions
Promise.promisifyAll module.exports
