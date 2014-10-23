async = require 'async'
should = require 'should'

{getClient, options} = require './helpers'

filesClient = getClient 'http://localhost:9121'


module.exports.getFolderContent = getFolderContent = (folder, callback) ->

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

module.exports.getElementByName = (name, elements) ->

    elements = elements.filter (element) -> element.name is name
    should.exist elements, "Element #{name} not found."
    elements.length.should.equal 1, "Element #{name} not found."
    return elements[0]

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
        , callback

module.exports.getFileContent = (file, callback) ->
    url = "files/#{file.id}/attach/#{file.name}"
    filesClient.get url, (err, res, body) ->
        should.not.exist err
        should.exist res
        should.exist body
        res.statusCode.should.equal 200
        callback err, body
    , false

