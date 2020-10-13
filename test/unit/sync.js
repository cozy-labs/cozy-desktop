/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const sinon = require('sinon')
const should = require('should')
const EventEmitter = require('events')

const { Ignore } = require('../../core/ignore')
const metadata = require('../../core/metadata')
const { otherSide } = require('../../core/side')
const Sync = require('../../core/sync')

const stubSide = require('../support/doubles/side')
const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')
const Builders = require('../support/builders')
const dbBuilders = require('../support/builders/db')

describe('Sync', function() {
  before('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  beforeEach('instanciate sync', function() {
    this.local = stubSide()
    this.remote = stubSide()
    this.ignore = new Ignore(['ignored'])
    this.events = new EventEmitter()
    this.sync = new Sync(
      this.pouch,
      this.local,
      // $FlowFixMe the remote stub is not recognized as a Remote instance
      this.remote,
      this.ignore,
      this.events
    )
  })

  let builders
  beforeEach('prepare builders', function() {
    builders = new Builders(this)
  })

  describe('start', function() {
    beforeEach('instanciate sync', function() {
      this.local.start = sinon.stub().resolves()
      this.local.watcher.running = sinon.stub().resolves()
      this.local.stop = sinon.stub().resolves()
      this.remote.start = sinon.stub().resolves()
      this.remote.watcher.running = sinon.stub().resolves()
      this.remote.stop = sinon.stub().resolves()
      this.sync.sync = sinon.stub().rejects(new Error('stopped'))
      sinon.spy(this.sync, 'stop')
      sinon.spy(this.sync.events, 'emit')
    })

    it('starts the metadata replication of both sides', async function() {
      await this.sync.start()
      should(this.local.start).have.been.calledOnce()
      should(this.remote.start).have.been.calledOnce()
      should(this.sync.sync).have.been.calledOnce()
    })

    context('if local watcher fails to start', () => {
      beforeEach(function() {
        this.local.start = sinon.stub().rejects(new Error('failed'))
      })

      it('does not start replication', async function() {
        await this.sync.start()
        should(this.sync.sync).not.have.been.called()
      })

      it('does not start remote watcher', async function() {
        await this.sync.start()
        should(this.remote.start).not.have.been.called()
      })

      it('stops local watcher', async function() {
        await this.sync.start()
        should(this.local.stop).have.been.calledOnce()
      })

      it('emits a sync error', async function() {
        await this.sync.start()
        should(this.sync.events.emit).have.been.calledWith('sync-error')
      })
    })

    context('if remote watcher fails to start', () => {
      beforeEach(function() {
        this.remote.start = sinon.stub().rejects(new Error('failed'))
      })

      it('does not start replication', async function() {
        await this.sync.start()
        should(this.sync.sync).not.have.been.called()
      })

      it('starts local watcher', async function() {
        await this.sync.start()
        should(this.local.start).have.been.calledOnce()
      })

      it('stops local watcher', async function() {
        await this.sync.start()
        should(this.local.stop).have.been.calledOnce()
      })

      it('stops remote watcher', async function() {
        await this.sync.start()
        should(this.remote.stop).have.been.calledOnce()
      })

      it('emits a sync error', async function() {
        await this.sync.start()
        should(this.sync.events.emit).have.been.calledWith('sync-error')
      })
    })

    context('if local watcher rejects while running', () => {
      beforeEach(function() {
        this.local.watcher.running = sinon.stub().rejects(new Error('failed'))
      })

      it('stops replication', async function() {
        await this.sync.start()
        should(this.sync.stop).have.been.calledOnce()
      })

      it('stops local watcher', async function() {
        await this.sync.start()
        should(this.local.stop).have.been.calledOnce()
      })

      it('stops remote watcher', async function() {
        await this.sync.start()
        should(this.remote.stop).have.been.calledOnce()
      })

      it('emits a sync error', async function() {
        await this.sync.start()
        should(this.sync.events.emit).have.been.calledWith('sync-error')
      })
    })
  })

  // TODO: Test lock request/acquisition/release

  describe('sync', function() {
    beforeEach('stub lifecycle', function() {
      this.sync.events = new EventEmitter()
      this.sync.lifecycle.end('start')
    })
    afterEach('restore lifecycle', function() {
      this.sync.events.emit('stopped')
      delete this.sync.events
      this.sync.lifecycle.end('stop')
    })

    it('waits for and applies available changes', async function() {
      const apply = sinon.stub(this.sync, 'apply')
      apply.callsFake(change => this.pouch.setLocalSeq(change.seq))

      const doc1 = await builders
        .metafile()
        .path('doc1')
        .sides({ local: 1 })
        .create()
      const doc2 = await builders
        .metadir()
        .path('doc2')
        .sides({ remote: 1 })
        .create()

      await this.sync.sync()

      should(apply).have.been.calledTwice()
      should(apply.args[0][0].doc).have.properties(doc1)
      should(apply.args[1][0].doc).have.properties(doc2)
    })
  })

  describe('apply', function() {
    it('does nothing for an ignored document', async function() {
      const change = {
        seq: 121,
        doc: await builders
          .metadir()
          .path('ignored')
          .sides({ local: 1 })
          .create()
      }
      this.sync.applyDoc = sinon.spy()
      await this.sync.apply(change)
      should(this.sync.applyDoc).have.not.been.called()
    })

    it('does nothing for an up-to-date document', async function() {
      const change = {
        seq: 122,
        doc: await builders
          .metadir()
          .path('foo')
          .upToDate()
          .create()
      }
      this.sync.applyDoc = sinon.spy()
      await this.sync.apply(change)
      should(this.sync.applyDoc).have.not.been.called()
    })

    it('does nothing for an up-to-date _deleted document', async function() {
      const change = {
        seq: 122,
        doc: await builders
          .metadir()
          .path('foo')
          .erased()
          .upToDate()
          .create()
      }
      this.sync.applyDoc = sinon.spy()
      await this.sync.apply(change)
      should(this.sync.applyDoc).have.not.been.called()
    })

    it('trashes a locally deleted file or folder', async function() {
      const change = {
        seq: 145,
        doc: await builders
          .metadata()
          .path('foo')
          .trashed()
          .changedSide('local')
          .create()
      }

      this.sync.trashWithParentOrByItself = sinon.stub().resolves(true)
      await this.sync.apply(change)
      should(this.sync.trashWithParentOrByItself).have.been.called()
    })

    it('calls applyDoc for a modified file', async function() {
      const initial = await builders
        .metafile()
        .path('foo/bar')
        .data('initial content')
        .upToDate()
        .create()

      const change = {
        seq: 123,
        doc: await builders
          .metafile(initial)
          .overwrite(initial)
          .data('updated content')
          .changedSide('local')
          .create()
      }
      await this.sync.apply(change)
      should(await this.pouch.db.get(change.doc._id)).have.properties({
        path: initial.path,
        docType: 'file',
        sides: {
          target: 4,
          local: 4,
          remote: 4
        }
      })
      should(await this.pouch.getLocalSeq()).equal(123)
    })

    it('calls applyDoc for a modified folder', async function() {
      const initial = await builders
        .metadir()
        .path('foo/baz')
        .upToDate()
        .create()

      const change = {
        seq: 124,
        doc: await builders
          .metadir(initial)
          .tags('qux')
          .changedSide('local')
          .create()
      }
      await this.sync.apply(change)
      should(await this.pouch.db.get(change.doc._id)).have.properties({
        path: initial.path,
        docType: 'folder',
        sides: {
          target: 4,
          local: 4,
          remote: 4
        }
      })
      should(await this.pouch.getLocalSeq()).equal(124)
    })

    it('calls addFileAsync for an added file', async function() {
      const doc = await builders
        .metafile()
        .path('foo/bar')
        .data('file content')
        .sides({ local: 1 })
        .create()
      await this.sync.applyDoc(doc, this.remote, 'remote', 0)
      this.remote.addFileAsync.calledWith(doc).should.be.true()
    })

    it('calls overwriteFileAsync for an overwritten file', async function() {
      const initial = await builders
        .metafile()
        .path('overwrite/foo/bar')
        .data('initial content')
        .upToDate()
        .create()
      const doc = await builders
        .metafile(initial)
        .overwrite(initial)
        .data('updated content')
        .changedSide('local')
        .create()
      await this.sync.applyDoc(doc, this.remote, 'remote', 1)
      this.remote.updateFileMetadataAsync.called.should.be.false()
      this.remote.overwriteFileAsync.calledWith(doc).should.be.true()
    })

    describe('local file update', () => {
      const previousSeq = 759
      const seq = previousSeq + 1

      let file, merged

      beforeEach('set up merged local file update', async function() {
        file = await builders
          .metafile()
          .upToDate()
          .data('initial content')
          .create()
        merged = await builders
          .metafile(file)
          .changedSide('local')
          .data('updated content')
          .create()

        await this.pouch.setLocalSeq(previousSeq)
      })

      const applyChange = async function() {
        await this.sync.apply({ seq, doc: _.cloneDeep(merged) })
      }

      describe('when .remote#overwriteFileAsync() throws status 412', () => {
        beforeEach('simulate error 412', function() {
          this.remote.overwriteFileAsync.rejects({ status: 412 })
        })
        beforeEach(applyChange)

        it('keeps sides unchanged', async function() {
          const synced = await this.pouch.db.get(file._id)
          should(synced.sides).deepEqual(merged.sides)
        })

        it('saves seq to skip the change', async function() {
          should(await this.pouch.getLocalSeq()).equal(seq)
        })
      })
    })

    it('calls updateFileMetadataAsync with previous revision for updated file metadata', async function() {
      const doc = await builders
        .metafile()
        .path('udpate/foo/without-errors')
        .sides({ local: 1 })
        .noRemote()
        .create()
      const synced = await builders
        .metafile(doc)
        .upToDate()
        .remoteId(dbBuilders.id())
        .create()
      const updated = await builders
        .metafile(synced)
        .tags('courge')
        .changedSide('local')
        .create()

      await this.sync.applyDoc(
        updated,
        this.remote,
        'remote',
        updated.sides.remote
      )
      should(this.remote.overwriteFileAsync).not.be.called()
      should(this.remote.updateFileMetadataAsync).be.calledWith(updated)
    })

    it('calls moveAsync for a moved file', async function() {
      const was = await builders
        .metafile()
        .path('foo/bar')
        .moveTo('foo/baz')
        .tags('qux')
        .changedSide('local')
        .create()
      const doc = await builders
        .metafile()
        .moveFrom(was)
        .path('foo/baz')
        .create()

      await this.sync.applyDoc(was, this.remote, 'remote', 2)
      should(this.remote.trashAsync).not.have.been.called()
      await this.sync.applyDoc(doc, this.remote, 'remote', 0)
      should(this.remote.addFileAsync).not.have.been.called()
      should(this.remote.moveAsync).have.been.calledWith(doc, was)
    })

    it('calls moveAsync and overwriteFileAsync for a moved-updated file', async function() {
      const was = await builders
        .metafile()
        .path('foo/bar')
        .data('initial content')
        .moveTo('foo/baz')
        .tags('qux')
        .changedSide('local')
        .create()
      const doc = await builders
        .metafile()
        .moveFrom(was)
        .path('foo/baz')
        .data('updated content')
        .changedSide('local')
        .create()

      await this.sync.applyDoc(was, this.remote, 'remote', 2)
      should(this.remote.trashAsync).not.have.been.called()
      await this.sync.applyDoc(doc, this.remote, 'remote', 0)
      should(this.remote.addFileAsync).not.have.been.called()
      should(this.remote.moveAsync).have.been.calledWith(doc, was)
      should(this.remote.overwriteFileAsync).have.been.calledWith(doc)
    })

    it('does not break when move works but not update', async function() {
      const was = await builders
        .metafile()
        .path('foo/bar2')
        .moveTo('foo/baz2')
        .data('initial content')
        .tags('qux')
        .changedSide('local')
        .create()
      const doc = await builders
        .metafile()
        .moveFrom(was)
        .path('foo/baz2')
        .data('updated content')
        .changedSide('local')
        .create()

      // re-stubs overwriteFileAsync to fail
      this.remote.overwriteFileAsync = sinon
        .stub()
        .rejects(new Error('bad md5sum mock'))
      this.sync.diskUsage = sinon.stub().resolves()

      await this.sync.apply({ doc: doc }, this.remote, 'remote', 0)

      this.remote.addFileAsync.called.should.be.false()
      this.remote.trashAsync.called.should.be.false()
      this.remote.moveAsync.calledWith(doc, was).should.be.true()
      this.remote.overwriteFileAsync.calledWith(doc).should.be.true()

      const newMetadata = await this.pouch.db.get(doc._id)
      should(newMetadata).not.have.property('moveFrom')
      should(newMetadata).have.property('errors')

      // restore
      this.remote.overwriteFileAsync = sinon.stub().resolves()
    })

    it('calls trashAsync for a deleted synced file', async function() {
      const doc = await builders
        .metafile()
        .path('foo/baz')
        .deleted()
        .changedSide('remote')
        .create()
      await this.sync.applyDoc(doc, this.local, 'local', 1)
      this.local.trashAsync.calledWith(doc).should.be.true()
    })

    it('does nothing for a deleted file that was not synced', async function() {
      const doc = await builders
        .metafile()
        .path('tmp/fooz')
        .deleted()
        .sides({ local: 2 })
        .create()
      await this.sync.applyDoc(doc, this.remote, 'remote', 0)
      this.remote.trashAsync.called.should.be.false()
    })

    it('calls addFolderAsync for an added folder', async function() {
      const doc = await builders
        .metadir()
        .path('foobar/bar')
        .sides({ local: 1 })
        .create()
      await this.sync.applyDoc(doc, this.remote, 'remote', 0)
      this.remote.addFolderAsync.calledWith(doc).should.be.true()
    })

    it('calls updateFolderAsync for an updated folder', async function() {
      const initial = await builders
        .metadir()
        .path('foobar/baz')
        .upToDate()
        .create()
      const doc = await builders
        .metadir(initial)
        .tags('qux')
        .changedSide('remote')
        .create()
      await this.sync.applyDoc(doc, this.local, 'local', 2)
      this.local.updateFolderAsync.calledWith(doc).should.be.true()
    })

    it('calls moveAsync for a moved folder', async function() {
      const was = await builders
        .metadir()
        .path('foobar/bar')
        .tags('qux')
        .moveTo('foobar/baz')
        .changedSide('local')
        .create()
      const doc = await builders
        .metadir()
        .moveFrom(was)
        .path('foobar/baz')
        .changedSide('local')
        .create()
      await this.sync.applyDoc(was, this.remote, 'remote', 2)
      should(this.remote.trashAsync).not.have.been.called()
      await this.sync.applyDoc(doc, this.remote, 'remote', 0)
      should(this.remote.addFolderAsync).not.have.been.called()
      should(this.remote.moveAsync).have.been.calledWith(doc, was)
    })

    it('calls trashAsync for a deleted synced folder', async function() {
      const doc = await builders
        .metadir()
        .path('foobar/baz')
        .deleted()
        .changedSide('remote')
        .create()
      await this.sync.applyDoc(doc, this.local, 'local', 1)
      this.local.deleteFolderAsync.calledWith(doc).should.be.true()
    })

    it('does nothing for a deleted folder that was not added', async function() {
      const doc = await builders
        .metadir()
        .path('tmp/foobaz')
        .deleted()
        .sides({ local: 2 })
        .create()
      await this.sync.applyDoc(doc, this.remote, 'remote', 0)
      this.remote.trashAsync.called.should.be.false()
    })
  })

  describe('updateErrors', function() {
    it('retries on first local -> remote sync error', async function() {
      const doc = await builders
        .metadata()
        .path('first/failure')
        .sides({ local: 1 })
        .create()

      await this.sync.updateErrors({ doc }, 'remote')

      const actual = await this.pouch.db.get(doc._id)
      should(actual.errors).equal(1)
      should(actual._rev).not.equal(doc._rev)
      should(actual.sides).deepEqual({ target: 2, local: 2 })
      should(metadata.isUpToDate('local', actual)).be.true()
    })

    it('retries on second remote -> local sync error', async function() {
      const doc = await builders
        .metadata()
        .path('second/failure')
        .errors(1)
        .sides({ local: 2, remote: 4 })
        .create()

      await this.sync.updateErrors({ doc }, 'local')

      const actual = await this.pouch.db.get(doc._id)
      should(actual.errors).equal(2)
      should(actual._rev).not.equal(doc._rev)
      should(actual.sides).deepEqual({ target: 5, local: 2, remote: 5 })
      should(metadata.isUpToDate('remote', actual)).be.true()
    })

    it('stops retrying after 3 errors', async function() {
      const doc = await builders
        .metadata()
        .path('third/failure')
        .errors(3)
        .sides({ remote: 4 })
        .create()

      await this.sync.updateErrors({ doc }, 'local')

      const actual = await this.pouch.db.get(doc._id)
      should(actual.errors).equal(3)
      should(actual._rev).equal(doc._rev)
      should(metadata.isUpToDate('remote', actual)).be.true()
    })
  })

  for (const syncSide of ['local', 'remote']) {
    describe(`updateRevs at end of ${syncSide} Sync`, function() {
      const mergedSide = otherSide(syncSide)

      const updateRevs = ({ sync }, doc) =>
        sync.updateRevs(_.cloneDeep(doc), syncSide)

      let doc, upToDate, syncedTarget, mergedTarget

      beforeEach(async function() {
        upToDate = await builders
          .metadata()
          .upToDate() // 2, 2
          .create()
        syncedTarget = upToDate.sides[syncSide] // 2
        mergedTarget = upToDate.sides[mergedSide] + 1 // 3
        doc = await builders
          .metadata(upToDate)
          .sides({
            [syncSide]: syncedTarget, // 2
            [mergedSide]: mergedTarget // 3
          })
          .create() // rev == 3
      })

      context('without changes merged during Sync', function() {
        it('marks doc as up-to-date', async function() {
          await updateRevs(this, doc)

          const updated = await this.pouch.db.get(doc._id)
          should(metadata.outOfDateSide(updated)).be.undefined()
          should(metadata.target(updated)).equal(metadata.target(doc) + 1)
        })
      })

      for (const extraChanges of [1, 2]) {
        context(
          `with ${extraChanges} ${mergedSide} changes merged during Sync`,
          function() {
            let updated

            beforeEach(async function() {
              await builders
                .metadata(doc)
                .sides({
                  [syncSide]: syncedTarget, // 2
                  [mergedSide]: mergedTarget + extraChanges // 3 + extra
                })
                .create() // rev == 3 + extra

              await updateRevs(this, doc) // rev == 4, syncSide == 3, mergedSide == 4 + extra - 1

              updated = await this.pouch.db.get(doc._id)
            })

            it(`keeps ${syncSide} out-of-date information`, async function() {
              should(metadata.outOfDateSide(updated)).equal(syncSide)
            })

            it('keeps the changes difference between sides', () => {
              should(metadata.side(updated, mergedSide)).equal(
                metadata.side(updated, syncSide) + extraChanges
              )
            })

            it(`keeps the doc rev coherent with its ${mergedSide} side`, async function() {
              should(metadata.target(updated)).equal(
                metadata.side(updated, mergedSide)
              )
            })
          }
        )
      }
    })
  }

  describe('selectSide', function() {
    it('selects the local side if remote is up-to-date', function() {
      const doc1 = builders
        .metafile()
        .path('selectSide/1')
        .sides({ remote: 1 })
        .build()
      let [side, name, rev] = this.sync.selectSide(doc1)
      side.should.equal(this.sync.local)
      name.should.equal('local')
      rev.should.equal(0)

      const doc2 = builders
        .metafile()
        .path('selectSide/2')
        .sides({ local: 2, remote: 3 })
        .build()
      ;[side, name, rev] = this.sync.selectSide(doc2)
      side.should.equal(this.sync.local)
      name.should.equal('local')
      rev.should.equal(2)
    })

    it('selects the remote side if local is up-to-date', function() {
      const doc1 = builders
        .metafile()
        .path('selectSide/3')
        .sides({ local: 1 })
        .build()
      let [side, name, rev] = this.sync.selectSide(doc1)
      side.should.equal(this.sync.remote)
      name.should.equal('remote')
      rev.should.equal(0)

      const doc2 = builders
        .metafile()
        .path('selectSide/4')
        .sides({ local: 4, remote: 3 })
        .build()
      ;[side, name, rev] = this.sync.selectSide(doc2)
      side.should.equal(this.sync.remote)
      name.should.equal('remote')
      rev.should.equal(3)
    })

    it('returns an empty array if both sides are up-to-date', function() {
      const doc = builders
        .metafile()
        .path('selectSide/5')
        .sides({ local: 5, remote: 5 })
        .build()
      let [side, name, rev] = this.sync.selectSide(doc)
      should.not.exist(side)
      should.not.exist(name)
      should.not.exist(rev)
    })

    it('returns an empty array if a local only doc is erased', function() {
      const doc = builders
        .metafile()
        .path('selectSide/5')
        .erased()
        .sides({ local: 5 })
        .build()
      should(this.sync.selectSide(doc)).deepEqual([])
    })

    it('returns an empty array if a remote only doc is erased', function() {
      const doc = builders
        .metafile()
        .path('selectSide/5')
        .erased()
        .sides({ remote: 5 })
        .build()
      should(this.sync.selectSide(doc)).deepEqual([])
    })
  })
})
