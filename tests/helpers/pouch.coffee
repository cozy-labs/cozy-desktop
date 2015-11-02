path = require 'path'

Pouch = require '../../backend/pouch'


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
            docType: 'folder'
            creationDate: new Date()
            lastModification: new Date()
            tags: []
        pouch.db.put doc, callback

    createFolder: (pouch, i, callback) ->
        doc =
            _id: path.join 'my-folder', "folder-#{i}"
            docType: 'folder'
            creationDate: new Date()
            lastModification: new Date()
            tags: []
            remote:
                _id: "123456789#{i}"
        pouch.db.put doc, callback

    createFile: (pouch, i, callback) ->
        doc =
            _id: path.join 'my-folder', "file-#{i}"
            docType: 'file'
            checksum: "111111111111111111111111111111111111111#{i}"
            creationDate: new Date()
            lastModification: new Date()
            tags: []
            remote:
                _id: "1234567890#{i}"
        pouch.db.put doc, callback
