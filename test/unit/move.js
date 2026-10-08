/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const should = require('should')

const move = require('../../core/move')
const { otherSide } = require('../../core/side')
const pathUtils = require('../../core/utils/path')
const Builders = require('../support/builders')
const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')

describe('move', () => {
  let builders
  before('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('prepare builders', function() {
    builders = new Builders(this)
  })

  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  it('keeps all src attributes not defined in dst', async () => {
    const src = await builders
      .metafile()
      .path('src/file')
      .data('hello')
      .tags('qux')
      .sides({ local: 2, remote: 1 })
      .create()
    src.metadata = {
      test: 'kept metadata'
    }
    const dst = builders
      .metafile()
      .path('dst/file')
      .noRemote()
      .tags('courge')
      .build()
    should(dst.metadata).be.undefined()

    move('local', src, dst)

    should(dst).have.properties({
      metadata: src.metadata,
      tags: ['qux', 'courge'],
      remote: src.remote,
      _id: src._id,
      _rev: src._rev
    })
    // PouchDB reserved attributes are not transfered
    should(dst).not.have.property('_deleted')
    // defined attributes are not overwritten
    should(dst.md5sum).not.eql(src.md5sum)
    should(dst.size).not.eql(src.size)
  })

  describe('.child()', () => {
    it('ensures destination will be moved as part of its ancestor directory', async () => {
      const src = await builders
        .metadata()
        .path('whatever/src')
        .upToDate()
        .create()
      const dst = _.defaults({ path: 'whatever/dst' }, src)

      move.child('local', src, dst)

      should(dst)
        .have.propertyByPath('moveFrom', 'childMove')
        .eql(true)
    })
  })

  describe('chained moveFrom', () => {
    it('chains through src.moveFrom when local side is not up-to-date', async () => {
      // Simulates i -> i* (remote move, not synced locally) then i* -> z:
      // src = i* (carries moveFrom = i, local side out-of-date), dst = z.
      const originalSrc = await builders
        .metadata()
        .path('i')
        .upToDate()
        .create()
      const src = await builders
        .metadata()
        .moveFrom(originalSrc)
        .path('i*')
        .changedSide('remote')
        .create()
      const dst = builders
        .metadata()
        .path('z')
        .build()

      move('remote', src, dst)

      should(dst.moveFrom).eql(originalSrc)
    })

    it('uses src directly when local side is up-to-date', async () => {
      // Local move already applied to filesystem: src.moveFrom exists but
      // local side is up-to-date, so we must not chain through.
      const originalSrc = await builders
        .metadata()
        .path('src')
        .upToDate()
        .create()
      const src = await builders
        .metadata()
        .moveFrom(originalSrc)
        .path('src2')
        .changedSide('local')
        .create()
      const dst = builders
        .metadata()
        .path('dst')
        .build()

      move('local', src, dst)

      should(dst.moveFrom).eql(src)
    })

    it('uses src directly when src has no moveFrom', async () => {
      const src = await builders
        .metadata()
        .path('src')
        .upToDate()
        .create()
      const dst = builders
        .metadata()
        .path('dst')
        .build()

      move('local', src, dst)

      should(dst.moveFrom).eql(src)
    })

    it('uses src directly when src.moveFrom is a child move', async () => {
      // A child move's `moveFrom` points at the path before the parent move.
      // The parent's sync will relocate that path, so we must not chain
      // through it — `src` is the actual local path to move from.
      const originalSrc = await builders
        .metadata()
        .path('parent/src')
        .upToDate()
        .create()
      const src = await builders
        .metadata()
        .moveFrom(originalSrc, { childMove: true })
        .path('parent/dst/src')
        .changedSide('remote')
        .create()
      const dst = builders
        .metadata()
        .path('parent/dst2/src')
        .build()

      move('remote', src, dst)

      should(dst.moveFrom).eql(src)
    })

    it('refreshes the move snapshot revision with the merged remote one', async () => {
      // Simulates the merge of the remote move that the Cozy applied while
      // the response of the client's own move request was lost: the remote
      // revision advanced and was merged into the destination's remote info,
      // while the move snapshot still holds the revision from before the
      // move. Sending the outdated revision in the `If-Match` header of the
      // move request would be rejected with a 412 Precondition Failed.
      const originalSrc = await builders
        .metadata()
        .path('src')
        .upToDate()
        .create()
      const src = await builders
        .metadata()
        .moveFrom(originalSrc)
        .path('src*')
        .changedSide('remote')
        .create()
      const dst = builders
        .metadata()
        .path('dst')
        .remoteId(originalSrc.remote._id)
        .remoteRev(2)
        .build()

      move('remote', src, dst)

      should(_.get(dst, 'moveFrom.remote._rev')).equal(
        _.get(dst, 'remote._rev')
      )
    })

    it('does not refresh the move snapshot of another remote document', async () => {
      // The change merged at the destination is for another remote document
      // (e.g. an overwriting move): its revision must not leak into the move
      // snapshot of the moved document.
      const originalSrc = await builders
        .metadata()
        .path('src')
        .upToDate()
        .create()
      const src = await builders
        .metadata()
        .moveFrom(originalSrc)
        .path('src*')
        .changedSide('remote')
        .create()
      const dst = builders
        .metadata()
        .path('dst')
        .remoteId('other-remote-id')
        .remoteRev(9)
        .build()

      move('remote', src, dst)

      should(_.get(dst, 'moveFrom.remote._rev')).equal(originalSrc.remote._rev)
    })
  })

  describe('convertToDestinationAddition', () => {
    const side = 'local'
    let src, dst

    beforeEach(async () => {
      src = await builders
        .metadata()
        .path('src')
        .upToDate()
        .create()
      dst = builders
        .metadata()
        .moveFrom(src)
        .path('destination')
        .changedSide(side)
        .build()
    })

    it('updates the source document', () => {
      move.convertToDestinationAddition(side, src, dst, { updateSide: false })
      should(dst._id).eql(src._id)
    })

    it('marks the document as newly added on `side`', () => {
      move.convertToDestinationAddition(side, src, dst, { updateSide: false })
      should(dst.sides).deepEqual({ target: 1, [side]: 1 })
    })

    it('removes move hints', () => {
      move.convertToDestinationAddition(side, src, dst, { updateSide: false })
      should(dst).not.have.property('moveFrom')
    })

    it('updates the given side path if requested', () => {
      // XXX: we convert to an addition on the other side here because the move
      // already updated `side` with the destination path and we wouldn't be
      // testing much.
      move.convertToDestinationAddition(otherSide(side), src, dst, {
        updateSide: true
      })
      should(dst[otherSide(side)].path).deepEqual(
        pathUtils.localToRemote(dst.path)
      )
    })
  })
})
