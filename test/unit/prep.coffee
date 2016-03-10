clone  = require 'lodash.clone'
sinon  = require 'sinon'
should = require 'should'

Prep = require '../../src/prep'


describe 'Prep', ->

    beforeEach 'instanciate prep', ->
        @side  = 'local'
        @merge = {}
        @prep  = new Prep @merge


    describe 'Helpers', ->

        describe 'buildId', ->
            it 'is available', ->
                doc = path: 'FOO'
                @prep.buildId doc
                doc._id.should.equal 'FOO'

            if process.platform in ['linux', 'freebsd', 'sunos']
                it 'is case insensitive on UNIX', ->
                    doc = path: 'foo/bar/café'
                    @prep.buildId doc
                    doc._id.should.equal 'foo/bar/café'

            if process.platform is 'darwin'
                it 'is case sensitive on OSX', ->
                    doc = path: 'foo/bar/café'
                    @prep.buildId doc
                    doc._id.should.equal 'FOO/BAR/CAFÉ'

        describe 'invalidPath', ->
            it 'returns true if the path is incorrect', ->
                ret = @prep.invalidPath path: '/'
                ret.should.be.true()
                ret = @prep.invalidPath path: ''
                ret.should.be.true()
                ret = @prep.invalidPath path: '.'
                ret.should.be.true()
                ret = @prep.invalidPath path: '..'
                ret.should.be.true()
                ret = @prep.invalidPath path: '../foo/bar.png'
                ret.should.be.true()
                ret = @prep.invalidPath path: 'foo/..'
                ret.should.be.true()
                ret = @prep.invalidPath path: 'f/../oo/../../bar/./baz'
                ret.should.be.true()

            it 'returns false if everything is OK', ->
                ret = @prep.invalidPath path: 'foo'
                ret.should.be.false()
                ret = @prep.invalidPath path: 'foo/bar'
                ret.should.be.false()
                ret = @prep.invalidPath path: 'foo/bar/baz.jpg'
                ret.should.be.false()

            it 'returns false for paths with a leading slash', ->
                ret = @prep.invalidPath path: '/foo/bar'
                ret.should.be.false()
                ret = @prep.invalidPath path: '/foo/bar/baz.bmp'
                ret.should.be.false()

        describe 'invalidChecksum', ->
            it 'returns false if the checksum is missing', ->
                ret = @prep.invalidChecksum {}
                ret.should.be.false()
                ret = @prep.invalidChecksum checksum: null
                ret.should.be.false()
                ret = @prep.invalidChecksum checksum: undefined
                ret.should.be.false()

            it 'returns true if the checksum is incorrect', ->
                ret = @prep.invalidChecksum checksum: ''
                ret.should.be.true()
                ret = @prep.invalidChecksum checksum: 'f00'
                ret.should.be.true()
                md5 = '68b329da9893e34099c7d8ad5cb9c940'
                ret = @prep.invalidChecksum checksum: md5
                ret.should.be.true()

            it 'returns false if the checksum is OK', ->
                doc = checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                ret = @prep.invalidChecksum doc
                ret.should.be.false()
                doc = checksum: 'ADC83B19E793491B1C6EA0FD8B46CD9F32E592FC'
                ret = @prep.invalidChecksum doc
                ret.should.be.false()

        describe 'moveDoc', ->
            it 'calls moveFile for a file', (done) ->
                doc =
                    path: 'move/name'
                    docType: 'file'
                was =
                    path: 'move/old-name'
                    docType: 'file'
                @prep.moveFile = sinon.stub().yields null
                @prep.moveDoc @side, doc, was, (err) =>
                    should.not.exist err
                    @prep.moveFile.calledWith(@side, doc, was).should.be.true()
                    done()

            it 'calls moveFolder for a folder', (done) ->
                doc =
                    path: 'move/folder'
                    docType: 'folder'
                was =
                    path: 'move/old-folder'
                    docType: 'folder'
                spy = @prep.moveFolder = sinon.stub().yields null
                @prep.moveDoc @side, doc, was, (err) =>
                    should.not.exist err
                    spy.calledWith(@side, doc, was).should.be.true()
                    done()

            it 'throws an error if we move a file to a folder', (done) ->
                doc =
                    path: 'move/folder'
                    docType: 'folder'
                was =
                    path: 'move/old-file'
                    docType: 'file'
                @prep.moveDoc @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Incompatible docTypes: folder'
                    done()

            it 'throws an error if we move a folder to a file', (done) ->
                doc =
                    path: 'move/file'
                    docType: 'file'
                was =
                    path: 'move/old-folder'
                    docType: 'folder'
                @prep.moveDoc @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Incompatible docTypes: file'
                    done()

        describe 'deleteDoc', ->
            it 'calls deleteFile for a file', (done) ->
                doc =
                    path: 'delete/name'
                    docType: 'file'
                @prep.deleteFile = sinon.stub().yields null
                @prep.deleteDoc @side, doc, (err) =>
                    should.not.exist err
                    @prep.deleteFile.calledWith(@side, doc).should.be.true()
                    done()

            it 'calls deleteFolder for a folder', (done) ->
                doc =
                    path: 'delete/folder'
                    docType: 'folder'
                @prep.deleteFolder = sinon.stub().yields null
                @prep.deleteDoc @side, doc, (err) =>
                    should.not.exist err
                    @prep.deleteFolder.calledWith(@side, doc).should.be.true()
                    done()


    describe 'Put', ->

        describe 'addFile', ->
            it 'expects a doc with a valid path', (done) ->
                @prep.addFile @side, path: '/', (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid path'
                    done()

            it 'accepts doc with no checksum', (done) ->
                @merge.addFile = sinon.stub().yields null
                doc =
                    path: 'no-checksum'
                    docType: 'file'
                @prep.addFile @side, doc, (err) =>
                    should.not.exist err
                    @merge.addFile.calledWith(@side, doc).should.be.true()
                    done()

            it 'rejects doc with an invalid checksum', (done) ->
                doc =
                    path: 'no-checksum'
                    checksum: 'foobar'
                @prep.addFile @side, doc, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid checksum'
                    done()

            it 'calls Merge with the correct fields', (done) ->
                @merge.addFile = sinon.stub().yields null
                doc =
                    path: 'foo/missing-fields'
                    checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                @prep.addFile @side, doc, (err) =>
                    should.not.exist err
                    @merge.addFile.calledWith(@side, doc).should.be.true()
                    doc.docType.should.equal 'file'
                    should.exist doc._id
                    should.exist doc.creationDate
                    should.exist doc.lastModification
                    done()


        describe 'updateFile', ->
            it 'expects a doc with a valid path', (done) ->
                @prep.updateFile @side, path: '/', (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid path'
                    done()

            it 'accepts doc with no checksum', (done) ->
                @merge.updateFile = sinon.stub().yields null
                doc =
                    path: 'no-checksum'
                    docType: 'file'
                @prep.updateFile @side, doc, (err) =>
                    should.not.exist err
                    @merge.updateFile.calledWith(@side, doc).should.be.true()
                    done()

            it 'rejects doc with an invalid checksum', (done) ->
                doc =
                    path: 'no-checksum'
                    checksum: 'foobar'
                @prep.updateFile @side, doc, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid checksum'
                    done()

            it 'calls Merge with the correct fields', (done) ->
                @merge.updateFile = sinon.stub().yields null
                doc =
                    path: 'foobar/missing-fields'
                    checksum: 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc'
                @prep.updateFile @side, doc, (err) =>
                    should.not.exist err
                    @merge.updateFile.calledWith(@side, doc).should.be.true()
                    doc.docType.should.equal 'file'
                    should.exist doc._id
                    should.exist doc.lastModification
                    done()


        describe 'putFolder', ->
            it 'expects a doc with a valid path', (done) ->
                @prep.putFolder @side, path: '..', (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid path'
                    done()

            it 'calls Merge with the correct fields', (done) ->
                @merge.putFolder = sinon.stub().yields null
                doc = path: 'foo/folder-missing-fields'
                @prep.putFolder @side, doc, (err) =>
                    should.not.exist err
                    @merge.putFolder.calledWith(@side, doc).should.be.true()
                    doc.docType.should.equal 'folder'
                    should.exist doc._id
                    should.exist doc.lastModification
                    done()


    describe 'Move', ->

        describe 'moveFile', ->
            it 'expects a doc with a valid path', (done) ->
                doc = path: ''
                was = path: 'foo/baz'
                @prep.moveFile @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid path'
                    done()

            it 'expects a was with a valid path', (done) ->
                doc = path: 'foo/bar'
                was = path: ''
                @prep.moveFile @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid path'
                    done()

            it 'expects a doc with a valid checksum', (done) ->
                doc =
                    path: 'foo/bar'
                    docType: 'file'
                    checksum: 'invalid'
                was = path: 'foo/baz'
                @prep.moveFile @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid checksum'
                    done()

            it 'expects two different paths', (done) ->
                doc =
                    path: 'foo/bar'
                    docType: 'file'
                    checksum: '5555555555555555555555555555555555555555'
                was =
                    path: 'foo/bar'
                    docType: 'file'
                    checksum: '5555555555555555555555555555555555555555'
                @prep.moveFile @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid move'
                    done()

            it 'expects a revision for was', (done) ->
                doc =
                    path: 'foo/bar'
                    docType: 'file'
                    checksum: '5555555555555555555555555555555555555555'
                was =
                    path: 'foo/baz'
                    docType: 'file'
                    checksum: '5555555555555555555555555555555555555555'
                @prep.moveFile @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Missing rev'
                    done()

            it 'calls Merge with the correct fields', (done) ->
                @merge.moveFile = sinon.stub().yields null
                doc =
                    path: 'FOO/new-missing-fields.jpg'
                    checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                was =
                    _id: 'FOO/OLD-MISSING-FIELDS.JPG'
                    _rev: '456'
                    path: 'FOO/OLD-MISSING-FIELDS.JPG'
                    checksum: 'ba1368789cce95b574dec70dfd476e61cbf00517'
                    docType: 'file'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                    size: 5426
                    class: 'image'
                    mime: 'image/jpeg'
                @prep.moveFile @side, doc, was, (err) =>
                    should.not.exist err
                    @merge.moveFile.calledWith(@side, doc, was).should.be.true()
                    doc.docType.should.equal 'file'
                    should.exist doc._id
                    should.exist doc.lastModification
                    done()


        describe 'moveFolder', ->
            it 'expects a doc with a valid path', (done) ->
                doc = path: ''
                was = path: 'foo/baz'
                @prep.moveFolder @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid path'
                    done()

            it 'expects a was with a valid id', (done) ->
                doc = path: 'foo/bar'
                was = path: ''
                @prep.moveFolder @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid path'
                    done()

            it 'expects two different paths', (done) ->
                doc =
                    path: 'foo/bar'
                    docType: 'folder'
                was =
                    path: 'foo/bar'
                    docType: 'folder'
                @prep.moveFolder @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid move'
                    done()

            it 'expects a revision for was', (done) ->
                doc =
                    path: 'foo/bar'
                    docType: 'folder'
                was =
                    path: 'foo/baz'
                    docType: 'folder'
                @prep.moveFolder @side, doc, was, (err) ->
                    should.exist err
                    err.message.should.equal 'Missing rev'
                    done()

            it 'calls Merge with the correct fields', (done) ->
                spy = @merge.moveFolder = sinon.stub().yields null
                doc =
                    path: 'FOOBAR/new-missing-fields'
                was =
                    _id: 'FOOBAR/OLD-MISSING-FIELDS'
                    _rev: '456'
                    path: 'FOOBAR/OLD-MISSING-FIELDS'
                    docType: 'folder'
                    creationDate: new Date
                    lastModification: new Date
                    tags: ['courge', 'quux']
                @prep.moveFolder @side, doc, was, (err) =>
                    should.not.exist err
                    spy.calledWith(@side, doc, was).should.be.true()
                    doc.docType.should.equal 'folder'
                    should.exist doc._id
                    should.exist doc.lastModification
                    done()


    describe 'Delete', ->

        describe 'deleteFile', ->
            it 'expects a doc with a valid path', (done) ->
                @prep.deleteFile @side, path: '/', (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid path'
                    done()

            it 'calls Merge with the correct fields', (done) ->
                @merge.deleteFile = sinon.stub().yields null
                doc = path: 'kill/file'
                @prep.deleteFile @side, doc, (err) =>
                    should.not.exist err
                    @merge.deleteFile.calledWith(@side, doc).should.be.true()
                    doc.docType.should.equal 'file'
                    should.exist doc._id
                    done()

        describe 'deleteFolder', ->
            it 'expects a doc with a valid path', (done) ->
                @prep.deleteFolder @side, path: '/', (err) ->
                    should.exist err
                    err.message.should.equal 'Invalid path'
                    done()

            it 'calls Merge with the correct fields', (done) ->
                @merge.deleteFolder = sinon.stub().yields null
                doc = path: 'kill/folder'
                @prep.deleteFolder @side, doc, (err) =>
                    should.not.exist err
                    @merge.deleteFolder.calledWith(@side, doc).should.be.true()
                    doc.docType.should.equal 'folder'
                    should.exist doc._id
                    done()
