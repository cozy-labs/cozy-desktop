ProgressBar = require 'progress'

fs = require 'fs'
publisher = require './publisher'

module.exports =

    showUpload: (filePath, fileStream) ->
        filesystem = require './filesystem'
        absPath = filesystem.getPaths(filePath).absolute
        size = fs.statSync(absPath).size
        publisher.emit 'uploadStart', size
        prog = new ProgressBar 'uploading: [:bar] :percent :etas',
            total: size
            complete: '='
            incomplete: '-'
            width: 30

        fileStream.on 'data', (data) ->
            prog.tick data.length
            publisher.emit 'uploadProgress', data.length

        fileStream.on 'end', (data) ->
            publisher.emit 'uploadEnd', data.length

    showDownload: (size, resStream) ->
        publisher.emit 'downloadStart', size
        prog = new ProgressBar 'downloading: [:bar] :percent :etas',
            total: size
            complete: '='
            incomplete: '-'
            width: 30

        resStream.on 'data', (data) ->
            prog.tick data.length
            publisher.emit 'donwloadProgress', data.length

        resStreal.on 'end', (data) ->
            publisher.emit 'downloadEnd', data.length


