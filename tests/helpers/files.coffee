async = require 'async'
should = require 'should'
del = require 'del'

{getClient, options} = require './helpers'

filesClient = getClient 'http://localhost:9121'

getFolderContent = (folder, callback) ->

    if folder is "root"
        folder = id: "root"
    else
        should.exist folder
        folder.docType.toLowerCase().should.equal "folder"

    filesClient.post '/folders/content', folder, (err, res, body) ->
        should.not.exist err
        should.exist res
        should.exist body
        body.should.have.property 'content'
        callback err, body.content

module.exports.getElementByName = (name, elements, checkExistence = true) ->

    elements = elements.filter (element) -> element.name is name
    should.exist elements
    if checkExistence
        elements.length.should.equal 1, "Element #{name} not found."
    return elements?[0] or null

module.exports.deleteAll = (callback) ->
    @timeout 30000

    getFolderContent "root", (err, elements) ->
        async.each elements, (element, cb) ->
            if element.docType.toLowerCase() is "file"
                url = "files/#{element.id}"
                expectedCode = 200
            else
                url = "folders/#{element.id}"
                expectedCode = 204
            filesClient.del url, (err, res, body) ->
                should.not.exist err
                should.exist res
                should.exist body
                res.statusCode.should.equal expectedCode
                setTimeout cb, 1000
        , ->
            del '/tmp/cozy', force: true, callback

module.exports.getFileContent = (file, callback) ->
    url = "files/#{file.id}/attach/#{file.name}"
    filesClient.get url, (err, res, body) ->
        should.not.exist err
        should.exist res
        should.exist body
        res.statusCode.should.equal 200, "#{file.name} should exist"
        callback err, body
    , false

module.exports.uploadFile = (fileName, fixturePath, callback) ->
    file =
        name: fileName
        path: ''
        lastModification: "Thu Oct 17 2013 08:29:21 GMT+0200 (CEST)",

    filesClient.sendFile "files/", fixturePath, file, (err, res, body) ->
        should.not.exist err
        should.exist res
        should.exist body
        res.statusCode.should.equal 200
        body = JSON.parse body
        filesClient.get "files/#{body.id}", file, (err, res, body) ->
            res.statusCode.should.equal 200
            callback err, body

module.exports.renameFile = (file, newName, callback) ->
    file.name = newName
    filesClient.put "files/#{file.id}", file, (err, res, body) ->
        should.not.exist err
        should.exist res
        should.exist body
        res.statusCode.should.equal 200
        callback()

module.exports.moveFile = (file, newPath, callback) ->
    filesClient.put "files/#{file.id}", path: newPath, (err, res, body) ->
        should.not.exist err
        should.exist res
        should.exist body
        res.statusCode.should.equal 200
        callback()

module.exports.removeFile = (file, callback) ->
    filesClient.del "files/#{file.id}", (err, res, body) ->
        should.not.exist err
        should.exist res
        should.exist body
        res.statusCode.should.equal 200
        callback()
