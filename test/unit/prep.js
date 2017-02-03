/* eslint-env mocha */

import sinon from 'sinon'
import should from 'should'

import Ignore from '../../src/ignore'
import Prep from '../../src/prep'

describe('Prep', function () {
  beforeEach('instanciate prep', function () {
    this.side = 'local'
    this.merge = {}
    this.ignore = new Ignore(['ignored'])
    this.prep = new Prep(this.merge, this.ignore)
  })

  describe('Helpers', function () {
    describe('buildId', function () {
      it('is available', function () {
        let doc = {path: 'FOO'}
        this.prep.buildId(doc)
        doc._id.should.equal('FOO')
      })

      if (['linux', 'freebsd', 'sunos'].includes(process.platform)) {
        it('is case insensitive on UNIX', function () {
          let doc = {path: 'foo/bar/café'}
          this.prep.buildId(doc)
          doc._id.should.equal('foo/bar/café')
        })
      }

      if (process.platform === 'darwin') {
        it('is case sensitive on OSX', function () {
          let doc = {path: 'foo/bar/café'}
          this.prep.buildId(doc)
          doc._id.should.equal('FOO/BAR/CAFÉ')
        })
      }
    })

    describe('invalidPath', function () {
      it('returns true if the path is incorrect', function () {
        let ret = this.prep.invalidPath({path: '/'})
        ret.should.be.true()
        ret = this.prep.invalidPath({path: ''})
        ret.should.be.true()
        ret = this.prep.invalidPath({path: '.'})
        ret.should.be.true()
        ret = this.prep.invalidPath({path: '..'})
        ret.should.be.true()
        ret = this.prep.invalidPath({path: '../foo/bar.png'})
        ret.should.be.true()
        ret = this.prep.invalidPath({path: 'foo/..'})
        ret.should.be.true()
        ret = this.prep.invalidPath({path: 'f/../oo/../../bar/./baz'})
        ret.should.be.true()
      })

      it('returns false if everything is OK', function () {
        let ret = this.prep.invalidPath({path: 'foo'})
        ret.should.be.false()
        ret = this.prep.invalidPath({path: 'foo/bar'})
        ret.should.be.false()
        ret = this.prep.invalidPath({path: 'foo/bar/baz.jpg'})
        ret.should.be.false()
      })

      it('returns false for paths with a leading slash', function () {
        let ret = this.prep.invalidPath({path: '/foo/bar'})
        ret.should.be.false()
        ret = this.prep.invalidPath({path: '/foo/bar/baz.bmp'})
        ret.should.be.false()
      })
    })

    describe('invalidChecksum', function () {
      it('returns false if the checksum is missing', function () {
        let ret = this.prep.invalidChecksum({})
        ret.should.be.false()
        ret = this.prep.invalidChecksum({checksum: null})
        ret.should.be.false()
        ret = this.prep.invalidChecksum({checksum: undefined})
        ret.should.be.false()
      })

      it('returns true if the checksum is incorrect', function () {
        let ret = this.prep.invalidChecksum({checksum: ''})
        ret.should.be.true()
        ret = this.prep.invalidChecksum({checksum: 'f00'})
        ret.should.be.true()
        let sha1 = '68b329da9893e34099c7d8ad5cb9c94068b329da'
        ret = this.prep.invalidChecksum({checksum: sha1})
        ret.should.be.true()
        let md5hex = 'adc83b19e793491b1c6ea0fd8b46cd9f'
        ret = this.prep.invalidChecksum({checksum: md5hex})
        ret.should.be.true()
        let md5base64truncated = 'rcg7GeeTSRscbqD9i0bNn'
        ret = this.prep.invalidChecksum({checksum: md5base64truncated})
        ret.should.be.true()
        let sha1base64 = 'aLMp2piT40CZx9itXLnJQGizKdo='
        ret = this.prep.invalidChecksum({checksum: sha1base64})
        ret.should.be.true()
        let md5base64NonPadded = 'rcg7GeeTSRscbqD9i0bNnw'
        ret = this.prep.invalidChecksum({checksum: md5base64NonPadded})
        ret.should.be.true()
      })

      it('returns false if the checksum is OK', function () {
        let doc = {checksum: 'rcg7GeeTSRscbqD9i0bNnw=='}
        let ret = this.prep.invalidChecksum(doc)
        ret.should.be.false()
      })
    })

    describe('moveDoc', function () {
      it('calls moveFile for a file', function (done) {
        let doc = {
          path: 'move/name',
          docType: 'file'
        }
        let was = {
          path: 'move/old-name',
          docType: 'file'
        }
        this.prep.moveFile = sinon.stub().yields(null)
        return this.prep.moveDoc(this.side, doc, was, err => {
          should.not.exist(err)
          this.prep.moveFile.calledWith(this.side, doc, was).should.be.true()
          done()
        })
      })

      it('calls moveFolder for a folder', function (done) {
        let doc = {
          path: 'move/folder',
          docType: 'folder'
        }
        let was = {
          path: 'move/old-folder',
          docType: 'folder'
        }
        let spy = this.prep.moveFolder = sinon.stub().yields(null)
        return this.prep.moveDoc(this.side, doc, was, err => {
          should.not.exist(err)
          spy.calledWith(this.side, doc, was).should.be.true()
          done()
        })
      })

      it('throws an error if we move a file to a folder', function (done) {
        let doc = {
          path: 'move/folder',
          docType: 'folder'
        }
        let was = {
          path: 'move/old-file',
          docType: 'file'
        }
        return this.prep.moveDoc(this.side, doc, was, function (err) {
          should.exist(err)
          err.message.should.equal('Incompatible docTypes: folder')
          done()
        })
      })

      it('throws an error if we move a folder to a file', function (done) {
        let doc = {
          path: 'move/file',
          docType: 'file'
        }
        let was = {
          path: 'move/old-folder',
          docType: 'folder'
        }
        return this.prep.moveDoc(this.side, doc, was, function (err) {
          should.exist(err)
          err.message.should.equal('Incompatible docTypes: file')
          done()
        })
      })
    })

    describe('deleteDoc', function () {
      it('calls deleteFile for a file', function (done) {
        let doc = {
          path: 'delete/name',
          docType: 'file'
        }
        this.prep.deleteFile = sinon.stub().yields(null)
        return this.prep.deleteDoc(this.side, doc, err => {
          should.not.exist(err)
          this.prep.deleteFile.calledWith(this.side, doc).should.be.true()
          done()
        })
      })

      it('calls deleteFolder for a folder', function (done) {
        let doc = {
          path: 'delete/folder',
          docType: 'folder'
        }
        this.prep.deleteFolder = sinon.stub().yields(null)
        return this.prep.deleteDoc(this.side, doc, err => {
          should.not.exist(err)
          this.prep.deleteFolder.calledWith(this.side, doc).should.be.true()
          done()
        })
      })
    })
  })

  describe('Put', function () {
    describe('addFile', function () {
      it('expects a doc with a valid path', function (done) {
        return this.prep.addFile(this.side, {path: '/'}, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid path')
          done()
        })
      })

      it('accepts doc with no checksum', function (done) {
        this.merge.addFile = sinon.stub().yields(null)
        let doc = {
          path: 'no-checksum',
          docType: 'file'
        }
        return this.prep.addFile(this.side, doc, err => {
          should.not.exist(err)
          this.merge.addFile.calledWith(this.side, doc).should.be.true()
          done()
        })
      })

      it('rejects doc with an invalid checksum', function (done) {
        let doc = {
          path: 'no-checksum',
          checksum: 'foobar'
        }
        return this.prep.addFile(this.side, doc, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid checksum')
          done()
        })
      })

      it('calls Merge with the correct fields', function (done) {
        this.merge.addFile = sinon.stub().yields(null)
        let doc = {
          path: 'foo/missing-fields',
          checksum: 'rcg7GeeTSRscbqD9i0bNnw=='
        }
        return this.prep.addFile(this.side, doc, err => {
          should.not.exist(err)
          this.merge.addFile.calledWith(this.side, doc).should.be.true()
          doc.docType.should.equal('file')
          should.exist(doc._id)
          should.exist(doc.creationDate)
          should.exist(doc.lastModification)
          done()
        })
      })

      it('does nothing for ignored paths on local', function (done) {
        this.merge.addFile = sinon.spy()
        let doc = {
          path: 'ignored',
          checksum: 'rcg7GeeTSRscbqD9i0bNnw=='
        }
        return this.prep.addFile('local', doc, err => {
          should.not.exist(err)
          this.merge.addFile.called.should.be.false()
          done()
        })
      })
    })

    describe('updateFile', function () {
      it('expects a doc with a valid path', function (done) {
        return this.prep.updateFile(this.side, {path: '/'}, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid path')
          done()
        })
      })

      it('accepts doc with no checksum', function (done) {
        this.merge.updateFile = sinon.stub().yields(null)
        let doc = {
          path: 'no-checksum',
          docType: 'file'
        }
        return this.prep.updateFile(this.side, doc, err => {
          should.not.exist(err)
          this.merge.updateFile.calledWith(this.side, doc).should.be.true()
          done()
        })
      })

      it('rejects doc with an invalid checksum', function (done) {
        let doc = {
          path: 'no-checksum',
          checksum: 'foobar'
        }
        return this.prep.updateFile(this.side, doc, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid checksum')
          done()
        })
      })

      it('calls Merge with the correct fields', function (done) {
        this.merge.updateFile = sinon.stub().yields(null)
        let doc = {
          path: 'foobar/missing-fields',
          checksum: 'rcg7GeeTSRscbqD9i0bNnw=='
        }
        return this.prep.updateFile(this.side, doc, err => {
          should.not.exist(err)
          this.merge.updateFile.calledWith(this.side, doc).should.be.true()
          doc.docType.should.equal('file')
          should.exist(doc._id)
          should.exist(doc.lastModification)
          done()
        })
      })

      it('does nothing for ignored paths on local', function (done) {
        this.merge.updateFile = sinon.spy()
        let doc = {
          path: 'ignored',
          checksum: 'rcg7GeeTSRscbqD9i0bNnw=='
        }
        return this.prep.updateFile('local', doc, err => {
          should.not.exist(err)
          this.merge.updateFile.called.should.be.false()
          done()
        })
      })
    })

    describe('putFolder', function () {
      it('expects a doc with a valid path', function (done) {
        return this.prep.putFolder(this.side, {path: '..'}, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid path')
          done()
        })
      })

      it('calls Merge with the correct fields', function (done) {
        this.merge.putFolder = sinon.stub().yields(null)
        let doc = {path: 'foo/folder-missing-fields'}
        return this.prep.putFolder(this.side, doc, err => {
          should.not.exist(err)
          this.merge.putFolder.calledWith(this.side, doc).should.be.true()
          doc.docType.should.equal('folder')
          should.exist(doc._id)
          should.exist(doc.lastModification)
          done()
        })
      })

      it('does nothing for ignored paths on local', function (done) {
        this.merge.putFolder = sinon.spy()
        let doc = {path: 'ignored'}
        return this.prep.putFolder('local', doc, err => {
          should.not.exist(err)
          this.merge.putFolder.called.should.be.false()
          done()
        })
      })
    })
  })

  describe('Move', function () {
    describe('moveFile', function () {
      it('expects a doc with a valid path', function (done) {
        let doc = {path: ''}
        let was = {path: 'foo/baz'}
        return this.prep.moveFile(this.side, doc, was, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid path')
          done()
        })
      })

      it('expects a was with a valid path', function (done) {
        let doc = {path: 'foo/bar'}
        let was = {path: ''}
        return this.prep.moveFile(this.side, doc, was, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid path')
          done()
        })
      })

      it('expects a doc with a valid checksum', function (done) {
        let doc = {
          path: 'foo/bar',
          docType: 'file',
          checksum: 'invalid'
        }
        let was = {path: 'foo/baz'}
        return this.prep.moveFile(this.side, doc, was, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid checksum')
          done()
        })
      })

      it('expects two different paths', function (done) {
        let doc = {
          path: 'foo/bar',
          docType: 'file',
          checksum: 'VVVVVVVVVVVVVVVVVVVVVQ=='
        }
        let was = {
          path: 'foo/bar',
          docType: 'file',
          checksum: 'VVVVVVVVVVVVVVVVVVVVVQ=='
        }
        return this.prep.moveFile(this.side, doc, was, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid move')
          done()
        })
      })

      it('expects a revision for was', function (done) {
        let doc = {
          path: 'foo/bar',
          docType: 'file',
          checksum: 'VVVVVVVVVVVVVVVVVVVVVQ=='
        }
        let was = {
          path: 'foo/baz',
          docType: 'file',
          checksum: 'VVVVVVVVVVVVVVVVVVVVVQ=='
        }
        return this.prep.moveFile(this.side, doc, was, function (err) {
          should.exist(err)
          err.message.should.equal('Missing rev')
          done()
        })
      })

      it('calls Merge with the correct fields', function (done) {
        this.merge.moveFile = sinon.stub().yields(null)
        let doc = {
          path: 'FOO/new-missing-fields.jpg',
          checksum: 'uhNoeJzOlbV03scN/UduYQ=='
        }
        let was = {
          _id: 'FOO/OLD-MISSING-FIELDS.JPG',
          _rev: '456',
          path: 'FOO/OLD-MISSING-FIELDS.JPG',
          checksum: 'uhNoeJzOlbV03scN/UduYQ==',
          docType: 'file',
          creationDate: new Date(),
          lastModification: new Date(),
          tags: ['courge', 'quux'],
          size: 5426,
          class: 'image',
          mime: 'image/jpeg'
        }
        return this.prep.moveFile(this.side, doc, was, err => {
          should.not.exist(err)
          this.merge.moveFile.calledWith(this.side, doc, was).should.be.true()
          doc.docType.should.equal('file')
          should.exist(doc._id)
          should.exist(doc.lastModification)
          done()
        })
      })
    })

    describe('moveFolder', function () {
      it('expects a doc with a valid path', function (done) {
        let doc = {path: ''}
        let was = {path: 'foo/baz'}
        return this.prep.moveFolder(this.side, doc, was, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid path')
          done()
        })
      })

      it('expects a was with a valid id', function (done) {
        let doc = {path: 'foo/bar'}
        let was = {path: ''}
        return this.prep.moveFolder(this.side, doc, was, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid path')
          done()
        })
      })

      it('expects two different paths', function (done) {
        let doc = {
          path: 'foo/bar',
          docType: 'folder'
        }
        let was = {
          path: 'foo/bar',
          docType: 'folder'
        }
        return this.prep.moveFolder(this.side, doc, was, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid move')
          done()
        })
      })

      it('expects a revision for was', function (done) {
        let doc = {
          path: 'foo/bar',
          docType: 'folder'
        }
        let was = {
          path: 'foo/baz',
          docType: 'folder'
        }
        return this.prep.moveFolder(this.side, doc, was, function (err) {
          should.exist(err)
          err.message.should.equal('Missing rev')
          done()
        })
      })

      it('calls Merge with the correct fields', function (done) {
        let spy = this.merge.moveFolder = sinon.stub().yields(null)
        let doc =
                    {path: 'FOOBAR/new-missing-fields'}
        let was = {
          _id: 'FOOBAR/OLD-MISSING-FIELDS',
          _rev: '456',
          path: 'FOOBAR/OLD-MISSING-FIELDS',
          docType: 'folder',
          creationDate: new Date(),
          lastModification: new Date(),
          tags: ['courge', 'quux']
        }
        return this.prep.moveFolder(this.side, doc, was, err => {
          should.not.exist(err)
          spy.calledWith(this.side, doc, was).should.be.true()
          doc.docType.should.equal('folder')
          should.exist(doc._id)
          should.exist(doc.lastModification)
          done()
        })
      })
    })
  })

  describe('Delete', function () {
    describe('deleteFile', function () {
      it('expects a doc with a valid path', function (done) {
        return this.prep.deleteFile(this.side, {path: '/'}, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid path')
          done()
        })
      })

      it('calls Merge with the correct fields', function (done) {
        this.merge.deleteFile = sinon.stub().yields(null)
        let doc = {path: 'kill/file'}
        return this.prep.deleteFile(this.side, doc, err => {
          should.not.exist(err)
          this.merge.deleteFile.calledWith(this.side, doc).should.be.true()
          doc.docType.should.equal('file')
          should.exist(doc._id)
          done()
        })
      })

      it('does nothing for ignored paths on local', function (done) {
        this.merge.deleteFile = sinon.spy()
        let doc = {path: 'ignored'}
        return this.prep.deleteFile('local', doc, err => {
          should.not.exist(err)
          this.merge.deleteFile.called.should.be.false()
          done()
        })
      })
    })

    describe('deleteFolder', function () {
      it('expects a doc with a valid path', function (done) {
        return this.prep.deleteFolder(this.side, {path: '/'}, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid path')
          done()
        })
      })

      it('calls Merge with the correct fields', function (done) {
        this.merge.deleteFolder = sinon.stub().yields(null)
        let doc = {path: 'kill/folder'}
        return this.prep.deleteFolder(this.side, doc, err => {
          should.not.exist(err)
          this.merge.deleteFolder.calledWith(this.side, doc).should.be.true()
          doc.docType.should.equal('folder')
          should.exist(doc._id)
          done()
        })
      })

      it('does nothing for ignored paths on local', function (done) {
        this.merge.deleteFolder = sinon.spy()
        let doc = {path: 'ignored'}
        return this.prep.deleteFolder('local', doc, err => {
          should.not.exist(err)
          this.merge.deleteFolder.called.should.be.false()
          done()
        })
      })
    })
  })
})
