/* eslint-env mocha */

const path = require('path')
const should = require('should')
const sinon = require('sinon')

const metadata = require('../../core/metadata')
const { Merge, MergeMissingParentError } = require('../../core/merge')

const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')
const Builders = require('../support/builders')

describe('Merge Helpers', function() {
  let builders

  before('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('instanciate merge', function() {
    this.side = 'local'
    this.merge = new Merge(this.pouch)
    this.merge.putFolderAsync = sinon.stub()
    this.merge.local = {}
    this.merge.local.moveAsync = sinon.stub()
  })
  beforeEach('prepare builders', function() {
    builders = new Builders(this)
  })
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('ensureParentExist', function() {
    for (const side of ['local', 'remote']) {
      context(side, () => {
        it('works when in the root folder', async function() {
          await this.merge.ensureParentExistAsync(
            side,
            builders
              .metadata()
              .path('foo')
              .build()
          )
        })

        it('works if the parent directory is present', async function() {
          builders
            .metadir()
            .path('exists')
            .create()
          const child = builders
            .metadir()
            .path('exists/child')
            .build()
          await this.merge.ensureParentExistAsync(side, child)
        })

        if (side === 'local') {
          it('creates the parent directory if missing', async function() {
            const doc = builders
              .metadata()
              .path('missing/child')
              .build()
            this.merge.putFolderAsync.resolves('OK')
            await this.merge.ensureParentExistAsync(side, doc)
            should(this.merge.putFolderAsync).have.been.called()
            this.merge.putFolderAsync.args[0][1].should.have.properties({
              path: 'missing',
              docType: 'folder'
            })
          })

          it('creates the full tree if needed', async function() {
            const doc = builders
              .metadata()
              .path('a/b/c/d/e')
              .build()
            this.merge.putFolderAsync.resolves('OK')
            await this.merge.ensureParentExistAsync(side, doc)
            const iterable = ['a', 'a/b', 'a/b/c', 'a/b/c/d'].map(
              path.normalize
            )
            for (let i = 0; i < iterable.length; i++) {
              const path = iterable[i]
              should(this.merge.putFolderAsync).have.been.called()
              this.merge.putFolderAsync.args[i][1].should.have.properties({
                path,
                docType: 'folder'
              })
            }
          })
        }

        if (side === 'remote') {
          it('throws MergeMissingParentError when the parent directory is missing', async function() {
            const doc = builders
              .metadata()
              .path('missing/child')
              .build()
            await should(
              this.merge.ensureParentExistAsync(side, doc)
            ).be.rejectedWith(MergeMissingParentError)
          })

          it('throws MergeMissingParentError when the full tree is missing', async function() {
            const doc = builders
              .metadata()
              .path('a/b/c/d/e')
              .build()
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
      const doc = builders
        .metadata()
        .path('foo/bar')
        .build()
      const spy = this.merge.local.moveAsync
      spy.resolves()
      await this.merge.resolveConflictAsync(this.side, doc)
      should(spy).have.been.called()
      const dstPath = spy.args[0][0].path
      should(dstPath)
        .match(/foo(\/|\\)bar/)
        .and.match(metadata.CONFLICT_REGEXP)
      const srcPath = spy.args[0][1].path
      should(srcPath).equal(doc.path)
    })

    it('preserves the extension', async function() {
      const doc = builders
        .metafile()
        .path('foo/bar.jpg')
        .build()
      const spy = this.merge.local.moveAsync
      spy.resolves()
      await this.merge.resolveConflictAsync(this.side, doc)
      should(spy).have.been.called()
      const dstPath = spy.args[0][0].path
      should(dstPath)
        .match(/foo(\/|\\)bar/)
        .and.match(metadata.CONFLICT_REGEXP)
      should(path.extname(dstPath)).equal('.jpg')
    })

    it('do not chain conflicts', async function() {
      const doc = builders
        .metafile()
        .path('foo/baz-conflict-2018-11-08T01_02_03.004Z.jpg')
        .build()
      const spy = this.merge.local.moveAsync
      spy.resolves()
      await this.merge.resolveConflictAsync(this.side, doc)
      should(spy).have.been.called()
      const dstPath = spy.args[0][0].path
      should(dstPath)
        .match(/foo(\/|\\)baz/)
        .and.match(metadata.CONFLICT_REGEXP)
    })
  })
})
