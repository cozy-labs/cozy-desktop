fs = require 'fs'
log = require('printit')
    prefix: 'Data Proxy | binary'

pouch = require './db'

Promise = require 'bluebird'
Promise.longStackTraces()
Promise.promisifyAll fs

module.exports =

    moveBinary: (doc, finalPath, callback) ->
        # Move file in the filesystem
        fs.renameAsync(doc.path finalPath)

        # Change path in the binary DB document
        .then () ->
            doc.path = finalPath
            return pouch.db.putAsync doc

        .then () ->
            callback()

        .catch (err) ->
            log.error err
