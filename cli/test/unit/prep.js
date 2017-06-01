/* eslint-env mocha */

import sinon from 'sinon'
import should from 'should'

import Ignore from '../../src/ignore'
import Prep from '../../src/prep'

describe('Prep', function () {
  beforeEach('instanciate prep', function () {
    this.side = 'local'
    this.merge = {
      addFileAsync: sinon.stub(),
      updateFileAsync: sinon.stub(),
      putFolderAsync: sinon.stub(),
      moveFileAsync: sinon.stub(),
      moveFolderAsync: sinon.stub(),
      trashFileAsync: sinon.stub(),
      trashFolderAsync: sinon.stub(),
      deleteFileAsync: sinon.stub(),
      deleteFolderAsync: sinon.stub()
    }
    this.merge.trashFileAsync.returnsPromise().resolves()
    this.merge.trashFolderAsync.returnsPromise().resolves()
    this.ignore = new Ignore(['ignored'])
    this.prep = new Prep(this.merge, this.ignore)
  })

  describe('Helpers', function () {
    xdescribe('moveDoc', function () {
      it('calls moveFile for a file', function (done) {
        let doc = {
          path: 'move/name',
          docType: 'file'
        }
        let was = {
          path: 'move/old-name',
          docType: 'file'
        }
        this.prep.moveFileAsync = sinon.stub()
        this.prep.moveFileAsync.returnsPromise().resolves()
        return this.prep.moveDoc(this.side, doc, was, err => {
          should.not.exist(err)
          this.prep.moveFileAsync.calledWith(this.side, doc, was).should.be.true()
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
        let spy = this.prep.moveFolderAsync = sinon.stub()
        spy.returnsPromise().resolves()
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

    xdescribe('trashDoc', function () {
      it('calls trashFile for a file', function (done) {
        let doc = {
          path: 'trash/name',
          docType: 'file'
        }
        this.prep.trashFileAsync = sinon.stub()
        this.prep.trashFileAsync.returnsPromise().resolves()
        return this.prep.trashDoc(this.side, doc, err => {
          should.not.exist(err)
          this.prep.trashFileAsync.calledWith(this.side, doc).should.be.true()
          done()
        })
      })

      it('calls trashFolder for a folder', function (done) {
        let doc = {
          path: 'trash/folder',
          docType: 'folder'
        }
        this.prep.trashFolderAsync = sinon.stub()
        this.prep.trashFolderAsync.returnsPromise().resolves()
        return this.prep.trashDoc(this.side, doc, err => {
          should.not.exist(err)
          this.prep.trashFolderAsync.calledWith(this.side, doc).should.be.true()
          done()
        })
      })
    })
  })

  describe('Put', function () {
    xdescribe('addFile', function () {
      it('expects a doc with a valid path', function (done) {
        return this.prep.addFile(this.side, {path: '/'}, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid path')
          done()
        })
      })

      it('accepts doc with no checksum', function (done) {
        this.merge.addFileAsync.returnsPromise().resolves()
        let doc = {
          path: 'no-checksum',
          docType: 'file'
        }
        return this.prep.addFile(this.side, doc, err => {
          should.not.exist(err)
          this.merge.addFileAsync.calledWith(this.side, doc).should.be.true()
          done()
        })
      })

      it('rejects doc with an invalid checksum', function (done) {
        let doc = {
          path: 'no-checksum',
          md5sum: 'foobar'
        }
        return this.prep.addFile(this.side, doc, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid checksum')
          done()
        })
      })

      it('calls Merge with the correct fields', function (done) {
        this.merge.addFileAsync.returnsPromise().resolves()
        let doc = {
          path: 'foo/missing-fields',
          md5sum: 'rcg7GeeTSRscbqD9i0bNnw=='
        }
        return this.prep.addFile(this.side, doc, err => {
          should.not.exist(err)
          this.merge.addFileAsync.calledWith(this.side, doc).should.be.true()
          doc.docType.should.equal('file')
          should.exist(doc._id)
          should.exist(doc.updated_at)
          done()
        })
      })

      it('does nothing for ignored paths on local', function (done) {
        let doc = {
          path: 'ignored',
          md5sum: 'rcg7GeeTSRscbqD9i0bNnw=='
        }
        return this.prep.addFile('local', doc, err => {
          should.not.exist(err)
          this.merge.addFileAsync.called.should.be.false()
          done()
        })
      })
    })

    xdescribe('updateFile', function () {
      it('expects a doc with a valid path', function (done) {
        return this.prep.updateFile(this.side, {path: '/'}, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid path')
          done()
        })
      })

      it('accepts doc with no checksum', function (done) {
        this.merge.updateFileAsync.returnsPromise().resolves()
        let doc = {
          path: 'no-checksum',
          docType: 'file'
        }
        return this.prep.updateFile(this.side, doc, err => {
          should.not.exist(err)
          this.merge.updateFileAsync.calledWith(this.side, doc).should.be.true()
          done()
        })
      })

      it('rejects doc with an invalid checksum', function (done) {
        let doc = {
          path: 'no-checksum',
          md5sum: 'foobar'
        }
        return this.prep.updateFile(this.side, doc, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid checksum')
          done()
        })
      })

      it('calls Merge with the correct fields', function (done) {
        this.merge.updateFileAsync.returnsPromise().resolves()
        let doc = {
          path: 'foobar/missing-fields',
          md5sum: 'rcg7GeeTSRscbqD9i0bNnw=='
        }
        return this.prep.updateFile(this.side, doc, err => {
          should.not.exist(err)
          this.merge.updateFileAsync.calledWith(this.side, doc).should.be.true()
          doc.docType.should.equal('file')
          should.exist(doc._id)
          should.exist(doc.updated_at)
          done()
        })
      })

      it('does nothing for ignored paths on local', function (done) {
        let doc = {
          path: 'ignored',
          md5sum: 'rcg7GeeTSRscbqD9i0bNnw=='
        }
        return this.prep.updateFile('local', doc, err => {
          should.not.exist(err)
          this.merge.updateFileAsync.called.should.be.false()
          done()
        })
      })
    })

    xdescribe('putFolder', function () {
      it('expects a doc with a valid path', function (done) {
        return this.prep.putFolder(this.side, {path: '..'}, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid path')
          done()
        })
      })

      it('calls Merge with the correct fields', function (done) {
        this.merge.putFolderAsync.returnsPromise().resolves()
        let doc = {path: 'foo/folder-missing-fields'}
        return this.prep.putFolder(this.side, doc, err => {
          should.not.exist(err)
          this.merge.putFolderAsync.calledWith(this.side, doc).should.be.true()
          doc.docType.should.equal('folder')
          should.exist(doc._id)
          should.exist(doc.updated_at)
          done()
        })
      })

      it('does nothing for ignored paths on local', function (done) {
        let doc = {path: 'ignored'}
        return this.prep.putFolder('local', doc, err => {
          should.not.exist(err)
          this.merge.putFolderAsync.called.should.be.false()
          done()
        })
      })
    })
  })

  describe('Move', function () {
    xdescribe('moveFile', function () {
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
          md5sum: 'invalid'
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
          md5sum: 'VVVVVVVVVVVVVVVVVVVVVQ=='
        }
        let was = {
          path: 'foo/bar',
          docType: 'file',
          md5sum: 'VVVVVVVVVVVVVVVVVVVVVQ=='
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
          md5sum: 'VVVVVVVVVVVVVVVVVVVVVQ=='
        }
        let was = {
          path: 'foo/baz',
          docType: 'file',
          md5sum: 'VVVVVVVVVVVVVVVVVVVVVQ=='
        }
        return this.prep.moveFile(this.side, doc, was, function (err) {
          should.exist(err)
          err.message.should.equal('Missing rev')
          done()
        })
      })

      it('calls Merge with the correct fields', function (done) {
        this.merge.moveFileAsync.returnsPromise().resolves()
        let doc = {
          path: 'FOO/new-missing-fields.jpg',
          md5sum: 'uhNoeJzOlbV03scN/UduYQ=='
        }
        let was = {
          _id: 'FOO/OLD-MISSING-FIELDS.JPG',
          _rev: '456',
          path: 'FOO/OLD-MISSING-FIELDS.JPG',
          md5sum: 'uhNoeJzOlbV03scN/UduYQ==',
          docType: 'file',
          updated_at: new Date(),
          tags: ['courge', 'quux'],
          size: 5426,
          class: 'image',
          mime: 'image/jpeg'
        }
        return this.prep.moveFile(this.side, doc, was, err => {
          should.not.exist(err)
          this.merge.moveFileAsync.calledWith(this.side, doc, was).should.be.true()
          doc.docType.should.equal('file')
          should.exist(doc._id)
          should.exist(doc.updated_at)
          done()
        })
      })
    })

    xdescribe('moveFolder', function () {
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
        this.merge.moveFolderAsync.returnsPromise().resolves()
        let doc =
                    {path: 'FOOBAR/new-missing-fields'}
        let was = {
          _id: 'FOOBAR/OLD-MISSING-FIELDS',
          _rev: '456',
          path: 'FOOBAR/OLD-MISSING-FIELDS',
          docType: 'folder',
          updated_at: new Date(),
          tags: ['courge', 'quux']
        }
        return this.prep.moveFolder(this.side, doc, was, err => {
          should.not.exist(err)
          this.merge.moveFolderAsync.calledWith(this.side, doc, was).should.be.true()
          doc.docType.should.equal('folder')
          should.exist(doc._id)
          should.exist(doc.updated_at)
          done()
        })
      })
    })
  })

  describe('Delete', function () {
    xdescribe('deleteFile', function () {
      it('expects a doc with a valid path', function (done) {
        return this.prep.deleteFile(this.side, {path: '/'}, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid path')
          done()
        })
      })

      it('calls Merge with the correct fields', function (done) {
        this.merge.deleteFileAsync.returnsPromise().resolves()
        let doc = {path: 'kill/file'}
        return this.prep.deleteFile(this.side, doc, err => {
          should.not.exist(err)
          this.merge.deleteFileAsync.calledWith(this.side, doc).should.be.true()
          doc.docType.should.equal('file')
          should.exist(doc._id)
          done()
        })
      })

      it('does nothing for ignored paths on local', function (done) {
        let doc = {path: 'ignored'}
        return this.prep.deleteFile('local', doc, err => {
          should.not.exist(err)
          this.merge.deleteFileAsync.called.should.be.false()
          done()
        })
      })
    })

    xdescribe('deleteFolder', function () {
      it('expects a doc with a valid path', function (done) {
        return this.prep.deleteFolder(this.side, {path: '/'}, function (err) {
          should.exist(err)
          err.message.should.equal('Invalid path')
          done()
        })
      })

      it('calls Merge with the correct fields', function (done) {
        this.merge.deleteFolderAsync.returnsPromise().resolves()
        let doc = {path: 'kill/folder'}
        return this.prep.deleteFolder(this.side, doc, err => {
          should.not.exist(err)
          this.merge.deleteFolderAsync.calledWith(this.side, doc).should.be.true()
          doc.docType.should.equal('folder')
          should.exist(doc._id)
          done()
        })
      })

      it('does nothing for ignored paths on local', function (done) {
        let doc = {path: 'ignored'}
        return this.prep.deleteFolder('local', doc, err => {
          should.not.exist(err)
          this.merge.deleteFolderAsync.called.should.be.false()
          done()
        })
      })
    })
  })

  describe('trashFileAsync', () => {
    it('merges the metadata with an _id and a docType', async function () {
      const doc = {path: 'file-to-be-trashed', md5sum: 'rcg7GeeTSRscbqD9i0bNnw=='}

      await this.prep.trashFileAsync(this.side, doc)

      should(doc).have.property('_id')
      should(this.merge.trashFileAsync).be.calledOnce()
    })

    it('throws when path is invalid', async function () {
      const doc = {path: '/'}

      return this.prep.trashFileAsync(this.side, doc).then(
          () => should.fail(),
          (err) => err.should.match(/Invalid path/)
      )
    })

    xit('does nothing for ignored paths on local', async function () {
      const doc = {path: 'ignored'}

      await this.prep.trashFileAsync(this.side, doc)

      should(this.merge.trashFileAsync).not.be.called()
    })
  })

  describe('trashFolderAsync', () => {
    it('merges the metadata with an _id and a docType', async function () {
      const doc = {path: 'folder-to-be-trashed', md5sum: 'rcg7GeeTSRscbqD9i0bNnw=='}

      await this.prep.trashFolderAsync(this.side, doc)

      should(doc).have.property('_id')
      should(this.merge.trashFolderAsync).be.calledOnce()
    })

    it('throws when path is invalid', async function () {
      const doc = {path: '/'}

      return this.prep.trashFolderAsync(this.side, doc).then(
          () => should.fail(),
          (err) => err.should.match(/Invalid path/)
      )
    })

    xit('does nothing for ignored paths on local', async function () {
      const doc = {path: 'ignored'}

      await this.prep.trashFolderAsync(this.side, doc)

      should(this.merge.trashAsync).not.be.called()
    })
  })
})
