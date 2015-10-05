ProgressBar = require 'progress'
fs = require 'fs'


module.exports = progress =

    publisher: null

    showUpload: (filePath, fileStream) ->
        filesystem = require './filesystem'
        absPath = filesystem.getPaths(filePath).absolute
        size = fs.statSync(absPath).size
        progress.publisher.emit 'uploadStart', size
        prog = new ProgressBar 'uploading: [:bar] :percent :etas',
            total: size
            complete: '='
            incomplete: '-'
            width: 30

        fileStream.on 'data', (data) ->
            prog.tick data.length
            progress.publisher.emit 'uploadProgress', data.length

        fileStream.on 'end', ->
            progress.publisher.emit 'uploadEnd'

    showDownload: (size, resStream) ->
        progress.publisher.emit 'downloadStart', size
        prog = new ProgressBar 'downloading: [:bar] :percent :etas',
            total: size
            complete: '='
            incomplete: '-'
            width: 30

        resStream.on 'data', (data) ->
            prog.tick data.length
            progress.publisher.emit 'donwloadProgress', data.length

        resStream.on 'end', ->
            progress.publisher.emit 'downloadEnd'
