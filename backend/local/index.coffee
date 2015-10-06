fs = require 'fs'

watcher = require './watcher'


class Local
    constructor: (config, @pouch, @events) ->
        watcher.path = config.path
        watcher.publisher = @events

    start: (mode, done) ->
        fs.ensureDir @path, ->
            watcher.start done


module.exports = Local
