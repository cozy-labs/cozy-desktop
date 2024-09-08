/* eslint-env mocha */

const sinon = require('sinon')
const should = require('should')
const _ = require('lodash')

const { FOLDER } = require('../../core/metadata')
const { Ignore } = require('../../core/ignore')
const Prep = require('../../core/prep')

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
    this.merge.trashFileAsync.resolves()
    this.merge.trashFolderAsync.resolves()
    this.ignore = new Ignore(['ignored'])
    this.prep = new Prep(this.merge, this.ignore)
  })

  describe('Put', function () {
    describe('addFile', function () {
      it('expects a doc with a valid path', async function () {
        await should(
          this.prep.addFileAsync(this.side, { path: '/' })
        ).be.rejectedWith('Invalid path')
      })

      it('rejects a doc with no checksum', async function () {
        this.merge.addFileAsync.resolves()
        let doc = {
          path: 'no-checksum',
          docType: 'file'
        }
        await should(this.prep.addFileAsync(this.side, doc)).be.rejectedWith(
          'Invalid checksum'
        )
      })

      it('rejects doc with an invalid checksum', async function () {
        let doc = {
          path: 'invalid-checksum',
          md5sum: 'foobar'
        }
        await should(this.prep.addFileAsync(this.side, doc)).be.rejectedWith(
          'Invalid checksum'
        )
      })

      it('calls Merge with the correct fields', async function () {
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

      it('does nothing for ignored paths on local', async function () {
        let doc = {
          path: 'ignored',
          md5sum: 'rcg7GeeTSRscbqD9i0bNnw=='
        }
        await this.prep.addFileAsync('local', doc)
        this.merge.addFileAsync.called.should.be.false()
      })
    })

    describe('updateFile', function () {
      it('expects a doc with a valid path', async function () {
        await should(
          this.prep.updateFileAsync(this.side, { path: '/' })
        ).be.rejectedWith('Invalid path')
      })

      it('rejects doc with no checksum', async function () {
        this.merge.updateFileAsync.resolves()
        let doc = {
          path: 'no-checksum',
          docType: 'file'
        }
        await should(this.prep.updateFileAsync(this.side, doc)).be.rejectedWith(
          'Invalid checksum'
        )
      })

      it('rejects doc with an invalid checksum', async function () {
        let doc = {
          path: 'no-checksum',
          md5sum: 'foobar'
        }
        await should(this.prep.updateFileAsync(this.side, doc)).be.rejectedWith(
          'Invalid checksum'
        )
      })

      it('calls Merge with the correct fields', async function () {
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

      it('does nothing for ignored paths on local', async function () {
        let doc = {
          path: 'ignored',
          md5sum: 'rcg7GeeTSRscbqD9i0bNnw=='
        }
        await this.prep.updateFileAsync('local', doc)
        this.merge.updateFileAsync.called.should.be.false()
      })
    })

    describe('putFolder', function () {
      it('expects a doc with a valid path', async function () {
        await should(
          this.prep.putFolderAsync(this.side, { path: '..' })
        ).be.rejectedWith('Invalid path')
      })

      it('calls Merge with the correct fields', async function () {
        this.merge.putFolderAsync.resolves()
        let doc = { path: 'foo/folder-missing-fields' }
        await this.prep.putFolderAsync(this.side, doc)
        this.merge.putFolderAsync.calledWith(this.side, doc).should.be.true()
        doc.docType.should.equal(FOLDER)
        // FIXME: should.exist(doc.updated_at)
      })

      it('does nothing for ignored paths on local', async function () {
        let doc = { path: 'ignored' }
        await this.prep.putFolderAsync('local', doc)
        this.merge.putFolderAsync.called.should.be.false()
      })
    })
  })

  describe('Move', function () {
    describe('moveFile', function () {
      it('expects a doc with a valid path', async function () {
        let doc = { path: '' }
        let was = { path: 'foo/baz' }
        await should(
          this.prep.moveFileAsync(this.side, doc, was)
        ).be.rejectedWith('Invalid path')
      })

      it('expects a was with a valid path', async function () {
        let doc = { path: 'foo/bar' }
        let was = { path: '' }
        await should(
          this.prep.moveFileAsync(this.side, doc, was)
        ).be.rejectedWith('Invalid path')
      })

      it('expects a doc with a valid checksum', async function () {
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

      it('expects a revision for was', async function () {
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

      it('calls updateFileAsync if src and dst paths are the same', async function () {
        sinon.spy(this.prep, 'updateFileAsync')

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
        this.prep.moveFileAsync(this.side, doc, was)
        should(this.prep.updateFileAsync).have.been.calledWith(this.side, doc)

        this.prep.updateFileAsync.restore()
      })

      it('calls trashFileAsync if dst path is ignored', async function () {
        sinon.spy(this.prep, 'trashFileAsync')

        const updated_at = new Date()
        const was = {
          _rev: '456',
          path: 'foo/bar',
          md5sum: 'uhNoeJzOlbV03scN/UduYQ==',
          docType: 'file',
          updated_at,
          tags: ['courge', 'quux'],
          size: 5426,
          class: 'image',
          mime: 'image/jpeg',
          local: {
            path: 'foo/bar',
            md5sum: 'uhNoeJzOlbV03scN/UduYQ==',
            docType: 'file',
            updated_at,
            size: 5426,
            class: 'image',
            mime: 'image/jpeg'
          }
        }
        let doc = _.defaultsDeep(
          {
            path: 'ignored',
            local: {
              path: 'ignored'
            }
          },
          _.cloneDeep(was)
        )

        this.prep.moveFileAsync(this.side, doc, was)
        should(this.prep.trashFileAsync)
          .have.been.calledOnce()
          .and.calledWith(this.side, was)

        this.prep.trashFileAsync.restore()
      })

      it('calls Merge with the correct fields', async function () {
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

    describe('moveFolder', function () {
      it('expects a doc with a valid path', async function () {
        let doc = { path: '' }
        let was = { path: 'foo/baz' }
        await should(
          this.prep.moveFolderAsync(this.side, doc, was)
        ).be.rejectedWith('Invalid path')
      })

      it('expects a was with a valid id', async function () {
        let doc = { path: 'foo/bar' }
        let was = { path: '' }
        await should(
          this.prep.moveFolderAsync(this.side, doc, was)
        ).be.rejectedWith('Invalid path')
      })

      it('expects a revision for was', async function () {
        let doc = {
          path: 'foo/bar',
          docType: FOLDER
        }
        let was = {
          path: 'foo/baz',
          docType: FOLDER
        }
        await should(
          this.prep.moveFolderAsync(this.side, doc, was)
        ).be.rejectedWith('Missing rev')
      })

      it('calls putFolderAsync if src and dst paths are the same', async function () {
        sinon.spy(this.prep, 'putFolderAsync')

        let doc = {
          path: 'foo/bar',
          docType: FOLDER
        }
        let was = {
          path: 'foo/bar',
          docType: FOLDER
        }
        this.prep.moveFolderAsync(this.side, doc, was)
        should(this.prep.putFolderAsync).have.been.calledWith(this.side, doc)

        this.prep.putFolderAsync.restore()
      })

      it('calls trashFolderAsync if dst path is ignored', async function () {
        sinon.spy(this.prep, 'trashFolderAsync')

        const updated_at = new Date()
        const was = {
          _rev: '456',
          path: 'foo/bar',
          docType: FOLDER,
          updated_at,
          tags: ['courge', 'quux'],
          local: {
            path: 'foo/bar',
            docType: FOLDER,
            updated_at
          }
        }
        let doc = _.defaultsDeep(
          {
            path: 'ignored',
            local: {
              path: 'ignored'
            }
          },
          _.cloneDeep(was)
        )

        this.prep.moveFolderAsync(this.side, doc, was)
        should(this.prep.trashFolderAsync)
          .have.been.calledOnce()
          .and.calledWith(this.side, was)

        this.prep.trashFolderAsync.restore()
      })

      it('calls Merge with the correct fields', async function () {
        this.merge.moveFolderAsync.resolves()
        let doc = { path: 'FOOBAR/new-missing-fields' }
        let was = {
          _rev: '456',
          path: 'FOOBAR/OLD-MISSING-FIELDS',
          docType: FOLDER,
          updated_at: new Date(),
          tags: ['courge', 'quux']
        }
        await this.prep.moveFolderAsync(this.side, doc, was)
        this.merge.moveFolderAsync
          .calledWith(this.side, doc, was)
          .should.be.true()
        doc.docType.should.equal(FOLDER)
        // FIXME: should.exist(doc.updated_at)
      })
    })
  })

  describe('Delete', function () {
    describe('deleteFile', function () {
      it('expects a doc with a valid path', async function () {
        await should(
          this.prep.deleteFileAsync(this.side, { path: '/' })
        ).be.rejectedWith('Invalid path')
      })

      it('calls Merge with the correct fields', async function () {
        this.merge.deleteFileAsync.resolves()
        let doc = { path: 'kill/file' }
        await this.prep.deleteFileAsync(this.side, doc)
        this.merge.deleteFileAsync.calledWith(this.side, doc).should.be.true()
        doc.docType.should.equal('file')
      })

      it('does nothing for ignored paths on local', async function () {
        let doc = { path: 'ignored' }
        await this.prep.deleteFileAsync('local', doc)
        this.merge.deleteFileAsync.called.should.be.false()
      })
    })

    describe('deleteFolder', function () {
      it('expects a doc with a valid path', async function () {
        await should(
          this.prep.deleteFolderAsync(this.side, { path: '/' })
        ).be.rejectedWith('Invalid path')
      })

      it('calls Merge with the correct fields', async function () {
        this.merge.deleteFolderAsync.resolves()
        let doc = { path: 'kill/folder' }
        await this.prep.deleteFolderAsync(this.side, doc)
        this.merge.deleteFolderAsync.calledWith(this.side, doc).should.be.true()
        doc.docType.should.equal(FOLDER)
      })

      it('does nothing for ignored paths on local', async function () {
        let doc = { path: 'ignored' }
        await this.prep.deleteFolderAsync('local', doc)
        this.merge.deleteFolderAsync.called.should.be.false()
      })
    })
  })

  describe('trashFileAsync', () => {
    it('throws when the trashed path is invalid', async function () {
      const doc = { path: '/' }

      return this.prep.trashFileAsync(this.side, doc).then(
        () => should.fail(),
        err => err.should.match(/Invalid path/)
      )
    })

    context('locally with no trashed doc', () => {
      context('and no local side', () => {
        it('calls Merge with the existing record and a copy marked as trashed', async function () {
          const was = {
            path: 'file-to-be-trashed',
            md5sum: 'rcg7GeeTSRscbqD9i0bNnw=='
          }

          await this.prep.trashFileAsync(this.side, was)

          should(this.merge.trashFileAsync)
            .be.calledOnce()
            .and.be.calledWith(this.side, was, {
              ...was,
              trashed: true
            })
        })
      })

      context('but a local side', () => {
        it('calls Merge with the existing record and a copy marked as trashed', async function () {
          const was = {
            path: 'file-to-be-trashed',
            md5sum: 'rcg7GeeTSRscbqD9i0bNnw==',
            local: {
              path: 'file-to-be-trashed',
              md5sum: 'rcg7GeeTSRscbqD9i0bNnw=='
            }
          }

          await this.prep.trashFileAsync(this.side, was)

          should(this.merge.trashFileAsync)
            .be.calledOnce()
            .and.be.calledWith(
              this.side,
              was,
              _.defaultsDeep(
                {
                  trashed: true,
                  local: { trashed: true }
                },
                _.cloneDeep(was)
              )
            )
        })
      })
    })

    // FIXME
    xit('does nothing for ignored paths on local', async function () {
      const doc = { path: 'ignored' }

      await this.prep.trashFileAsync(this.side, doc)

      should(this.merge.trashFileAsync).not.be.called()
    })
  })

  describe('trashFolderAsync', () => {
    it('throws when the trashed path is invalid', async function () {
      const doc = { path: '/' }

      return this.prep.trashFolderAsync(this.side, doc).then(
        () => should.fail(),
        err => err.should.match(/Invalid path/)
      )
    })

    context('locally with no trashed doc', () => {
      context('and no local side', () => {
        it('calls Merge with the existing record and a copy marked as trashed', async function () {
          const was = { path: 'folder-to-be-trashed' }

          await this.prep.trashFolderAsync(this.side, was)

          should(this.merge.trashFolderAsync)
            .be.calledOnce()
            .and.be.calledWith(this.side, was, {
              ...was,
              trashed: true
            })
        })
      })

      context('but a local side', () => {
        it('calls Merge with the existing record and a copy marked as trashed', async function () {
          const was = {
            path: 'folder-to-be-trashed',
            local: { path: 'folder-to-be-trashed' }
          }

          await this.prep.trashFolderAsync(this.side, was)

          should(this.merge.trashFolderAsync)
            .be.calledOnce()
            .and.be.calledWith(
              this.side,
              was,
              _.defaultsDeep(
                {
                  trashed: true,
                  local: { trashed: true }
                },
                _.cloneDeep(was)
              )
            )
        })
      })
    })

    // FIXME
    xit('does nothing for ignored paths on local', async function () {
      const doc = { path: 'ignored' }

      await this.prep.trashFolderAsync(this.side, doc)

      should(this.merge.trashFolderAsync).not.be.called()
    })
  })
})
