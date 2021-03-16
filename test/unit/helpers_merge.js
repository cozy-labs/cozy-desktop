/* eslint-env mocha */

const path = require('path')
const should = require('should')
const sinon = require('sinon')

const conflicts = require('../../core/utils/conflicts')
const { Merge } = require('../../core/merge')

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

  describe('resolveConflict', function() {
    it('appends -conflict- and the date to the path', async function() {
      const doc = builders
        .metadir()
        .path('foo/bar')
        .build()
      const spy = this.merge.local.moveAsync
      spy.resolves()
      await this.merge.resolveConflictAsync(this.side, doc)
      should(spy).have.been.called()
      const dstPath = spy.args[0][0].path
      should(dstPath)
        .match(/foo(\/|\\)bar/)
        .and.match(conflicts.CONFLICT_REGEXP)
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
        .and.match(conflicts.CONFLICT_REGEXP)
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
        .and.match(conflicts.CONFLICT_REGEXP)
    })
  })
})
