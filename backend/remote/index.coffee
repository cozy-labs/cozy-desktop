Couch   = require './couch'
Watcher = require './watcher'


class Remote
    constructor: (config, @pouch, @events) ->
        @couch = new Couch config, @pouch, @events
        @watcher = new Watcher @couch, @pouch, config

    start: (mode, done) ->
        @watcher.initialReplication (err) =>
            done err
            @watcher.startReplication() unless err


module.exports = Remote
