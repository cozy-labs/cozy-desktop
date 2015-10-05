watcher = require './watcher'


class Remote
    constructor: (config, @queue, @events) ->
        watcher.publisher = @events
        watcher.queue = @queue

    start: (mode, done) ->
        watcher.initialReplication (err) ->
            if err
                done err
            else
                watcher.start done


module.exports = Remote
