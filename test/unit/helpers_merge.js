/* eslint-env mocha */

const path = require('path')
const should = require('should')
const sinon = require('sinon')

const { Merge, MergeMissingParentError } = require('../../core/merge')

const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')

describe('Merge Helpers', function() {
  before('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('instanciate merge', function() {
    this.side = 'local'
    this.merge = new Merge(this.pouch)
    this.merge.putFolderAsync = sinon.stub()
    this.merge.local = {}
    this.merge.local.moveAsync = sinon.stub()
  })
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('ensureParentExist', function() {
    for (const side of ['local', 'remote']) {
      context(side, () => {
        it('works when in the root folder', async function() {
          await this.merge.ensureParentExistAsync(side, { _id: 'foo' })
        })

        it('works if the parent directory is present', async function() {
          let doc = {
            _id: 'exists',
            docType: 'folder'
          }
          let child = {
            _id: 'exists/child',
            docType: 'folder'
          }
          await this.pouch.db.put(doc)
          await this.merge.ensureParentExistAsync(side, child)
        })

        if (side === 'local') {
          it('creates the parent directory if missing', async function() {
            this.merge.putFolderAsync.resolves('OK')
            let doc = {
              _id: 'MISSING/CHILD',
              path: 'missing/child'
            }
            await this.merge.ensureParentExistAsync(side, doc)
            this.merge.putFolderAsync.called.should.be.true()
            this.merge.putFolderAsync.args[0][1].should.have.properties({
              _id: 'MISSING',
              path: 'missing',
              docType: 'folder'
            })
          })

          it('creates the full tree if needed', async function() {
            this.merge.putFolderAsync.resolves('OK')
            let doc = {
              _id: 'a/b/c/d/e',
              path: 'a/b/c/d/e'
            }
            await this.merge.ensureParentExistAsync(side, doc)
            let iterable = ['a', 'a/b', 'a/b/c', 'a/b/c/d']
            for (let i = 0; i < iterable.length; i++) {
              let id = iterable[i]
              this.merge.putFolderAsync.called.should.be.true()
              this.merge.putFolderAsync.args[i][1].should.have.properties({
                _id: id,
                path: id,
                docType: 'folder'
              })
            }
          })
        }

        if (side === 'remote') {
          it('throws MergeMissingParentError when the parent directory is missing', async function() {
            const doc = {
              _id: 'MISSING/CHILD',
              path: 'missing/child'
            }
            await should(
              this.merge.ensureParentExistAsync(side, doc)
            ).be.rejectedWith(MergeMissingParentError)
          })

          it('throws MergeMissingParentError when the full tree is missing', async function() {
            const doc = {
              _id: 'a/b/c/d/e',
              path: 'a/b/c/d/e'
            }
            await should(
              this.merge.ensureParentExistAsync(side, doc)
            ).be.rejectedWith(MergeMissingParentError)
          })
        }
      })
    }
  })

  describe('resolveConflict', function() {
    it('appends -conflict- and the date to the path', async function() {
      let doc = { path: 'foo/bar' }
      let spy = this.merge.local.moveAsync
      spy.resolves()
      await this.merge.resolveConflictAsync(this.side, doc)
      spy.called.should.be.true()
      let dstPath = spy.args[0][0].path
      let parts = dstPath.split('-conflict-')
      parts[0].should.equal(path.normalize('foo/bar'))
      parts[1].should.match(/^\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}.\d{3}Z$/)
      let srcPath = spy.args[0][1].path
      srcPath.should.equal(doc.path)
    })

    it('preserves the extension', async function() {
      let doc = { path: 'foo/bar.jpg' }
      let spy = this.merge.local.moveAsync
      spy.resolves()
      await this.merge.resolveConflictAsync(this.side, doc)
      spy.called.should.be.true()
      let dstPath = spy.args[0][0].path
      dstPath.indexOf('conflict').should.not.equal(-1)
      path.extname(dstPath).should.equal('.jpg')
    })

    it('do not chain conflicts', async function() {
      let doc = { path: 'foo/baz-conflict-2018-11-08T01_02_03.004Z.jpg' }
      let spy = this.merge.local.moveAsync
      spy.resolves()
      await this.merge.resolveConflictAsync(this.side, doc)
      spy.called.should.be.true()
      let dstPath = spy.args[0][0].path
      dstPath.split('-conflict-').should.have.length(2)
    })
  })
})
