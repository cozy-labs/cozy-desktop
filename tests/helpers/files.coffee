async   = require 'async'
request = require 'request-json-light'
should  = require 'should'


url    = 'http://localhost:9121'
client = request.newClient url

# Manipulate files and folders on a remote cozy, via the files application
module.exports = helpers =

    deleteAll: (callback) ->
        @timeout 10000
        helpers.getFolderContent id: 'root', (err, items) ->
            async.each items, (item, cb) ->
                url = "#{item.docType.toLowerCase()}s/#{item.id}"
                client.del url, (err, res, body) ->
                    should.not.exist err
                    should.exist res
                    should.exist body
                    res.statusCode.should.be.within 200, 299
                    setTimeout cb, 1000
            , callback

    getAllFiles: (callback) ->
        client.get 'files', (err, res, body) ->
            should.not.exist err
            should.exist body
            callback err, body

    getFileContent: (file, callback) ->
        url = "files/#{file.id}/attach/#{file.name}"
        client.get url, (err, res, body) ->
            should.not.exist err
            should.exist res
            should.exist body
            res.statusCode.should.equal 200
            callback err, body

    uploadFile: (file, fixturePath, callback) ->
        file.lastModification = new Date().toISOString()
        client.sendFile 'files/', fixturePath, file, (err, res, body) ->
            should.not.exist err
            should.exist res
            should.exist body
            res.statusCode.should.equal 200
            client.get "files/#{body.id}", file, (err, res, body) ->
                res.statusCode.should.equal 200
                callback err, body

    updateFile: (file, callback) ->
        client.put "files/#{file.id}", file, (err, res, body) ->
            should.not.exist err
            should.exist res
            should.exist body
            res.statusCode.should.equal 200
            callback()

    removeFile: (file, callback) ->
        client.del "files/#{file.id}", (err, res, body) ->
            should.not.exist err
            should.exist res
            should.exist body
            res.statusCode.should.equal 200
            callback()

    getAllFolders: (callback) ->
        client.get 'folders/folders', (err, res, body) ->
            should.not.exist err
            should.exist body
            callback err, body

    getFolderContent: (folder, callback) ->
        client.post '/folders/content', folder, (err, res, body) ->
            should.not.exist err
            should.exist res
            should.exist body
            body.should.have.property 'content'
            callback err, body.content

    createFolder: (folder, callback) ->
        client.post 'folders/', folder, (err, res, body) ->
            should.not.exist err
            should.exist res
            should.exist body
            res.statusCode.should.equal 200
            client.get "folders/#{body.id}", (err, res, body) ->
                res.statusCode.should.equal 200
                callback err, body

    updateFolder: (folder, callback) ->
        client.put "folders/#{folder.id}", folder, (err, res, body) ->
            should.not.exist err
            should.exist res
            should.exist body
            res.statusCode.should.equal 200
            callback err, body

    removeFolder: (folder, callback) ->
        client.del "folders/#{folder.id}", folder, (err, res, body) ->
            should.not.exist err
            should.exist res
            should.exist body
            res.statusCode.should.equal 204
            callback err, body
