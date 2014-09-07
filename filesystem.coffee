fs = require 'fs'
mkdirp = require 'mkdirp'
touch = require 'touch'
path = require 'path'
log = require('printit')
    prefix: 'Data Proxy | filesystem'

config = require './config'
pouch = require './db'
binary = require './binary'

# Promisify ALL THE THINGS  \o
Promise = require 'bluebird'
Promise.longStackTraces()
Promise.promisifyAll lib for lib in [fs, mkdirp, touch, pouch, binary]

# Promisify specific functions
mkdirpAsync = Promise.promisify mkdirp.mkdirp
touchAsync = Promise.promisify touch

# Get config
remoteConfig = config.getConfig()

module.exports =

    createDirectoryFromDoc: (doc, callback) ->
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


    createFileFromDoc: (doc, callback) ->
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
        .each (doc) ->@createDirectoryFromDocAsync doc.value

        # Add file filter if not exists
        .then -> pouch.addFilterAsync 'file'

        # Query database
        .then -> pouch.db.queryAsync 'file/all'

        # Filter interesting file(s)
        .get('rows').filter (doc) ->
            return not filePath? \
                or filePath is path.join doc.value.path, doc.value.name

        # Create file(s)
        .each (doc) -> @createFileFromDocAsync doc.value

        .then -> callback()

        .catch (err) ->
            log.error err.toString()
            console.error err.stack


# Promisify above functions
Promise.promisifyAll module.exports
