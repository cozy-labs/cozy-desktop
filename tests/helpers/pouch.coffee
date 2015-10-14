Pouch = require '../../backend/pouch'


module.exports =
    createDatabase: (done) ->
        @pouch = new Pouch @config
        @pouch.addAllViews done

    cleanDatabase: (done) ->
        @pouch.db.destroy =>
            @pouch = null
            done()

    createFile: (pouch, i, callback) ->
        doc =
            _id: "file-#{i}"
            docType: 'file'
            path: 'myfolder'
            name: "filename-#{i}"
            tags: []
            checksum: "98765432#{i}"
            binary:
                file:
                    id: "binary-#{i}"
        pouch.db.put doc, callback

    createFolder: (pouch, i, callback) ->
        doc =
            _id: "folder-#{i}"
            docType: 'folder'
            path: 'myfolder'
            name: "folder-#{i}"
            tags: []
        pouch.db.put doc, callback
