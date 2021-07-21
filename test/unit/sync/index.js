/* eslint-env mocha */
/* @flow */

const _ = require('lodash')
const sinon = require('sinon')
const should = require('should')
const EventEmitter = require('events')
const { Promise } = require('bluebird')
const { FetchError } = require('cozy-stack-client')

const { Ignore } = require('../../../core/ignore')
const metadata = require('../../../core/metadata')
const { otherSide } = require('../../../core/side')
const { Sync, compareChanges } = require('../../../core/sync')
const remoteErrors = require('../../../core/remote/errors')
const syncErrors = require('../../../core/sync/errors')

const stubSide = require('../../support/doubles/side')
const configHelpers = require('../../support/helpers/config')
const pouchHelpers = require('../../support/helpers/pouch')
const Builders = require('../../support/builders')
const dbBuilders = require('../../support/builders/db')

/*::
import type { SavedMetadata } from '../../../core/metadata'
*/

const localSyncError = (msg, doc) =>
  new syncErrors.SyncError({
    code: syncErrors.UNKNOWN_SYNC_ERROR_CODE,
    sideName: 'local',
    err: new Error('Original simulated local error'),
    doc
  })

const remoteSyncError = (msg, doc) =>
  new syncErrors.SyncError({
    code: syncErrors.UNKNOWN_SYNC_ERROR_CODE,
    sideName: 'remote',
    err: new remoteErrors.RemoteError({
      code: remoteErrors.UNKNOWN_REMOTE_ERROR_CODE,
      err: new Error('Original simulated remote error')
    }),
    doc
  })

