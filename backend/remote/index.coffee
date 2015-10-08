Couch   = require './couch'
Watcher = require './watcher'


class Remote
    constructor: (config, @pouch, @events) ->
        @couch = new Couch config, @pouch, @events
        @watcher = new Watcher @couch, @pouch, config
        @other = null

    start: (mode, done) =>
        @watcher.initialReplication (err) =>
            done err
            @watcher.startReplication() unless err

    createReadStream: (doc, callback) =>
        @couch.downloadBinary doc.binary.file.id, callback


module.exports = Remote
