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

remoteConfig = config.config.remotes['devicename']


createDirectoryFromDoc = (doc, callback) ->
    dirName = path.join remoteConfig.path, doc.path, doc.name

    # Create directory
    mkdirpAsync(dirName)

    # Update directory information
    .then () ->
        fs.utimesAsync(
            dirName,
            new Date(doc.creationDate),
            new Date(doc.lastModification)
        )

    .then () ->
        callback()

    .catch (err) ->
        log.error err
        console.error err.stack

createDirectoryFromDocAsync = Promise.promisify createDirectoryFromDoc


createFileFromDoc = (doc, callback) ->
    fileName = path.join remoteConfig.path, doc.path, doc.name

    # Ensure parent directory exists
    mkdirpAsync(path.join(remoteConfig.path, doc.path))

    # Get binary document from DB
    .then () ->
        pouch.db.getAsync(doc.binary.file.id)
    .catch (err) ->
        if err.status is 404
            return null

    # Move binary if exists, otherwise touch the file
    .then (binaryDoc) ->
        if binaryDoc?
            binary.moveBinaryAsync binaryDoc.path, fileName
        else
            touchAsync fileName

    # Update file information
    .then () ->
        fs.utimesAsync(
            fileName,
            new Date(doc.creationDate),
            new Date(doc.lastModification)
        )

    .then () ->
        callback()

    .catch (err) ->
        log.error err
        console.error err.stack

createFileFromDocAsync = Promise.promisify createFileFromDoc


buildTree = (args, callback) ->
    # End process if callback does not exists (i.e. via CLI call)
    if not callback? or typeof callback is 'object'
        callback = (err) ->
            process.exit if err? then 1 else 0

    # If filePath argument is set, rebuild FS information for this file only
    filePath = args.filePath
    if filePath?
        log.info "Updating file info: #{filePath}"
    else
        log.info "Rebuilding filesystem tree"


    # Add folder filter if not exists
    pouch.addFilterAsync('folder')

    # Query database
    .then () ->
        pouch.db.queryAsync('folder/all')

    # Create folder(s)
    .get('rows').each (doc) ->
        if not filePath? \
        or filePath is path.join doc.value.path, doc.value.name
            createDirectoryFromDocAsync doc.value

    # Add file filter if not exists
    .then () ->
        pouch.addFilterAsync('file')

    # Query database
    .then () ->
        pouch.db.queryAsync('file/all')

    # Create file(s)
    .get('rows').each (doc) ->
        if not filePath? \
        or filePath is path.join doc.value.path, doc.value.name
            createFileFromDocAsync doc.value

    .then () ->
        callback()

    .catch (err) ->
        log.error err.toString()
        console.error err.stack

buildTreeAsync = Promise.promisify buildTree


module.exports =
    createDirectoryFromDoc: createDirectoryFromDoc
    createFileFromDoc: createFileFromDoc
    buildTree: buildTree

