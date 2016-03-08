path = require 'path'

Pouch = require '../../src/pouch'


module.exports =
    createDatabase: (done) ->
        @pouch = new Pouch @config
        @pouch.addAllViews done

    cleanDatabase: (done) ->
        @pouch.db.destroy =>
            @pouch = null
            done()

    createParentFolder: (pouch, callback) ->
        doc =
            _id: 'my-folder'
            path: 'my-folder'
            docType: 'folder'
            creationDate: new Date()
            lastModification: new Date()
            tags: []
        pouch.db.put doc, callback

    createFolder: (pouch, i, callback) ->
        id = path.join 'my-folder', "folder-#{i}"
        doc =
            _id: id
            path: id
            docType: 'folder'
            creationDate: new Date()
            lastModification: new Date()
            tags: []
            remote:
                _id: "123456789#{i}"
        pouch.db.put doc, callback

    createFile: (pouch, i, callback) ->
        id = path.join 'my-folder', "file-#{i}"
        doc =
            _id: id
            path: id
            docType: 'file'
            checksum: "111111111111111111111111111111111111111#{i}"
            creationDate: new Date()
            lastModification: new Date()
            tags: []
            remote:
                _id: "1234567890#{i}"
        pouch.db.put doc, callback
