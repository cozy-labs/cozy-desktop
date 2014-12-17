async = require 'async'
should = require 'should'

{getClient, options} = require './helpers'

filesClient = getClient 'http://localhost:9121'


module.exports.getFolderContent = (folder, callback) ->

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

module.exports.renameFolder = (folder, newName, callback) ->
    folder.name = newName
    filesClient.put "folders/#{folder.id}", folder, (err, res, body) ->
        should.not.exist err
        should.exist res
        should.exist body
        res.statusCode.should.equal 200
        callback()

module.exports.createFolder = (folderName, callback) ->
    folder =
        name: folderName
        path: ''

    filesClient.post "folders/", folder, (err, res, body) ->
        should.not.exist err
        should.exist res
        should.exist body
        res.statusCode.should.equal 200
        callback()

module.exports.moveFolder = (folder, newPath, callback) ->
    filesClient.put "folders/#{folder.id}", path: newPath, (err, res, body) ->
        should.not.exist err
        should.exist res
        should.exist body
        res.statusCode.should.equal 200
        callback()

module.exports.removeFolder = (folder, callback) ->
    filesClient.del "folders/#{folder.id}", (err, res, body) ->
        should.not.exist err
        should.exist res
        should.exist body
        res.statusCode.should.equal 204
        callback()
