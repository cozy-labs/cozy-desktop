async  = require 'async'
clone  = require 'lodash.clone'
fs     = require 'fs-extra'
path   = require 'path'
sinon  = require 'sinon'
should = require 'should'

configHelpers = require '../../helpers/config'
couchHelpers  = require '../../helpers/couch'
pouchHelpers  = require '../../helpers/pouch'

Normalizer = require '../../../backend/normalizer'
Watcher    = require '../../../backend/remote/watcher'


describe "RemoteWatcher Tests", ->

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    before 'start couch server', couchHelpers.startServer
    before 'instanciate couch', couchHelpers.createCouchClient
    before 'instanciate remote watcher', ->
        @normalizer = {}
        @watcher    = new Watcher @couch, @normalizer, @pouch
    after 'stop couch server', couchHelpers.stopServer
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig

    before (done) ->
        pouchHelpers.createParentFolder @pouch, =>
            async.eachSeries [1..3], (i, callback) =>
                pouchHelpers.createFolder @pouch, i, =>
                    pouchHelpers.createFile @pouch, i, callback
            , done


    describe 'onChange', ->
        it 'calls putDoc for a new doc', (done) ->
            @normalizer.putDoc = sinon.stub().yields null
            doc =
                _id: '12345678905'
                _rev: '1-abcdef'
                docType: 'file'
                path: 'my-folder'
                name: 'file-5'
                checksum: '9999999999999999999999999999999999999999'
                tags: []
            @watcher.onChange clone(doc), (err) =>
                should.not.exist err
                @normalizer.putDoc.called.should.be.true()
                args = @normalizer.putDoc.args[0][0]
                args.should.have.properties
                    _id: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                args.should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls putDoc when tags are updated', (done) ->
            @normalizer.putDoc = sinon.stub().yields null
            doc =
                _id: '12345678901'
                _rev: '2-abcdef'
                docType: 'file'
                path: 'my-folder'
                name: 'file-1'
                checksum: '1111111111111111111111111111111111111111'
                tags: ['foo', 'bar', 'baz']
            @watcher.onChange clone(doc), (err) =>
                should.not.exist err
                @normalizer.putDoc.called.should.be.true()
                args = @normalizer.putDoc.args[0][0]
                args.should.have.properties
                    _id: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                args.should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls putDoc when content is overwritten', (done) ->
            @normalizer.putDoc = sinon.stub().yields null
            doc =
                _id: '12345678901'
                _rev: '3-abcdef'
                docType: 'file'
                path: 'my-folder'
                name: 'file-1'
                checksum: '9999999999999999999999999999999999999999'
                tags: ['foo', 'bar', 'baz']
            @watcher.onChange clone(doc), (err) =>
                should.not.exist err
                @normalizer.putDoc.called.should.be.true()
                args = @normalizer.putDoc.args[0][0]
                args.should.have.properties
                    _id: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                args.should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls moveDoc when file is renamed', (done) ->
            @normalizer.moveDoc = sinon.stub().yields null
            doc =
                _id: '12345678902'
                _rev: '4-abcdef'
                docType: 'file'
                path: 'my-folder'
                name: 'file-2-bis'
                checksum: '1111111111111111111111111111111111111112'
                tags: []
            @watcher.onChange clone(doc), (err) =>
                should.not.exist err
                @normalizer.moveDoc.called.should.be.true()
                src = @normalizer.moveDoc.args[0][1]
                src.should.have.properties
                    _id: 'my-folder/file-2'
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: '12345678902'
                dst = @normalizer.moveDoc.args[0][0]
                dst.should.have.properties
                    _id: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                dst.should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls moveDoc when file is moved', (done) ->
            @normalizer.moveDoc = sinon.stub().yields null
            doc =
                _id: '12345678902'
                _rev: '5-abcdef'
                docType: 'file'
                path: 'another-folder/in/some/place'
                name: 'file-2-ter'
                checksum: '1111111111111111111111111111111111111112'
                tags: []
            @watcher.onChange clone(doc), (err) =>
                should.not.exist err
                @normalizer.moveDoc.called.should.be.true()
                src = @normalizer.moveDoc.args[0][1]
                src.should.have.properties
                    _id: 'my-folder/file-2'
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: '12345678902'
                dst = @normalizer.moveDoc.args[0][0]
                dst.should.have.properties
                    _id: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                dst.should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls deletedDoc&putDoc when file has changed completely', (done) ->
            @normalizer.deleteDoc = sinon.stub().yields null
            @normalizer.putDoc = sinon.stub().yields null
            doc =
                _id: '12345678903'
                _rev: '6-abcdef'
                docType: 'file'
                path: 'another-folder/in/some/place'
                name: 'file-3-bis'
                checksum: '8888888888888888888888888888888888888888'
                tags: []
            @watcher.onChange clone(doc), (err) =>
                should.not.exist err
                @normalizer.deleteDoc.called.should.be.true()
                id = @normalizer.deleteDoc.args[0][0]._id
                id.should.equal 'my-folder/file-3'
                @normalizer.putDoc.called.should.be.true()
                args = @normalizer.putDoc.args[0][0]
                args.should.have.properties
                    _id: path.join doc.path, doc.name
                    docType: 'file'
                    checksum: doc.checksum
                    tags: doc.tags
                    remote:
                        _id: doc._id
                        _rev: doc._rev
                args.should.not.have.properties ['_rev', 'path', 'name']
                done()

        it 'calls deleteDoc for a deleted doc', (done) ->
            @normalizer.deleteDoc = sinon.stub().yields null
            doc =
                _id: '12345678901'
                _rev: '7-abcdef'
                _deleted: true
            @watcher.onChange doc, (err) =>
                should.not.exist err
                @normalizer.deleteDoc.called.should.be.true()
                id = @normalizer.deleteDoc.args[0][0]._id
                id.should.equal 'my-folder/file-1'
                done()


    return it 'TODO fix tests'

    describe "initial replication", ->
        fixturePath = path.join  __dirname, '..', 'fixtures', 'chat-mignon.jpg'
        remoteFolders = [
            {name: 'remotefolder-01', parent: ''}
            {name: 'remotesub-01', parent: '/remotefolder-01'}
        ]
        remoteFiles = [
            {name: 'remotefile-01', parent: ''}
            {name: 'remotefile-02', parent: '/remotefolder-01'}
            {name: 'remotefile-03', parent: '/remotefolder-01/remotesub-01'}
        ]

        # Create remote folders
        before (done) ->
            async.eachSeries remoteFolders, (folder, next) ->
                folderHelpers.createFolder folder.name, folder.parent, next
            , done

        # Create remote files
        before (done) ->
            uploadFile = (file, next) ->
                {name, parent} = file
                fileHelpers.uploadFile name, fixturePath, parent, next
            async.eachSeries remoteFiles, uploadFile, done

        it "syncs remote and local folders", (done) ->
            syncToCozy = true
            remoteWatcher.init syncToCozy, (err) ->
                should.not.exist err
                setTimeout done, 1000

        it "and all files are present remotely", (done) ->
            fileHelpers.getAll (err, files) ->
                should.not.exist err

                fileHash = {}
                files.forEach (file) ->
                    fileHash[path.join file.path, file.name] = true

                remoteFiles.forEach (file) ->
                    fileHash[path.join file.parent, file.name].should.be.ok()
                localFiles.forEach (file) ->
                    fileHash[path.join file.parent, file.name].should.be.ok()

                done()

        it "and all folders are present remotely", (done) ->
            folderHelpers.getAll (err, folders) ->
                should.not.exist err

                folderHash = {}
                folders.forEach (folder) ->
                    folderHash[path.join folder.path, folder.name] = true

                remoteFolders.forEach (folder) ->
                    folderPath = path.join folder.parent, folder.name
                    folderHash[folderPath].should.be.ok()
                localFolders.forEach (folder) ->
                    folderPath = path.join folder.parent, folder.name
                    folderHash[folderPath].should.be.ok()

                done()

        it "and all files are present locally", ->
            remoteFolders.forEach (folder) ->
                folderPath = path.join syncPath, folder.parent, folder.name
                fs.existsSync(folderPath).should.be.ok()
            localFolders.forEach (folder) ->
                folderPath = path.join syncPath, folder.parent, folder.name
                fs.existsSync(folderPath).should.be.ok()
            remoteFiles.forEach (file) ->
                filePath = path.join syncPath, file.parent, file.name
                fs.existsSync(filePath).should.be.ok()
            localFiles.forEach (file) ->
                filePath = path.join syncPath, file.parent, file.name
                fs.existsSync(filePath).should.be.ok()

        it "and all local files are correct", (done) ->
            fixtureSize = fs.statSync(fixturePath).size
            remoteFiles.forEach (file) ->
                filepath = path.join syncPath, file.parent, file.name
                fs.statSync(filepath).size.should.be.equal fixtureSize
            done()