describe('Sync', function() {
  before('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  beforeEach('instanciate sync', function() {
    this.local = stubSide('local')
    this.remote = stubSide('remote')
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

  afterEach(async function() {
    await this.sync.stop()
  })

  let builders
  beforeEach('prepare builders', function() {
    builders = new Builders(this)
  })

  describe('start', function() {
    beforeEach('instanciate sync', function() {
      this.local.start = sinon.stub().resolves()
      this.local.watcher.running = Promise.resolve()
      this.local.stop = sinon.stub().resolves()
      this.remote.start = sinon.stub().resolves()
      this.remote.watcher.running = true
      this.remote.watcher.onError = sinon.stub().returns()
      this.remote.watcher.onFatal = sinon.stub().returns()
      this.remote.stop = sinon.stub().resolves()
      this.sync.sync = sinon.stub().resolves()
      sinon.spy(this.sync, 'stop')
      sinon.spy(this.sync.events, 'emit')
    })

    it('starts the metadata replication of both sides', async function() {
      this.sync.start()
      await this.sync.started()
      should(this.local.start).have.been.calledOnce()
      should(this.remote.start).have.been.calledOnce()
      should(this.sync.sync).have.been.called()
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

      it('emits a Sync:fatal event', async function() {
        await this.sync.start()
        should(this.sync.events.emit).have.been.calledWith('Sync:fatal')
      })
    })

    context('if remote watcher fails to start', () => {
      beforeEach(function() {
        this.remote.start = sinon.stub().callsFake(() => {
          this.remote.watcher.fatal(new Error('failed'))
        })
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

      it('emits a Sync:fatal event', async function() {
        await this.sync.start()
        should(this.sync.events.emit).have.been.calledWith('Sync:fatal')
      })
    })

    context('if local watcher rejects while running', () => {
      let rejectLocalWatcher
      beforeEach(async function() {
        this.local.watcher.running = new Promise((resolve, reject) => {
          rejectLocalWatcher = reject
        })
        this.sync.start()
        await this.sync.started()
      })

      it('stops replication', async function() {
        rejectLocalWatcher(new Error('failed'))
        await this.sync.stopped()
        should(this.sync.stop).have.been.calledOnce()
      })

      it('stops local watcher', async function() {
        rejectLocalWatcher(new Error('failed'))
        await this.sync.stopped()
        should(this.local.stop).have.been.calledOnce()
      })

      it('stops remote watcher', async function() {
        rejectLocalWatcher(new Error('failed'))
        await this.sync.stopped()
        should(this.remote.stop).have.been.calledOnce()
      })

      it('emits a Sync:fatal event', async function() {
        rejectLocalWatcher(new Error('failed'))
        await this.sync.stopped()
        should(this.sync.events.emit).have.been.calledWith('Sync:fatal')
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

    it('trashes a locally deleted file', async function() {
      const change = {
        seq: 145,
        doc: await builders
          .metafile()
          .path('foo')
          .trashed()
          .changedSide('local')
          .create()
      }

      this.remote.trashAsync = sinon.stub().resolves(true)
      sinon.spy(this.sync, 'trashWithParentOrByItself')
      try {
        await this.sync.apply(change)
        should(this.sync.trashWithParentOrByItself).have.been.calledWith(
          change.doc,
          this.remote
        )
        should(this.remote.trashAsync)
          .have.been.calledOnce()
          .and.calledWith(change.doc)
      } finally {
        this.sync.trashWithParentOrByItself.restore()
      }
    })

    it('trashes a locally deleted folder with content', async function() {
      await builders
        .metadata()
        .path('foo/bar')
        .trashed()
        .changedSide('local')
        .create()
      const deletedParent = await builders
        .metadir()
        .path('foo')
        .trashed()
        .changedSide('local')
        .create()
      const change = {
        seq: 145,
        doc: deletedParent
      }

      this.remote.trashAsync = sinon.stub().resolves(true)
      sinon.spy(this.sync, 'trashWithParentOrByItself')
      try {
        await this.sync.apply(change)
        should(this.sync.trashWithParentOrByItself).have.been.calledWith(
          deletedParent,
          this.remote
        )
        should(this.remote.trashAsync)
          .have.been.calledOnce()
          .and.calledWith(deletedParent)
      } finally {
        this.sync.trashWithParentOrByItself.restore()
      }
    })

    it('does not trash a locally deleted file if its parent is deleted', async function() {
      const deletedChild = await builders
        .metadata()
        .path('foo/bar')
        .trashed()
        .changedSide('local')
        .create()
      await builders
        .metadir()
        .path('foo')
        .trashed()
        .changedSide('local')
        .create()
      const change = {
        seq: 145,
        doc: deletedChild
      }

      this.remote.trashAsync = sinon.stub().resolves(true)
      sinon.spy(this.sync, 'trashWithParentOrByItself')
      try {
        await this.sync.apply(change)
        should(this.sync.trashWithParentOrByItself).have.been.calledWith(
          deletedChild,
          this.remote
        )
        should(this.remote.trashAsync).not.have.been.called()
      } finally {
        this.sync.trashWithParentOrByItself.restore()
      }
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
          .noRecord() // XXX: Prevent Pouch conflict from reusing `initial`'s _id
          .create()
      }
      await this.sync.apply(change)
      should(await this.pouch.bySyncedPath(change.doc.path)).have.properties({
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
      should(await this.pouch.bySyncedPath(change.doc.path)).have.properties({
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
      await this.sync.applyDoc(doc, this.remote, 'remote')
      should(this.remote.addFileAsync).have.been.calledWith(doc)
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
        .noRecord() // XXX: Prevent Pouch conflict from reusing `initial`'s _id
        .create()
      await this.sync.applyDoc(doc, this.remote, 'remote')
      should(this.remote.updateFileMetadataAsync).not.have.been.called()
      should(this.remote.overwriteFileAsync).have.been.calledWith(doc)
    })

    describe('local file update', () => {
      const previousSeq = 759
      const seq = previousSeq + 1
      const sideName = 'local'

      let file, merged, change

      beforeEach('set up merged local file update', async function() {
        file = await builders
          .metafile()
          .upToDate()
          .data('initial content')
          .create()
        merged = await builders
          .metafile(file)
          .changedSide(sideName)
          .data('updated content')
          .create()

        await this.pouch.setLocalSeq(previousSeq)

        change = { seq, doc: _.cloneDeep(merged) }
        sinon.stub(this.sync, 'getNextChanges').returns([change])
      })
      afterEach(function() {
        this.sync.getNextChanges.restore()
      })

      describe('when apply throws a NEEDS_REMOTE_MERGE_CODE error', () => {
        beforeEach(function() {
          sinon.stub(this.sync, 'blockSyncFor').callsFake(() => {
            this.sync.lifecycle.end('stop')
          })
        })
        beforeEach('simulate error', async function() {
          this.sync.lifecycle.end('start')
          sinon.stub(this.sync, 'apply').rejects(
            new syncErrors.SyncError({
              code: remoteErrors.NEEDS_REMOTE_MERGE_CODE,
              sideName,
              err: new FetchError(
                { status: 412 },
                {
                  errors: [{ status: 412, source: { parameter: 'If-Match' } }]
                }
              ),
              doc: change.doc
            })
          )
          await this.sync.syncBatch()
          this.sync.apply.restore()
        })
        afterEach(function() {
          this.sync.blockSyncFor.restore()
        })

        it('removes moveFrom and overwrite attributes', async function() {
          should(change.doc).not.have.properties(['moveFrom', 'overwrite'])
        })

        it('blocks the synchronization so we can retry applying the change', async function() {
          should(this.sync.blockSyncFor).have.been.calledOnce()
          should(this.sync.blockSyncFor).have.been.calledWithMatch({
            err: { code: remoteErrors.NEEDS_REMOTE_MERGE_CODE },
            change
          })
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

      await this.sync.applyDoc(updated, this.remote, 'remote')
      should(this.remote.overwriteFileAsync).not.have.been.called()
      should(this.remote.updateFileMetadataAsync).have.been.calledWith(updated)
    })

    it('calls moveAsync for a moved file', async function() {
      const was = await builders
        .metafile()
        .path('foo/bar')
        .tags('qux')
        .changedSide('local')
        .create()
      const doc = await builders
        .metafile()
        .moveFrom(was)
        .path('foo/baz')
        .create()

      await this.sync.applyDoc(was, this.remote, 'remote')
      should(this.remote.trashAsync).not.have.been.called()
      await this.sync.applyDoc(doc, this.remote, 'remote')
      should(this.remote.addFileAsync).not.have.been.called()
      should(this.remote.moveAsync).have.been.calledWith(doc, was)
    })

    it('calls moveAsync and overwriteFileAsync for a moved-updated file', async function() {
      const was = await builders
        .metafile()
        .path('foo/bar')
        .data('initial content')
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

      await this.sync.applyDoc(was, this.remote, 'remote')
      should(this.remote.trashAsync).not.have.been.called()
      await this.sync.applyDoc(doc, this.remote, 'remote')
      should(this.remote.addFileAsync).not.have.been.called()
      should(this.remote.moveAsync).have.been.calledWith(doc, was)
      should(this.remote.overwriteFileAsync).have.been.calledWith(doc)
    })

    it('calls trashAsync for a deleted synced file', async function() {
      const doc = await builders
        .metafile()
        .path('foo')
        .deleted()
        .changedSide('remote')
        .create()
      await this.sync.applyDoc(doc, this.local, 'local')
      should(this.local.trashAsync).have.been.calledWith(doc)
    })

    it('does nothing for a deleted file that was not synced', async function() {
      const doc = await builders
        .metafile()
        .path('tmp/fooz')
        .deleted()
        .sides({ local: 2 })
        .create()
      await this.sync.applyDoc(doc, this.remote, 'remote')
      should(this.remote.trashAsync).not.have.been.called()
    })

    it('calls addFolderAsync for an added folder', async function() {
      const doc = await builders
        .metadir()
        .path('foobar/bar')
        .sides({ local: 1 })
        .create()
      await this.sync.applyDoc(doc, this.remote, 'remote', 0)
      this.remote.addFolderAsync.calledWith(doc).should.be.true()
      await this.sync.applyDoc(doc, this.remote, 'remote')
      should(this.remote.addFolderAsync).have.been.calledWith(doc)
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
      await this.sync.applyDoc(doc, this.local, 'local')
      should(this.local.updateFolderAsync).have.been.calledWith(doc)
    })

    it('calls moveAsync for a moved folder', async function() {
      const was = await builders
        .metadir()
        .path('foobar/bar')
        .tags('qux')
        .changedSide('local')
        .create()
      const doc = await builders
        .metadir()
        .moveFrom(was)
        .path('foobar/baz')
        .changedSide('local')
        .create()
      await this.sync.applyDoc(was, this.remote, 'remote')
      should(this.remote.trashAsync).not.have.been.called()
      await this.sync.applyDoc(doc, this.remote, 'remote')
      should(this.remote.addFolderAsync).not.have.been.called()
      should(this.remote.moveAsync).have.been.calledWith(doc, was)
    })

    it('calls trashAsync for a deleted synced folder', async function() {
      const doc = await builders
        .metadir()
        .path('baz')
        .deleted()
        .changedSide('remote')
        .create()
      await this.sync.applyDoc(doc, this.local, 'local')
      should(this.local.trashAsync).have.been.calledWith(doc)
    })

    it('does nothing for a deleted folder that was not added', async function() {
      const doc = await builders
        .metadir()
        .path('tmp/foobaz')
        .deleted()
        .sides({ local: 2 })
        .create()
      await this.sync.applyDoc(doc, this.remote, 'remote')
      should(this.remote.trashAsync).not.have.been.called()
    })
  })

  describe('updateErrors', function() {
    it('retries on first local -> remote sync error', async function() {
      const doc = await builders
        .metadata()
        .path('first/failure')
        .sides({ local: 1 })
        .create()

      await this.sync.updateErrors(
        { doc },
        remoteSyncError('simulated error', doc)
      )

      const actual = await this.pouch.bySyncedPath(doc.path)
      should(actual.errors).equal(1)
      should(actual._rev).not.equal(doc._rev)
    })

    it('retries on second remote -> local sync error', async function() {
      const doc = await builders
        .metadata()
        .path('second/failure')
        .errors(1)
        .sides({ local: 2, remote: 4 })
        .create()

      await this.sync.updateErrors(
        { doc },
        localSyncError('simulated error', doc)
      )

      const actual = await this.pouch.bySyncedPath(doc.path)
      should(actual.errors).equal(2)
      should(actual._rev).not.equal(doc._rev)
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
          await updateRevs(this, _.cloneDeep(doc))

          const updated = await this.pouch.bySyncedPath(doc.path)
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

              updated = await this.pouch.bySyncedPath(doc.path)
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
      should(this.sync.selectSide({ doc: doc1 })).eql(this.sync.local)

      const doc2 = builders
        .metafile()
        .path('selectSide/2')
        .sides({ local: 2, remote: 3 })
        .build()
      should(this.sync.selectSide({ doc: doc2 })).eql(this.sync.local)
    })

    it('selects the remote side if local is up-to-date', function() {
      const doc1 = builders
        .metafile()
        .path('selectSide/3')
        .sides({ local: 1 })
        .build()
      should(this.sync.selectSide({ doc: doc1 })).eql(this.sync.remote)

      const doc2 = builders
        .metafile()
        .path('selectSide/4')
        .sides({ local: 4, remote: 3 })
        .build()
      should(this.sync.selectSide({ doc: doc2 })).eql(this.sync.remote)
    })

    it('returns an empty array if both sides are up-to-date', function() {
      const doc = builders
        .metafile()
        .path('selectSide/5')
        .sides({ local: 5, remote: 5 })
        .build()
      should(this.sync.selectSide({ doc })).be.null()
    })

    it('returns an empty array if a local only doc is erased', function() {
      const doc = builders
        .metafile()
        .path('selectSide/5')
        .erased()
        .sides({ local: 5 })
        .build()
      should(this.sync.selectSide({ doc })).be.null()
    })

    it('returns an empty array if a remote only doc is erased', function() {
      const doc = builders
        .metafile()
        .path('selectSide/5')
        .erased()
        .sides({ remote: 5 })
        .build()
      should(this.sync.selectSide({ doc })).be.null()
    })
  })

  describe('blockSyncFor', () => {
    beforeEach(function() {
      sinon.spy(this.events, 'emit')
      this.remote.watcher = {
        start: sinon.stub().returns(),
        stop: sinon.stub().returns()
      }
    })
    afterEach(function() {
      delete this.remote.watcher
      this.events.emit.restore()
    })

    context('when Cozy is unreachable', () => {
      const unreachableSyncError = syncErrors.wrapError(
        new FetchError({ status: 500 }, 'UnreachableCozy test error'),
        'remote'
      )
      beforeEach(function() {
        this.sync.blockSyncFor({
          err: unreachableSyncError
        })
      })

      it('emits offline event', function() {
        should(this.events.emit).have.been.calledWith('offline')
      })

      it('stops the remote watcher', function() {
        should(this.remote.watcher.stop).have.been.called()
      })

      // If the remote watcher encounters a network issue and throws an
      // `UnreachableCozy` error while Sync has encountered a similar
      // `UnreachableCozy` error right before that, there's a risk the remote
      // watcher error will overwrite the `Sync.retryInterval` attribute with a
      // new interval without clearing the one created by the Sync error.
      // It this case we could have an endless Sync error retry loop. This test
      // checks that this does not occur.
      it('does not allow multiple retry intervals', async function() {
        const unreachableRemoteError = remoteErrors.wrapError(
          new FetchError({ status: 500 }, 'Concurrent UnreachableCozy error')
        )
        this.sync.blockSyncFor({
          err: unreachableRemoteError
        })

        // Cozy is reachable
        this.remote.ping = sinon.stub().resolves(true)

        await Promise.delay(
          // Wait for the first error retry to be called
          syncErrors.retryDelay(unreachableSyncError) +
            // Wait for the second error retry to be called
            syncErrors.retryDelay(unreachableRemoteError) +
            // Make sure the first error retry is not called anymore
            syncErrors.retryDelay(unreachableSyncError)
        )

        should(this.remote.ping).have.been.calledOnce()
      })

      describe('retry', () => {
        context('after Cozy is reachable again', () => {
          beforeEach(async function() {
            // Reset calls history
            this.events.emit.reset()

            // Cozy is reachable
            this.remote.ping = sinon.stub().resolves(true)

            // Force call to `retry`
            this.events.emit('user-action-done')
            // Wait for `retry` to run
            await Promise.delay(1000)
          })

          it('emits online event', async function() {
            should(this.events.emit).have.been.calledWith('online')
          })

          it('restarts the remote watcher', function() {
            should(this.remote.watcher.start).have.been.called()
          })
        })

        context('while Cozy is still unreachable', () => {
          beforeEach(async function() {
            // Reset calls history
            this.events.emit.reset()

            // Cozy is unreachable
            this.remote.ping = sinon.stub().resolves(false)

            // Force call to `retry`
            this.events.emit('user-action-done')
            // Wait for `retry` to run
            await Promise.delay(1000)
          })

          it('emits offline event', async function() {
            should(this.events.emit).have.been.calledWith('offline')
          })

          it('does not restart the remote watcher', function() {
            should(this.remote.watcher.start).not.have.been.called()
          })
        })
      })
    })

    context('when Sync failed to update file after moving it', () => {
      let file, merged, change

      const previousSeq = 1
      const seq = 2
      beforeEach(
        'set up merged local overwriting file move with update',
        async function() {
          const overwritten = await builders
            .metafile()
            .path('dst')
            .upToDate()
            .create()
          file = await builders
            .metafile()
            .path('src')
            .data('initial content')
            .upToDate()
            .create()
          merged = await builders
            .metafile()
            .moveFrom(file)
            .overwrite(overwritten)
            .data('updated content')
            .changedSide('local')
            .create()

          await this.pouch.setLocalSeq(previousSeq)

          // Fake removal of moveFrom and overwrite attributes as it would be
          // done when catching the overwriteFileAsync error.
          delete merged.moveFrom
          delete merged.overwrite

          change = { seq, doc: _.cloneDeep(merged) }
        }
      )

      beforeEach(function() {
        this.sync.blockSyncFor({
          err: syncErrors.wrapError(
            remoteErrors.wrapError(
              new FetchError(
                { status: 412 },
                { errors: [{ status: 412, source: { parameter: 'If-Match' } }] }
              )
            ),
            'remote',
            change
          ),
          change
        })
      })

      describe('retry', () => {
        beforeEach(async function() {
          // Reset calls history
          this.events.emit.reset()

          // Force call to `retry`
          this.events.emit('user-action-done')
          // Wait for `retry` to run
          await Promise.delay(1000)
        })

        it('increases the record errors counter', async function() {
          const errors = merged.errors || 0
          const synced = await this.pouch.bySyncedPath(merged.path)
          should(synced.errors).equal(errors + 1)
        })

        it('does not skip the change by saving seq', async function() {
          should(await this.pouch.getLocalSeq()).equal(previousSeq)
        })

        it('keeps the out-of-date side', async function() {
          const outOfDateSide = metadata.outOfDateSide(merged)
          const synced = await this.pouch.bySyncedPath(merged.path)
          should(metadata.outOfDateSide(synced)).equal(outOfDateSide)
        })

        it('removes moveFrom and overwrite attributes', async function() {
          // It actually only saves the record and the attributes need to be
          // removed before.
          // But this is the goal.
          const synced = await this.pouch.bySyncedPath(merged.path)
          should(synced).not.have.properties(['moveFrom', 'overwrite'])
        })
      })
    })
  })

  describe('compareChanges', () => {
    const makeChange = (
      doc /*: SavedMetadata */,
      opType,
      { local, remote }
    ) => {
      const outdatedSide = metadata.outOfDateSide(doc)

      return {
        id: doc._id,
        changes: [{ rev: doc._rev }],
        // $FlowFixMe we don't rely on the seq so we set it to undefined
        seq: (undefined /*: number */),
        doc,
        operation:
          opType === 'SKIP' || opType === 'NULL'
            ? { type: opType }
            : outdatedSide == null
            ? { type: 'SKIP' }
            : {
                type: opType,
                side: outdatedSide === 'local' ? local : remote
              }
      }
    }

    context('when one of the changes has no side', () => {
      it('returns 0', async function() {
        const docA = await builders
          .metafile()
          .path('dir/file')
          .upToDate()
          .create()
        const docB = await builders
          .metadir()
          .path('dir')
          .upToDate()
          .create()
        const docC = await builders
          .metadir()
          .path('dir/subdir')
          .changedSide('local')
          .updatedAt(new Date())
          .create()
        const docD = await builders
          .metafile()
          .path('dir/subdir/file')
          .changedSide('local')
          .updatedAt(new Date())
          .create()

        const skipA = makeChange(docA, 'SKIP', this)
        const skipB = makeChange(docB, 'SKIP', this)
        const nullC = makeChange(docC, 'NULL', this)
        const nullD = makeChange(docD, 'NULL', this)

        should(compareChanges(skipA, skipB)).eql(0)
        should(compareChanges(skipB, skipA)).eql(0)
        should(compareChanges(nullC, nullD)).eql(0)
        should(compareChanges(nullD, nullC)).eql(0)
        should(compareChanges(skipA, nullC)).eql(0)
        should(compareChanges(nullD, skipB)).eql(0)
      })
    })

    context('when passing the same change twice', () => {
      it('returns 0', async function() {
        const add = await builders
          .metafile()
          .path('add')
          .sides({ local: 1 })
          .create()
        const del = await builders
          .metafile()
          .path('del')
          .trashed()
          .changedSide('local')
          .create()
        const src = await builders
          .metafile()
          .path('src')
          .upToDate()
          .create()
        const move = await builders
          .metafile()
          .moveFrom(src)
          .path('move')
          .changedSide('local')
          .create()

        const addChange = makeChange(add, 'ADD', this)
        const delChange = makeChange(del, 'DEL', this)
        const moveChange = makeChange(move, 'MOVE', this)

        should(compareChanges(addChange, addChange)).eql(0)
        should(compareChanges(delChange, delChange)).eql(0)
        should(compareChanges(moveChange, moveChange)).eql(0)
      })
    })

    context(
      'with a move outside a directory and the deletion of said directory',
      () => {
        let move, del
        beforeEach(async function() {
          const dir = await builders
            .metadir()
            .path('dir')
            .trashed()
            .changedSide('local')
            .create()
          const srcFile = await builders
            .metafile()
            .path('dir/file')
            .upToDate()
            .create()
          const dstFile = await builders
            .metafile()
            .moveFrom(srcFile)
            .path('file')
            .changedSide('local')
            .create()

          del = makeChange(dir, 'DEL', this)
          move = makeChange(dstFile, 'MOVE', this)
        })

        it('returns -1 if move is passed as first argument', () => {
          should(compareChanges(move, del)).eql(-1)
        })

        it('returns 1 if move is passed as second argument', () => {
          should(compareChanges(del, move)).eql(1)
        })
      }
    )

    context(
      'with a move within a directory and the deletion of said directory',
      () => {
        let move, del
        beforeEach(async function() {
          const dir = await builders
            .metadir()
            .path('dir')
            .trashed()
            .changedSide('local')
            .create()
          const srcFile = await builders
            .metafile()
            .path('dir/file')
            .upToDate()
            .create()
          const dstFile = await builders
            .metafile()
            .moveFrom(srcFile)
            .path('dir/file2')
            .changedSide('local')
            .create()

          del = makeChange(dir, 'DEL', this)
          move = makeChange(dstFile, 'MOVE', this)
        })

        it('returns 0', () => {
          should(compareChanges(move, del)).eql(0)
          should(compareChanges(del, move)).eql(0)
        })
      }
    )

    context(
      'with a move into a directory and the deletion of said directory',
      () => {
        let move, del
        beforeEach(async function() {
          const dir = await builders
            .metadir()
            .path('dir')
            .trashed()
            .changedSide('local')
            .create()
          const srcFile = await builders
            .metafile()
            .path('file')
            .upToDate()
            .create()
          const dstFile = await builders
            .metafile()
            .moveFrom(srcFile)
            .path('dir/file')
            .changedSide('local')
            .create()

          move = makeChange(dstFile, 'MOVE', this)
          del = makeChange(dir, 'DEL', this)
        })

        it('returns 0', () => {
          should(compareChanges(move, del)).eql(0)
          should(compareChanges(del, move)).eql(0)
        })
      }
    )

    context('with a directory move and an addition into said directory', () => {
      let move, add
      beforeEach(async function() {
        const srcDir = await builders
          .metadir()
          .path('src')
          .upToDate()
          .create()
        const dstDir = await builders
          .metadir()
          .moveFrom(srcDir)
          .path('dst')
          .changedSide('local')
          .create()
        const file = await builders
          .metafile()
          .path('dst/file')
          .sides({ local: 1 })
          .create()

        move = makeChange(dstDir, 'MOVE', this)
        add = makeChange(file, 'ADD', this)
      })

      it('returns -1 if move is passed as first argument', () => {
        should(compareChanges(move, add)).eql(-1)
      })

      it('returns 1 if move is passed as second argument', () => {
        should(compareChanges(add, move)).eql(1)
      })
    })

    context(
      'with a directory addition and an addition into said directory',
      () => {
        let addDir, addFile
        beforeEach(async function() {
          const dir = await builders
            .metadir()
            .path('dir')
            .sides({ local: 1 })
            .create()
          const file = await builders
            .metafile()
            .path('dir/file')
            .sides({ local: 1 })
            .create()

          addDir = makeChange(dir, 'ADD', this)
          addFile = makeChange(file, 'ADD', this)
        })

        it('returns -1 if addDir is passed as first argument', () => {
          should(compareChanges(addDir, addFile)).eql(-1)
        })

        it('returns 1 if addDir is passed as second argument', () => {
          should(compareChanges(addFile, addDir)).eql(1)
        })
      }
    )

    context(
      'with a directory deletion and a deletion within said directory',
      () => {
        let delDir, delFile
        beforeEach(async function() {
          const dir = await builders
            .metadir()
            .path('dir')
            .trashed()
            .changedSide('local')
            .create()
          const file = await builders
            .metafile()
            .path('dir/file')
            .trashed()
            .changedSide('local')
            .create()

          delDir = makeChange(dir, 'DEL', this)
          delFile = makeChange(file, 'DEL', this)
        })

        it('returns -1 if delDir is passed as first argument', () => {
          should(compareChanges(delDir, delFile)).eql(-1)
        })

        it('returns 1 if delDir is passed as second argument', () => {
          should(compareChanges(delFile, delDir)).eql(1)
        })
      }
    )

    context('with a directory move and the move of one of its children', () => {
      let moveDir, moveFile
      beforeEach(async function() {
        const srcDir = await builders
          .metadir()
          .path('src')
          .upToDate()
          .create()
        const dstDir = await builders
          .metadir()
          .moveFrom(srcDir)
          .path('dst')
          .changedSide('local')
          .create()
        const srcFile = await builders
          .metafile()
          .path('src/file')
          .upToDate()
          .create()
        const dstFile = await builders
          .metafile()
          .moveFrom(srcFile)
          .path('dst/file')
          .changedSide('local')
          .create()

        moveDir = makeChange(dstDir, 'MOVE', this)
        moveFile = makeChange(dstFile, 'MOVE', this)
      })

      it('returns -1 if moveDir is passed as first argument', () => {
        should(compareChanges(moveDir, moveFile)).eql(-1)
      })

      it('returns 1 if moveDir is passed as second argument', () => {
        should(compareChanges(moveFile, moveDir)).eql(1)
      })
    })

    context('when outdated sides are not the same', () => {
      // XXX: should be the same for every test but I'm trying to limit
      // duplication.
      context(
        'with a directory addition and an addition into said directory',
        () => {
          let addDir, addFile
          beforeEach(async function() {
            const dir = await builders
              .metadir()
              .path('dir')
              .sides({ remote: 1 })
              .create()
            const file = await builders
              .metafile()
              .path('dir/file')
              .sides({ local: 1 })
              .create()

            addDir = makeChange(dir, 'ADD', this)
            addFile = makeChange(file, 'ADD', this)
          })

          it('returns 0', () => {
            should(compareChanges(addDir, addFile)).eql(0)
            should(compareChanges(addFile, addDir)).eql(0)
          })
        }
      )
    })
  })
})
