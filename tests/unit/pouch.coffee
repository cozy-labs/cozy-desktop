async  = require 'async'
should = require 'should'

Pouch  = require '../../backend/pouch'

configHelpers = require '../helpers/config'
pouchHelpers  = require '../helpers/pouch'


describe "Pouch", ->

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig

    before (done) ->
        async.eachSeries [1..3], (i, callback) =>
            pouchHelpers.createFile @pouch, i, =>
                pouchHelpers.createFolder @pouch, i, callback
        , done


    describe 'ODM', ->

        describe 'getByKey', ->
            it 'returns document corresponding to key for given view', (done) ->
                @pouch.getByKey 'file/byChecksum', '987654321', (err, doc) ->
                    should.not.exist err
                    should.exist doc
                    doc.checksum.should.equal '987654321'
                    doc.name.should.equal 'filename-1'
                    done()

        describe 'getAll', ->
            it 'returns all the documents matching the query', (done) ->
                @pouch.getAll 'file/all', (err, docs) ->
                    should.not.exist err
                    docs.length.should.equal 3
                    for i in [1..3]
                        docs[i-1].should.have.properties
                            docType: 'file'
                            path: 'myfolder'
                            name: "filename-#{i}"
                            tags: []
                    done()

        describe 'allFiles', ->
            it 'gets all the file documents', (done) ->
                @pouch.allFiles (err, docs) ->
                    should.not.exist err
                    docs.length.should.be.equal 3
                    for i in [1..3]
                        docs[i-1].should.have.properties
                            docType: 'file'
                            path: 'myfolder'
                            name: "filename-#{i}"
                            tags: []
                            binary:
                                file:
                                    id: "binary-#{i}"
                    done()

        describe 'getFile', ->
            it 'gets a file document by its fullpath', (done) ->
                doc =
                    _id: 'file-4'
                    docType: 'file'
                    path: ''
                    name: 'filename-4'
                @pouch.db.put doc, (err) =>
                    should.not.exist err
                    @pouch.getFile 'filename-4', (err, res) ->
                        should.not.exist err
                        res.should.have.properties doc
                        done()

            it 'gets a file document by its fullpath', (done) ->
                @pouch.getFile 'myfolder/filename-1', (err, res) ->
                    should.not.exist err
                    res.should.have.properties
                        docType: 'file'
                        path: 'myfolder'
                        name: "filename-1"
                        tags: []
                        binary:
                            file:
                                id: "binary-1"
                    done()

        describe 'byChecksum', ->
            it 'gets all the files with this checksum', (done) ->
                @pouch.byChecksum '987654321', (err, docs) ->
                    should.not.exist err
                    docs.length.should.be.equal 1
                    docs[0].checksum.should.equal '987654321'
                    docs[0].name.should.equal 'filename-1'
                    done()

        describe 'allFolders', ->
            it 'gets all the folder documents', (done) ->
                @pouch.allFolders (err, docs) ->
                    should.not.exist err
                    docs.length.should.be.equal 3
                    for i in [1..3]
                        docs[i-1].should.have.properties
                            docType: 'folder'
                            path: 'myfolder'
                            name: "folder-#{i}"
                            tags: []
                    done()

        describe 'getFolder', ->
            it 'gets a folder document by its fullpath', ->
                @pouch.getFolder 'myfolder/folder-1', (err, res) ->
                    should.not.exist err
                    res.should.have.properties
                        docType: 'folder'
                        path: 'myfolder'
                        name: "folder-1"
                        tags: []
                    done()

        describe 'byPath', ->
            it 'gets all the files and folders in this path', (done) ->
                @pouch.byPath 'myfolder', (err, docs) ->
                    should.not.exist err
                    docs.length.should.be.equal 6
                    for i in [1..3]
                        docs[i-1].should.have.properties
                            docType: 'file'
                            path: 'myfolder'
                            name: "filename-#{i}"
                            tags: []
                        docs[i+2].should.have.properties
                            docType: 'folder'
                            path: 'myfolder'
                            name: "folder-#{i}"
                            tags: []
                    done()


    describe 'Views', ->

        describe 'removeDesignDoc', ->
            it 'removes given view', (done) ->
                @pouch.allFolders (err, res) =>
                    should.not.exist err
                    @pouch.removeDesignDoc "folder", (err) =>
                        should.not.exist err
                        @pouch.allFolders (err, res) ->
                            should.exist err
                            done()

        describe 'createDesignDoc', ->
            it "creates a new design doc", (done) ->
                id = "_design/folder"
                queries =
                    all: """
                function (doc) {
                    if (doc.docType !== undefined
                        && doc.docType.toLowerCase() === "folder") {
                        emit(doc._id, doc);
                    }
                }
                """
                @pouch.removeDesignDoc "folder", (err) =>
                    @pouch.createDesignDoc id, queries, =>
                        @pouch.allFolders (err, docs) ->
                            should.not.exist err
                            docs.length.should.be.equal 3
                            done()

        describe 'addViews', ->
            it "creates all views", (done) ->
                @pouch.removeDesignDoc "folder", (err) =>
                    @pouch.addViews "folder", (err) =>
                        should.not.exist err
                        @pouch.allFolders (err, res) =>
                            should.not.exist err
                            @pouch.allFiles (err, res) =>
                                should.not.exist err
                                @pouch.byPath 'myfolder', (err, res) ->
                                    should.not.exist err
                                    done()


    describe 'Helpers', ->

        describe 'getPreviousRev', ->
            it "retrieves previous document's information", (done) ->
                @pouch.db.get 'folder-1', (err, doc) =>
                    should.not.exist err
                    @pouch.db.remove 'folder-1', doc._rev, (err) =>
                        should.not.exist err
                        @pouch.getPreviousRev 'folder-1', (err, doc) ->
                            should.not.exist err
                            doc.should.have.properties
                                path: 'myfolder'
                                name: 'folder-1'
                                tags: []
                            done()

        describe 'getKnownPath', ->
            it 'retrieves the "last known" full path of a file', (done) ->
                @pouch.db.get 'file-1', (err, doc) =>
                    should.not.exist err
                    @pouch.db.remove 'file-1', doc._rev, (err) =>
                        should.not.exist err
                        @pouch.getKnownPath doc, (err, path) ->
                            should.not.exist err
                            path.should.be.equal 'myfolder/filename-1'
                            done()


    describe 'Sequence numbers', ->
        describe 'getLocalSeq', ->
            it 'gets 0 when the local seq number is not initialized', (done) ->
                @pouch.getLocalSeq (err, seq) ->
                    should.not.exist err
                    seq.should.equal 0
                    done()

        describe 'setLocalSeq', ->
            it 'saves the local sequence number', (done) ->
                @pouch.setLocalSeq 21, (err) =>
                    should.not.exist err
                    @pouch.getLocalSeq (err, seq) =>
                        should.not.exist err
                        seq.should.equal 21
                        @pouch.setLocalSeq 22, (err) =>
                            should.not.exist err
                            @pouch.getLocalSeq (err, seq) ->
                                should.not.exist err
                                seq.should.equal 22
                                done()


        describe 'getRemoteSeq', ->
            it 'gets 0 when the remote seq number is not initialized', (done) ->
                @pouch.getRemoteSeq (err, seq) ->
                    should.not.exist err
                    seq.should.equal 0
                    done()

        describe 'setRemoteSeq', ->
            it 'saves the remote sequence number', (done) ->
                @pouch.setRemoteSeq 31, (err) =>
                    should.not.exist err
                    @pouch.getRemoteSeq (err, seq) =>
                        should.not.exist err
                        seq.should.equal 31
                        @pouch.setRemoteSeq 32, (err) =>
                            should.not.exist err
                            @pouch.getRemoteSeq (err, seq) ->
                                should.not.exist err
                                seq.should.equal 32
                                done()

            it 'can be called multiple times in parallel', (done) ->
                async.each [1..100], @pouch.setRemoteSeq, (err) ->
                    should.not.exist err
                    done()
