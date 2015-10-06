Couch   = require './couch'
Watcher = require './watcher'


class Remote
    constructor: (config, @pouch, @events) ->
        @couch = new Couch options, @pouch, @events
        @watcher = new Watcher @couch, @pouch, config

    start: (mode, done) ->
        @watcher.initialReplication (err) =>
            if err
                done err
            else
                @watcher.startReplication done


module.exports = Remote
