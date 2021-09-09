/* eslint-env mocha */

const _ = require('lodash')
const path = require('path')
const should = require('should')
const sinon = require('sinon')

const conflicts = require('../../core/utils/conflicts')
const { Merge } = require('../../core/merge')
const metadata = require('../../core/metadata')

const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')
const Builders = require('../support/builders')
const stubSide = require('../support/doubles/side')

describe('Merge Helpers', function() {
  let builders

  before('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('instanciate merge', function() {
    this.side = 'local'
    this.merge = new Merge(this.pouch)
    this.merge.putFolderAsync = sinon.stub()
    this.merge.local = stubSide('local')
    this.merge.local.resolveConflict = sinon.stub().callsFake(doc => {
      // XXX: We cannot stub `fs.rename` as it's directly imported by `Local`
      // but we care about the `local` attribute being updated and returned.
      const newName = path.basename(conflicts.generateConflictPath(doc.path))
      const newPath = path.join(path.dirname(doc.path), newName)
      const conflict = {
        ..._.clone(doc),
        path: newPath
      }
      metadata.updateLocal(conflict)
      return conflict.local
    })
  })
  beforeEach('prepare builders', function() {
    builders = new Builders(this)
  })
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('resolveConflict', function() {
    it('does not change the original doc path', async function() {
      const doc = builders
        .metadir()
        .path('foo/bar')
        .build()
      await this.merge.resolveConflictAsync(this.side, doc)
      should(this.merge.local.resolveConflict).have.been.called()
      should(doc.path).eql(path.normalize('foo/bar'))
    })

    it('appends -conflict- and the date to the path', async function() {
      const doc = builders
        .metadir()
        .path('foo/bar')
        .build()
      const dstDoc = await this.merge.resolveConflictAsync(this.side, doc)
      should(this.merge.local.resolveConflict).have.been.called()
      should(dstDoc.path)
        .match(/foo(\/|\\)bar/)
        .and.match(conflicts.CONFLICT_REGEXP)
    })

    it('preserves the extension', async function() {
      const doc = builders
        .metafile()
        .path('foo/bar.jpg')
        .build()
      const dstDoc = await this.merge.resolveConflictAsync(this.side, doc)
      should(this.merge.local.resolveConflict).have.been.called()
      should(dstDoc.path)
        .match(/foo(\/|\\)bar/)
        .and.match(conflicts.CONFLICT_REGEXP)
        .and.endWith('.jpg')
    })

    it('do not chain conflicts', async function() {
      const doc = builders
        .metafile()
        .path('foo/baz-conflict-2018-11-08T01_02_03.004Z.jpg')
        .build()
      const dstDoc = await this.merge.resolveConflictAsync(this.side, doc)
      should(this.merge.local.resolveConflict).have.been.called()
      should(dstDoc.path)
        .match(/foo(\/|\\)baz/)
        .and.match(conflicts.CONFLICT_REGEXP)
    })
  })
})
