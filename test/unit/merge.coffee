async  = require 'async'
clone  = require 'lodash.clone'
sinon  = require 'sinon'
should = require 'should'

Merge = require '../../src/merge'

configHelpers = require '../helpers/config'
pouchHelpers  = require '../helpers/pouch'


describe 'Merge', ->

    before 'instanciate config', configHelpers.createConfig
    before 'instanciate pouch', pouchHelpers.createDatabase
    beforeEach 'instanciate merge', ->
        @side  = 'local'
        @merge = new Merge @pouch
    after 'clean pouch', pouchHelpers.cleanDatabase
    after 'clean config directory', configHelpers.cleanConfig


    describe 'addFile', ->
        it 'saves the new file', (done) ->
            @merge.ensureParentExist = sinon.stub().yields null
            doc =
                _id: 'foo/new-file'
                path: 'foo/new-file'
                checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                docType: 'file'
                creationDate: new Date
                lastModification: new Date
                tags: ['courge', 'quux']
            @merge.addFile @side, doc, (err) =>
                should.not.exist err
                @pouch.db.get doc._id, (err, res) ->
                    should.not.exist err
                    for date in ['creationDate', 'lastModification']
                        doc[date] = doc[date].toISOString()
                    res.should.have.properties doc
                    res.sides.local.should.equal 1
                    done()

        describe 'when a file with the same path exists', ->
            before 'create a file', (done) ->
                @file =
                    _id: 'BUZZ.JPG'
                    path: 'BUZZ.JPG'
                    docType: 'file'
                    checksum: '1111111111111111111111111111111111111111'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['foo']
                    size: 12345
                    class: 'image'
                    mime: 'image/jpeg'
                @pouch.db.put @file, done

            it 'can update the metadata', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                was = clone @file
                @file.tags = ['bar', 'baz']
                @file.lastModification = new Date
                doc = clone @file
                delete doc.size
                delete doc.class
                delete doc.mime
                @file.creationDate = doc.creationDate.toISOString()
                @file.lastModification = doc.lastModification.toISOString()
                @merge.addFile @side, doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) =>
                        should.not.exist err
                        res.should.have.properties @file
                        res.size.should.equal was.size
                        res.class.should.equal was.class
                        res.mime.should.equal was.mime
                        res.sides.local.should.equal 2
                        done()


    describe 'updateFile', ->
        it 'saves the new file', (done) ->
            @merge.ensureParentExist = sinon.stub().yields null
            doc =
                _id: 'FOOBAR/NEW-FILE'
                path: 'FOOBAR/NEW-FILE'
                checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                docType: 'file'
                creationDate: new Date
                lastModification: new Date
                tags: ['courge', 'quux']
            @merge.updateFile @side, doc, (err) =>
                should.not.exist err
                @pouch.db.get doc._id, (err, res) ->
                    should.not.exist err
                    for date in ['creationDate', 'lastModification']
                        doc[date] = doc[date].toISOString()
                    res.should.have.properties doc
                    res.sides.local.should.equal 1
                    done()

        describe 'when a file with the same path exists', ->
            before 'create a file', (done) ->
                @file =
                    _id: 'FIZZBUZZ.JPG'
                    path: 'FIZZBUZZ.JPG'
                    docType: 'file'
                    checksum: '1111111111111111111111111111111111111111'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['foo']
                    size: 12345
                    class: 'image'
                    mime: 'image/jpeg'
                @pouch.db.put @file, done

            it 'can update the metadata', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                was = clone @file
                @file.tags = ['bar', 'baz']
                @file.lastModification = new Date
                doc = clone @file
                delete doc.size
                delete doc.class
                delete doc.mime
                @file.creationDate = doc.creationDate.toISOString()
                @file.lastModification = doc.lastModification.toISOString()
                @merge.updateFile @side, doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) =>
                        should.not.exist err
                        res.should.have.properties @file
                        res.size.should.equal was.size
                        res.class.should.equal was.class
                        res.mime.should.equal was.mime
                        res.sides.local.should.equal 2
                        done()

            it 'can overwrite the content of a file', (done) ->
                @merge.ensureParentExist = sinon.stub().yields null
                doc =
                    _id: 'FIZZBUZZ.JPG'
                    path: 'FIZZBUZZ.JPG'
                    docType: 'file'
                    checksum: '3333333333333333333333333333333333333333'
                    tags: ['qux', 'quux']
                @merge.updateFile @side, clone(doc), (err) =>
                    should.not.exist err
                    @pouch.db.get @file._id, (err, res) ->
                        should.not.exist err
                        res.should.have.properties doc
                        should.not.exist res.size
                        should.not.exist res.class
                        should.not.exist res.mime
                        res.sides.local.should.equal 3
                        done()


    describe 'putFolder', ->
        it 'saves the new folder', (done) ->
            @merge.ensureParentExist = sinon.stub().yields null
            doc =
                _id: 'FOO/NEW-FOLDER'
                path: 'FOO/NEW-FOLDER'
                docType: 'folder'
                creationDate: new Date
                lastModification: new Date
                tags: ['courge', 'quux']
            @merge.putFolder @side, doc, (err) =>
                should.not.exist err
                doc.creationDate = doc.creationDate.toISOString()
                doc.lastModification = doc.lastModification.toISOString()
                @pouch.db.get doc._id, (err, res) ->
                    should.not.exist err
                    res.should.have.properties doc
                    res.sides.local.should.equal 1
                    done()


    describe 'moveFile', ->
        it 'saves the new file and deletes the old one', (done) ->
            @merge.ensureParentExist = sinon.stub().yields null
            doc =
                _id: 'FOO/NEW'
                path: 'FOO/NEW'
                checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                docType: 'file'
                creationDate: new Date
                lastModification: new Date
                tags: ['courge', 'quux']
            was =
                _id: 'FOO/OLD'
                path: 'FOO/OLD'
                checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                docType: 'file'
                creationDate: new Date
                lastModification: new Date
                tags: ['courge', 'quux']
                sides:
                    local: 1
                    remote: 1
            @pouch.db.put clone(was), (err, inserted) =>
                should.not.exist err
                was._rev = inserted.rev
                @merge.moveFile @side, clone(doc), clone(was), (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) =>
                        should.not.exist err
                        for date in ['creationDate', 'lastModification']
                            doc[date] = doc[date].toISOString()
                        res.should.have.properties doc
                        res.sides.local.should.equal 1
                        @pouch.db.get was._id, (err, res) ->
                            should.exist err
                            err.status.should.equal 404
                            done()

        it 'adds missing fields', (done) ->
            @merge.ensureParentExist = sinon.stub().yields null
            doc =
                _id: 'FOO/NEW-MISSING-FIELDS.JPG'
                path: 'FOO/NEW-MISSING-FIELDS.JPG'
                checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
            was =
                _id: 'FOO/OLD-MISSING-FIELDS.JPG'
                path: 'FOO/OLD-MISSING-FIELDS.JPG'
                checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                docType: 'file'
                creationDate: new Date
                lastModification: new Date
                tags: ['courge', 'quux']
                size: 5426
                class: 'image'
                mime: 'image/jpeg'
                sides:
                    local: 1
                    remote: 1
            @pouch.db.put clone(was), (err, inserted) =>
                should.not.exist err
                was._rev = inserted.rev
                @merge.moveFile @side, doc, clone(was), (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) ->
                        should.not.exist err
                        doc.creationDate = doc.creationDate.toISOString()
                        res.should.have.properties doc
                        should.exist res.creationDate
                        should.exist res.size
                        should.exist res.class
                        should.exist res.mime
                        done()

        it 'adds a hint for writers to know that it is a move', (done) ->
            @merge.ensureParentExist = sinon.stub().yields null
            doc =
                _id: 'FOO/NEW-HINT'
                path: 'FOO/NEW-HINT'
                checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                docType: 'file'
                creationDate: new Date
                lastModification: new Date
                tags: ['courge', 'quux']
            was =
                _id: 'FOO/OLD-HINT'
                path: 'FOO/OLD-HINT'
                checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                docType: 'file'
                creationDate: new Date
                lastModification: new Date
                tags: ['courge', 'quux']
                sides:
                    local: 1
                    remote: 1
            opts =
                include_docs: true
                live: true
                since: 'now'
            @pouch.db.put clone(was), (err, inserted) =>
                should.not.exist err
                was._rev = inserted.rev
                @pouch.db.changes(opts).on 'change', (info) ->
                    @cancel()
                    info.id.should.equal was._id
                    info.doc.moveTo.should.equal doc._id
                    done()
                @merge.moveFile @side, clone(doc), clone(was), (err) ->
                    should.not.exist err


    describe 'moveFolder', ->
        it 'saves the new folder and deletes the old one', (done) ->
            @merge.ensureParentExist = sinon.stub().yields null
            doc =
                _id: 'FOOBAR/NEW'
                path: 'FOOBAR/NEW'
                docType: 'folder'
                creationDate: new Date
                lastModification: new Date
                tags: ['courge', 'quux']
            was =
                _id: 'FOOBAR/OLD'
                path: 'FOOBAR/OLD'
                docType: 'folder'
                creationDate: new Date
                lastModification: new Date
                tags: ['courge', 'quux']
                sides:
                    local: 1
                    remote: 1
            @pouch.db.put clone(was), (err, inserted) =>
                should.not.exist err
                was._rev = inserted.rev
                @merge.moveFolder @side, clone(doc), clone(was), (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) =>
                        should.not.exist err
                        for date in ['creationDate', 'lastModification']
                            doc[date] = doc[date].toISOString()
                        res.should.have.properties doc
                        res.sides.local.should.equal 1
                        @pouch.db.get was._id, (err, res) ->
                            should.exist err
                            err.status.should.equal 404
                            done()

        it 'adds a hint for writers to know that it is a move', (done) ->
            @merge.ensureParentExist = sinon.stub().yields null
            doc =
                _id: 'FOOBAR/NEW-HINT'
                path: 'FOOBAR/NEW-HINT'
                docType: 'folder'
                creationDate: new Date
                lastModification: new Date
                tags: ['courge', 'quux']
            was =
                _id: 'FOOBAR/OLD-HINT'
                path: 'FOOBAR/OLD-HINT'
                docType: 'folder'
                creationDate: new Date
                lastModification: new Date
                tags: ['courge', 'quux']
                sides:
                    local: 1
                    remote: 1
            opts =
                include_docs: true
                live: true
                since: 'now'
            @pouch.db.put clone(was), (err, inserted) =>
                should.not.exist err
                was._rev = inserted.rev
                @pouch.db.changes(opts).on 'change', (info) ->
                    @cancel()
                    info.id.should.equal was._id
                    info.doc.moveTo.should.equal doc._id
                    done()
                @merge.moveFolder @side, clone(doc), clone(was), (err) ->
                    should.not.exist err


    describe 'moveFolderRecursively', ->
        before (done) ->
            pouchHelpers.createParentFolder @pouch, =>
                pouchHelpers.createFolder @pouch, 9, =>
                    pouchHelpers.createFile @pouch, 9, done

        it 'move the folder and files/folders inside it', (done) ->
            doc =
                _id: 'DESTINATION'
                path: 'DESTINATION'
                docType: 'folder'
                creationDate: new Date
                lastModification: new Date
                tags: []
            @pouch.db.get 'my-folder', (err, was) =>
                should.not.exist err
                @merge.moveFolderRecursively doc, was, (err) =>
                    should.not.exist err
                    ids = ['', '/folder-9', '/file-9']
                    async.eachSeries ids, (id, next) =>
                        @pouch.db.get "DESTINATION#{id}", (err, res) =>
                            should.not.exist err
                            should.exist res
                            @pouch.db.get "my-folder#{id}", (err, res) ->
                                err.status.should.equal 404
                                next()
                    , done


    describe 'deleteFile', ->
        it 'deletes a file', (done) ->
            doc =
                _id: 'TO-DELETE/FILE'
                path: 'TO-DELETE/FILE'
                docType: 'file'
                sides:
                    local: 1
            @pouch.db.put doc, (err) =>
                should.not.exist err
                @merge.deleteFile @side, doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err) ->
                        err.status.should.equal 404
                        done()

    describe 'deleteFolder', ->
        it 'deletes a folder', (done) ->
            doc =
                _id: 'TO-DELETE/FOLDER'
                path: 'TO-DELETE/FOLDER'
                docType: 'folder'
                sides:
                    local: 1
            @pouch.db.put doc, (err) =>
                should.not.exist err
                @merge.deleteFolder @side, doc, (err) =>
                    should.not.exist err
                    @pouch.db.get doc._id, (err, res) ->
                        err.status.should.equal 404
                        done()

        it 'remove files in the folder', (done) ->
            doc =
                _id: 'FOO/TO-REMOVE'
                path: 'FOO/TO-REMOVE'
                docType: 'folder'
                sides:
                    local: 1
            @pouch.db.put doc, (err) =>
                should.not.exist err
                async.eachSeries ['baz', 'qux', 'quux'], (name, next) =>
                    file =
                        _id: "FOO/TO-REMOVE/#{name}"
                        path: "FOO/TO-REMOVE/#{name}"
                        docType: 'file'
                    @pouch.db.put file, next
                , (err) =>
                    should.not.exist err
                    @merge.deleteFolder @side, doc, (err) =>
                        should.not.exist err
                        @pouch.byPath 'FOO/TO-REMOVE', (err, docs) ->
                            docs.length.should.be.equal 0
                            done()

        it 'remove nested folders', (done) ->
            base = 'NESTED/TO-DELETE'
            async.eachSeries ['', '/b', '/b/c', '/b/d'], (name, next) =>
                doc =
                    _id: "#{base}#{name}"
                    path: "#{base}#{name}"
                    docType: 'folder'
                    sides:
                        local: 1
                @pouch.db.put doc, next
            , (err) =>
                should.not.exist err
                @merge.deleteFolder @side, _id: base, path: base, (err) =>
                    should.not.exist err
                    @pouch.db.allDocs (err, res) ->
                        should.not.exist err
                        for row in res.rows
                            row.id.should.not.match /^NESTED/i
                        done()
