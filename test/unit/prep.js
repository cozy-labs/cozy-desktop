/* eslint-env mocha */

const sinon = require('sinon')
const should = require('should')
const path = require('path')

const { Ignore } = require('../../core/ignore')
const Prep = require('../../core/prep')
const { TRASH_DIR_NAME } = require('../../core/remote/constants')

describe('Prep', function() {
  beforeEach('instanciate prep', function() {
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
    this.merge.trashFileAsync.resolves()
    this.merge.trashFolderAsync.resolves()
    this.ignore = new Ignore(['ignored'])
    this.prep = new Prep(this.merge, this.ignore)
  })

  describe('Put', function() {
    describe('addFile', function() {
      it('expects a doc with a valid path', async function() {
        await should(
          this.prep.addFileAsync(this.side, { path: '/' })
        ).be.rejectedWith('Invalid path')
      })

      it('rejects a doc with no checksum', async function() {
        this.merge.addFileAsync.resolves()
        let doc = {
          path: 'no-checksum',
          docType: 'file'
        }
        await should(this.prep.addFileAsync(this.side, doc)).be.rejectedWith(
          'Invalid checksum'
        )
      })

      it('rejects doc with an invalid checksum', async function() {
        let doc = {
          path: 'invalid-checksum',
          md5sum: 'foobar'
        }
        await should(this.prep.addFileAsync(this.side, doc)).be.rejectedWith(
          'Invalid checksum'
        )
      })

      it('calls Merge with the correct fields', async function() {
        this.merge.addFileAsync.resolves()
        let doc = {
          path: 'foo/missing-fields',
          md5sum: 'rcg7GeeTSRscbqD9i0bNnw=='
        }
        await this.prep.addFileAsync(this.side, doc)
        this.merge.addFileAsync.calledWith(this.side, doc).should.be.true()
        doc.docType.should.equal('file')
        // FIXME: should.exist(doc.updated_at)
      })

      it('does nothing for ignored paths on local', async function() {
        let doc = {
          path: 'ignored',
          md5sum: 'rcg7GeeTSRscbqD9i0bNnw=='
        }
        await this.prep.addFileAsync('local', doc)
        this.merge.addFileAsync.called.should.be.false()
      })
    })

    describe('updateFile', function() {
      it('expects a doc with a valid path', async function() {
        await should(
          this.prep.updateFileAsync(this.side, { path: '/' })
        ).be.rejectedWith('Invalid path')
      })

      it('rejects doc with no checksum', async function() {
        this.merge.updateFileAsync.resolves()
        let doc = {
          path: 'no-checksum',
          docType: 'file'
        }
        await should(this.prep.updateFileAsync(this.side, doc)).be.rejectedWith(
          'Invalid checksum'
        )
      })

      it('rejects doc with an invalid checksum', async function() {
        let doc = {
          path: 'no-checksum',
          md5sum: 'foobar'
        }
        await should(this.prep.updateFileAsync(this.side, doc)).be.rejectedWith(
          'Invalid checksum'
        )
      })

      it('calls Merge with the correct fields', async function() {
        this.merge.updateFileAsync.resolves()
        let doc = {
          path: 'foobar/missing-fields',
          md5sum: 'rcg7GeeTSRscbqD9i0bNnw=='
        }
        await this.prep.updateFileAsync(this.side, doc)
        this.merge.updateFileAsync.calledWith(this.side, doc).should.be.true()
        doc.docType.should.equal('file')
        // FIXME: should.exist(doc.updated_at)
      })

      it('does nothing for ignored paths on local', async function() {
        let doc = {
          path: 'ignored',
          md5sum: 'rcg7GeeTSRscbqD9i0bNnw=='
        }
        await this.prep.updateFileAsync('local', doc)
        this.merge.updateFileAsync.called.should.be.false()
      })
    })

    describe('putFolder', function() {
      it('expects a doc with a valid path', async function() {
        await should(
          this.prep.putFolderAsync(this.side, { path: '..' })
        ).be.rejectedWith('Invalid path')
      })

      it('calls Merge with the correct fields', async function() {
        this.merge.putFolderAsync.resolves()
        let doc = { path: 'foo/folder-missing-fields' }
        await this.prep.putFolderAsync(this.side, doc)
        this.merge.putFolderAsync.calledWith(this.side, doc).should.be.true()
        doc.docType.should.equal('folder')
        // FIXME: should.exist(doc.updated_at)
      })

      it('does nothing for ignored paths on local', async function() {
        let doc = { path: 'ignored' }
        await this.prep.putFolderAsync('local', doc)
        this.merge.putFolderAsync.called.should.be.false()
      })
    })
  })

  describe('Move', function() {
    describe('moveFile', function() {
      it('expects a doc with a valid path', async function() {
        let doc = { path: '' }
        let was = { path: 'foo/baz' }
        await should(
          this.prep.moveFileAsync(this.side, doc, was)
        ).be.rejectedWith('Invalid path')
      })

      it('expects a was with a valid path', async function() {
        let doc = { path: 'foo/bar' }
        let was = { path: '' }
        await should(
          this.prep.moveFileAsync(this.side, doc, was)
        ).be.rejectedWith('Invalid path')
      })

      it('expects a doc with a valid checksum', async function() {
        let doc = {
          path: 'foo/bar',
          docType: 'file',
          md5sum: 'invalid'
        }
        let was = { path: 'foo/baz' }
        await should(
          this.prep.moveFileAsync(this.side, doc, was)
        ).be.rejectedWith('Invalid checksum')
      })

      it('expects two different paths', async function() {
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
        await should(
          this.prep.moveFileAsync(this.side, doc, was)
        ).be.rejectedWith('Invalid move')
      })

      it('expects a revision for was', async function() {
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
        await should(
          this.prep.moveFileAsync(this.side, doc, was)
        ).be.rejectedWith('Missing rev')
      })

      it('calls Merge with the correct fields', async function() {
        this.merge.moveFileAsync.resolves()
        let doc = {
          path: 'FOO/new-missing-fields.jpg',
          md5sum: 'uhNoeJzOlbV03scN/UduYQ=='
        }
        let was = {
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
        await this.prep.moveFileAsync(this.side, doc, was)
        this.merge.moveFileAsync
          .calledWith(this.side, doc, was)
          .should.be.true()
        doc.docType.should.equal('file')
        // FIXME: should.exist(doc.updated_at)
      })
    })

    describe('moveFolder', function() {
      it('expects a doc with a valid path', async function() {
        let doc = { path: '' }
        let was = { path: 'foo/baz' }
        await should(
          this.prep.moveFolderAsync(this.side, doc, was)
        ).be.rejectedWith('Invalid path')
      })

      it('expects a was with a valid id', async function() {
        let doc = { path: 'foo/bar' }
        let was = { path: '' }
        await should(
          this.prep.moveFolderAsync(this.side, doc, was)
        ).be.rejectedWith('Invalid path')
      })

      it('expects two different paths', async function() {
        let doc = {
          path: 'foo/bar',
          docType: 'folder'
        }
        let was = {
          path: 'foo/bar',
          docType: 'folder'
        }
        await should(
          this.prep.moveFolderAsync(this.side, doc, was)
        ).be.rejectedWith('Invalid move')
      })

      it('expects a revision for was', async function() {
        let doc = {
          path: 'foo/bar',
          docType: 'folder'
        }
        let was = {
          path: 'foo/baz',
          docType: 'folder'
        }
        await should(
          this.prep.moveFolderAsync(this.side, doc, was)
        ).be.rejectedWith('Missing rev')
      })

      it('calls Merge with the correct fields', async function() {
        this.merge.moveFolderAsync.resolves()
        let doc = { path: 'FOOBAR/new-missing-fields' }
        let was = {
          _rev: '456',
          path: 'FOOBAR/OLD-MISSING-FIELDS',
          docType: 'folder',
          updated_at: new Date(),
          tags: ['courge', 'quux']
        }
        await this.prep.moveFolderAsync(this.side, doc, was)
        this.merge.moveFolderAsync
          .calledWith(this.side, doc, was)
          .should.be.true()
        doc.docType.should.equal('folder')
        // FIXME: should.exist(doc.updated_at)
      })
    })
  })

  describe('Delete', function() {
    describe('deleteFile', function() {
      it('expects a doc with a valid path', async function() {
        await should(
          this.prep.deleteFileAsync(this.side, { path: '/' })
        ).be.rejectedWith('Invalid path')
      })

      it('calls Merge with the correct fields', async function() {
        this.merge.deleteFileAsync.resolves()
        let doc = { path: 'kill/file' }
        await this.prep.deleteFileAsync(this.side, doc)
        this.merge.deleteFileAsync.calledWith(this.side, doc).should.be.true()
        doc.docType.should.equal('file')
      })

      it('does nothing for ignored paths on local', async function() {
        let doc = { path: 'ignored' }
        await this.prep.deleteFileAsync('local', doc)
        this.merge.deleteFileAsync.called.should.be.false()
      })
    })

    describe('deleteFolder', function() {
      it('expects a doc with a valid path', async function() {
        await should(
          this.prep.deleteFolderAsync(this.side, { path: '/' })
        ).be.rejectedWith('Invalid path')
      })

      it('calls Merge with the correct fields', async function() {
        this.merge.deleteFolderAsync.resolves()
        let doc = { path: 'kill/folder' }
        await this.prep.deleteFolderAsync(this.side, doc)
        this.merge.deleteFolderAsync.calledWith(this.side, doc).should.be.true()
        doc.docType.should.equal('folder')
      })

      it('does nothing for ignored paths on local', async function() {
        let doc = { path: 'ignored' }
        await this.prep.deleteFolderAsync('local', doc)
        this.merge.deleteFolderAsync.called.should.be.false()
      })
    })
  })

  describe('trashFileAsync', () => {
    it('throws when the trashed path is invalid', async function() {
      const doc = { path: '/' }

      return this.prep
        .trashFileAsync(this.side, doc)
        .then(() => should.fail(), err => err.should.match(/Invalid path/))
    })

    it('generates a doc when none is passed', async function() {
      const was = {
        path: 'file-to-be-trashed',
        md5sum: 'rcg7GeeTSRscbqD9i0bNnw=='
      }

      await this.prep.trashFileAsync(this.side, was)

      should(this.merge.trashFileAsync).be.calledOnce()
      should(this.merge.trashFileAsync).be.calledWith(this.side, was, {
        ...was,
        path: path.join(TRASH_DIR_NAME, was.path),
        trashed: true,
        docType: 'file'
      })
    })

    // FIXME
    xit('does nothing for ignored paths on local', async function() {
      const doc = { path: 'ignored' }

      await this.prep.trashFileAsync(this.side, doc)

      should(this.merge.trashFileAsync).not.be.called()
    })
  })

  describe('trashFolderAsync', () => {
    it('throws when the trashed path is invalid', async function() {
      const doc = { path: '/' }

      return this.prep
        .trashFolderAsync(this.side, doc)
        .then(() => should.fail(), err => err.should.match(/Invalid path/))
    })

    it('generates a doc when none is passed', async function() {
      const was = { path: 'folder-to-be-trashed' }

      await this.prep.trashFolderAsync(this.side, was)

      should(this.merge.trashFolderAsync).be.calledOnce()
      should(this.merge.trashFolderAsync).be.calledWith(this.side, was, {
        ...was,
        path: path.join(TRASH_DIR_NAME, was.path),
        trashed: true,
        docType: 'folder'
      })
    })

    // FIXME
    xit('does nothing for ignored paths on local', async function() {
      const doc = { path: 'ignored' }

      await this.prep.trashFolderAsync(this.side, doc)

      should(this.merge.trashFolderAsync).not.be.called()
    })
  })
})
