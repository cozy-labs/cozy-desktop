async  = require 'async'
path   = require 'path'
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
        pouchHelpers.createParentFolder @pouch, =>
            async.eachSeries [1..3], (i, callback) =>
                pouchHelpers.createFolder @pouch, i, =>
                    pouchHelpers.createFile @pouch, i, callback
            , done


    describe 'ODM', ->

        describe 'getAll', ->
            it 'returns all the documents matching the query', (done) ->
                params =
                    key: 'my-folder'
                    include_docs: true
                @pouch.getAll 'byPath', params, (err, docs) ->
                    should.not.exist err
                    docs.length.should.equal 6
                    for i in [1..3]
                        docs[i-1].should.have.properties
                            _id: path.join 'my-folder', "file-#{i}"
                            docType: 'file'
                            tags: []
                        docs[i+2].should.have.properties
                            _id: path.join 'my-folder', "folder-#{i}"
                            docType: 'folder'
                            tags: []
                    done()

        describe 'byChecksum', ->
            it 'gets all the files with this checksum', (done) ->
                _id = path.join 'my-folder', 'file-1'
                checksum = '1111111111111111111111111111111111111111'
                @pouch.byChecksum checksum, (err, docs) ->
                    should.not.exist err
                    docs.length.should.be.equal 1
                    docs[0]._id.should.equal _id
                    docs[0].checksum.should.equal checksum
                    done()

        describe 'byPath', ->
            it 'gets all the files and folders in this path', (done) ->
                @pouch.byPath 'my-folder', (err, docs) ->
                    should.not.exist err
                    docs.length.should.be.equal 6
                    for i in [1..3]
                        docs[i-1].should.have.properties
                            _id: path.join 'my-folder', "file-#{i}"
                            docType: 'file'
                            tags: []
                        docs[i+2].should.have.properties
                            _id: path.join 'my-folder', "folder-#{i}"
                            docType: 'folder'
                            tags: []
                    done()

            it 'gets only files and folders in the first level', (done) ->
                @pouch.byPath '', (err, docs) ->
                    should.not.exist err
                    docs.length.should.be.equal 1
                    docs[0].should.have.properties
                        _id: 'my-folder'
                        docType: 'folder'
                        tags: []
                    done()

            it 'rejects design documents', (done) ->
                @pouch.byPath '_design', (err, docs) ->
                    should.not.exist err
                    docs.length.should.be.equal 0
                    done()

        describe 'byRecurivePath', ->
            it 'gets the files and folders in this path recursively', (done) ->
                @pouch.byRecursivePath 'my-folder', (err, docs) ->
                    should.not.exist err
                    docs.length.should.be.equal 6
                    for i in [1..3]
                        docs[i-1].should.have.properties
                            _id: path.join 'my-folder', "file-#{i}"
                            docType: 'file'
                            tags: []
                        docs[i+2].should.have.properties
                            _id: path.join 'my-folder', "folder-#{i}"
                            docType: 'folder'
                            tags: []
                    done()

            it 'gets the files and folders from root', (done) ->
                @pouch.byRecursivePath '', (err, docs) ->
                    should.not.exist err
                    docs.length.should.be.equal 7
                    docs[0].should.have.properties
                        _id: 'my-folder'
                        docType: 'folder'
                        tags: []
                    for i in [1..3]
                        docs[i].should.have.properties
                            _id: path.join 'my-folder', "file-#{i}"
                            docType: 'file'
                            tags: []
                        docs[i+3].should.have.properties
                            _id: path.join 'my-folder', "folder-#{i}"
                            docType: 'folder'
                            tags: []
                    done()

        describe 'byRemoteId', ->
            it 'gets all the file with this remote id', (done) ->
                id = '12345678901'
                @pouch.byRemoteId id, (err, doc) ->
                    should.not.exist err
                    doc.remote._id.should.equal id
                    should.exist doc._id
                    should.exist doc.docType
                    done()

            it 'returns a 404 error if no file matches', (done) ->
                id = 'abcdef'
                @pouch.byRemoteId id, (err, doc) ->
                    should.exist err
                    err.status.should.equal 404
                    done()


    describe 'Views', ->

        describe 'createDesignDoc', ->
            it "creates a new design doc", (done) ->
                query = """
                    function (doc) {
                        if (doc.docType === 'file') {
                            emit(doc._id);
                        }
                    }
                    """
                @pouch.createDesignDoc 'file', query, (err) =>
                    should.not.exist err
                    @pouch.getAll 'file', (err, docs) ->
                        should.not.exist err
                        docs.length.should.equal 3
                        for i in [1..3]
                            docs[i-1].docType.should.equal 'file'
                        done()

        describe 'addByPathView', ->
            it 'creates the path view', (done) ->
                @pouch.addByPathView (err) =>
                    should.not.exist err
                    @pouch.db.get '_design/byPath', (err, doc) ->
                        should.not.exist err
                        should.exist doc
                        done()

        describe 'addByChecksumView', ->
            it 'creates the checksum view', (done) ->
                @pouch.addByChecksumView (err) =>
                    should.not.exist err
                    @pouch.db.get '_design/byChecksum', (err, doc) ->
                        should.not.exist err
                        should.exist doc
                        done()

        describe 'addByRemoteIdView', ->
            it 'creates the remote id view', (done) ->
                @pouch.addByRemoteIdView (err) =>
                    should.not.exist err
                    @pouch.db.get '_design/byRemoteId', (err, doc) ->
                        should.not.exist err
                        should.exist doc
                        done()

        describe 'removeDesignDoc', ->
            it 'removes given view', (done) ->
                query = """
                    function (doc) {
                        if (doc.docType === 'folder') {
                            emit(doc._id);
                        }
                    }
                    """
                @pouch.createDesignDoc 'folder', query, (err) =>
                    should.not.exist err
                    @pouch.getAll 'folder', (err, docs) =>
                        should.not.exist err
                        docs.length.should.be.above 1
                        @pouch.removeDesignDoc 'folder', (err) =>
                            should.not.exist err
                            @pouch.getAll 'folder', (err, res) ->
                                should.exist err
                                done()


    describe 'Helpers', ->

        describe 'getPreviousRev', ->
            it "retrieves previous document's information", (done) ->
                id = path.join 'my-folder', 'folder-1'
                @pouch.db.get id, (err, doc) =>
                    should.not.exist err
                    @pouch.db.remove id, doc._rev, (err) =>
                        should.not.exist err
                        @pouch.getPreviousRev id, (err, doc) ->
                            should.not.exist err
                            doc._id.should.equal id
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
