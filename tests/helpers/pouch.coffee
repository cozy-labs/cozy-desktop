Pouch = require '../../backend/pouch'


module.exports =
    createDatabase: (done) ->
        @pouch = new Pouch @config
        @pouch.addAllFilters done

    cleanDatabase: (done) ->
        @pouch.db.destroy =>
            @pouch = null
            done()

    createBinary: (pouch, i, callback) ->
        doc =
            _id: "binary-#{i}"
            docType: 'Binary'
            path: '/full/path'
            checksum: "123#{i}"
        pouch.db.put doc, callback

    createFile: (pouch, i, callback) ->
        doc =
            _id: "file-#{i}"
            docType: 'File'
            path: 'myfolder'
            name: "filename-#{i}"
            tags: []
            binary:
                file:
                    id: "binary-#{i}"
        pouch.db.put doc, callback

    createFolder: (pouch, i, callback) ->
        doc =
            _id: "folder-#{i}"
            docType: 'Folder'
            path: 'myfolder'
            name: "folder-#{i}"
            tags: []
        pouch.db.put doc, callback
