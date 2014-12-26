ProgressBar = require 'progress'

fs = require 'fs'

module.exports =

    showUpload: (filePath, fileStream) ->
        filesystem = require './filesystem'
        absPath = filesystem.getPaths(filePath).absolute
        size = fs.statSync(absPath).size
        prog = new ProgressBar 'uploading: [:bar] :percent :etas',
            total: size
            complete: '='
            incomplete: '-'
            width: 30

        fileStream.on 'data', (data) ->
            prog.tick data.length

        fileStream.on 'end', (data) ->
            console.log '\n'
