Couch = require './couch'
watcher = require './watcher'


class Remote
    constructor: (config, @queue, @events) ->
        @couch = new Couch options, @events
        watcher.publisher = @events
        watcher.queue = @queue

    start: (mode, done) ->
        watcher.initialReplication (err) ->
            if err
                done err
            else
                watcher.start done


module.exports = Remote
