async = require 'async'
should = require 'should'

{getClient, options} = require './helpers'

filesClient = getClient 'http://localhost:9121'


module.exports.getRootContent = getRootContent = (callback) ->
    filesClient.get '/files', (err, res, body) ->
        should.not.exist err
        should.exist res
        should.exist body
        callback err, body

module.exports.deleteAll = (callback) ->

    getRootContent (err, files) ->
        async.each files, (file, cb) ->
            url = "files/#{file.id}"
            filesClient.del url, (err, res, body) ->
                should.not.exist err
                should.exist res
                should.exist body
                res.statusCode.should.equal 200
                cb err
        , callback

module.exports.download = (file, callback) ->

    url = "files/#{file.id}/download/#{file.name}"
    target = "#{options.vaultPath}/#{file.name}"
    filesClient.saveFile url, target, (err, res, body) ->
        callback()
