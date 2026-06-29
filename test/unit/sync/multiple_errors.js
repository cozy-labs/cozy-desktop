/* eslint-env mocha */
/* @flow */

const EventEmitter = require('events')

const Promise = require('bluebird')
const should = require('should')
const sinon = require('sinon')

const { Ignore } = require('../../../core/ignore')
const remoteErrors = require('../../../core/remote/errors')
const { Sync } = require('../../../core/sync')
const syncErrors = require('../../../core/sync/errors')
const { SyncState } = require('../../../core/syncstate')
const Builders = require('../../support/builders')
const stubSide = require('../../support/doubles/side')
const configHelpers = require('../../support/helpers/config')
const pouchHelpers = require('../../support/helpers/pouch')

const blockingSyncError = (doc, code) =>
  new syncErrors.SyncError({
    code: code || syncErrors.MISSING_PERMISSIONS_CODE,
    sideName: 'local',
    err: new Error('Simulated blocking error'),
    doc
  })

const retryableError = (doc, code) => {
  if (doc) {
    return new syncErrors.SyncError({
      code: code || syncErrors.UNKNOWN_SYNC_ERROR_CODE,
      sideName: 'remote',
      err: new remoteErrors.RemoteError({
        code: code || remoteErrors.UNKNOWN_REMOTE_ERROR_CODE,
        err: new Error('Simulated retryable error')
      }),
      doc
    })
  } else {
    return new remoteErrors.RemoteError({
      code: code || remoteErrors.UNKNOWN_REMOTE_ERROR_CODE,
      err: new Error('Simulated retryable error')
    })
  }
}

describe('Multiple sync errors', function() {
  before(configHelpers.createConfig)
  beforeEach(pouchHelpers.createDatabase)
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(function() {
    this.local = stubSide('local')
    this.remote = stubSide('remote')
    this.remote.watcher = {
      start: sinon.stub().resolves(),
      stop: sinon.stub().resolves(),
      onError: sinon.stub(),
      onFatal: sinon.stub()
    }
    this.remote.ping = sinon.stub().resolves(true)
    this.ignore = new Ignore(['ignored'])
    this.events = new EventEmitter()
    this.sync = new Sync(
      this.pouch,
      this.local,
      this.remote,
      this.ignore,
      this.events
    )
    this.sync.lifecycle.transitionTo('done-start')
    // Wire up the command handler (normally done in sync.start())
    this.events.on('user-action-command', this.sync._onUserActionCommand)
  })

  afterEach(async function() {
    await this.sync.stop()
  })

  let builders
  beforeEach(function() {
    builders = new Builders(this)
  })

  describe('syncBatch error propagation', () => {
    it('stops applying changes when a blocking error is thrown', async function() {
      await builders
        .metafile()
        .path('a')
        .sides({ local: 1 })
        .create()
      await builders
        .metafile()
        .path('b')
        .sides({ local: 1 })
        .create()

      const applyStub = sinon.stub(this.sync, 'apply')
      applyStub.callsFake(async change => {
        if (change.doc.path === 'a') {
          await this.pouch.setLocalSeq(change.seq)
        } else if (change.doc.path === 'b') {
          throw blockingSyncError(change.doc)
        } else {
          throw new Error(`Unexpected apply call for ${change.doc.path}`)
        }
      })

      // Let blockSyncFor run its full logic but stop lifecycle to avoid hang
      const originalBlockSyncFor = this.sync.blockSyncFor
      sinon.stub(this.sync, 'blockSyncFor').callsFake(async cause => {
        await originalBlockSyncFor(cause)
        this.sync.lifecycle.transitionTo('done-stop')
      })

      await this.sync.syncBatch()

      should(applyStub).have.been.calledTwice()
      should(applyStub.args[0][0].doc.path).equal('a')
      should(applyStub.args[1][0].doc.path).equal('b')

      const aSeq = applyStub.args[0][0].seq
      should(await this.pouch.getLocalSeq()).equal(aSeq)

      applyStub.restore()
      this.sync.blockSyncFor.restore()
    })
  })

  describe('retry exhaustion', () => {
    it('calls setLocalSeq when a change was skipped', async function() {
      const doc = await builders
        .metafile()
        .path('exhausted')
        .skipped(true)
        .sides({ local: 1 })
        .create()

      sinon.spy(this.pouch, 'setLocalSeq')
      sinon.stub(this.sync, 'apply').rejects(retryableError(doc))

      const seq = 42
      const getNextChangesStub = sinon.stub(this.sync, 'getNextChanges')
      getNextChangesStub.onFirstCall().resolves([
        {
          changes: [{ rev: doc._rev }],
          doc,
          id: doc._id,
          seq,
          operation: { type: 'ADD', side: 'remote' }
        }
      ])
      getNextChangesStub.onSecondCall().resolves([])

      await this.sync.syncBatch()

      should(this.pouch.setLocalSeq).have.been.calledOnce()
      should(this.pouch.setLocalSeq.args[0][0]).equal(seq)
      should(await this.pouch.getLocalSeq()).equal(seq)

      this.sync.apply.restore()
      this.sync.getNextChanges.restore()
      this.pouch.setLocalSeq.restore()
    })
  })

  describe('blockSyncFor', () => {
    beforeEach(function() {
      sinon.spy(this.events, 'emit')
    })
    afterEach(function() {
      this.events.emit.restore()
    })

    it('blocks lifecycle and emits user-alert for permission errors', async function() {
      const doc = await builders
        .metafile()
        .path('perms')
        .sides({ local: 1 })
        .create()

      const err = blockingSyncError(doc)
      const change = {
        changes: [{ rev: doc._rev }],
        doc,
        id: doc._id,
        seq: 42,
        operation: { type: 'ADD', side: 'remote' }
      }

      await this.sync.blockSyncFor({ err, change })

      should(this.sync.lifecycle.blocked).be.true()
      should(this.events.emit).have.been.calledWith('user-alert')
      should(this.sync._blockedCauses.size).equal(1)

      const key = doc._id
      should(this.sync._blockedCauses.has(key)).be.true()
    })

    it('emits offline event for unreachable cozy', async function() {
      const err = retryableError(null, remoteErrors.UNREACHABLE_COZY_CODE)

      await this.sync.blockSyncFor({ err })

      should(this.sync.lifecycle.blocked).be.true()
      should(this.events.emit).have.been.calledWith('offline')
      should(this.remote.watcher.stop).have.been.called()
    })

    it('recovers after unblocking when cozy is reachable again', async function() {
      const doc = await builders
        .metafile()
        .path('recover')
        .sides({ local: 1 })
        .create()

      const err = new syncErrors.SyncError({
        code: remoteErrors.UNREACHABLE_COZY_CODE,
        sideName: 'remote',
        err: new remoteErrors.RemoteError({
          code: remoteErrors.UNREACHABLE_COZY_CODE,
          err: new Error('unreachable')
        }),
        doc
      })

      await this.sync.blockSyncFor({ err })

      should(this.events.emit).have.been.calledWith('offline')
      this.events.emit.resetHistory()

      this.events.emit('user-action-command', { cmd: 'retry' })
      await Promise.delay(100)

      should(this.events.emit).have.been.calledWith('online')
      should(this.remote.watcher.start).have.been.called()
      should(this.sync.lifecycle.blocked).be.false()
      should(this.sync._blockedCauses.size).equal(0)
    })

    it('does not emit online if cozy is still unreachable on retry', async function() {
      this.remote.ping.resolves(false)

      const err = retryableError(null, remoteErrors.UNREACHABLE_COZY_CODE)

      await this.sync.blockSyncFor({ err })
      this.events.emit.resetHistory()

      this.events.emit('user-action-command', { cmd: 'retry' })
      await Promise.delay(100)

      should(this.events.emit).have.been.calledWith('offline')
      should(this.events.emit).not.have.been.calledWith('online')
      // The lifecycle must stay blocked so runSyncLoop does not resume and
      // re-apply the blocked change right after the ping that just failed.
      should(this.sync.lifecycle.blocked).be.true()
      should(this.sync._blockedCauses.size).equal(1)
    })
  })

  describe('registerBlockingCause', () => {
    beforeEach(function() {
      sinon.spy(this.events, 'emit')
    })
    afterEach(function() {
      this.events.emit.restore()
    })

    it('registers cause and emits alert without blocking lifecycle', async function() {
      const doc = await builders
        .metafile()
        .path('register')
        .sides({ local: 1 })
        .create()

      const err = blockingSyncError(doc)
      const change = {
        changes: [{ rev: doc._rev }],
        doc,
        id: doc._id,
        seq: 42,
        operation: { type: 'ADD', side: 'remote' }
      }

      await this.sync.registerBlockingCause({ err, change })

      should(this.sync._blockedCauses.size).equal(1)
      should(this.sync._blockedCauses.has(doc._id)).be.true()
      should(this.events.emit).have.been.calledWith('user-alert')
      should(this.sync.lifecycle.blocked).be.false()
      should(this.sync.retryInterval).be.null()
    })
  })

  describe('scheduleRetry', () => {
    let cause
    beforeEach(async function() {
      const doc = await builders
        .metafile()
        .path('schedule')
        .sides({ local: 1 })
        .create()

      cause = {
        err: blockingSyncError(doc),
        change: {
          changes: [{ rev: doc._rev }],
          doc,
          id: doc._id,
          seq: 42,
          operation: { type: 'ADD', side: 'remote' }
        }
      }
      await this.sync.registerBlockingCause(cause)
    })

    it('blocks lifecycle and sets retry interval', async function() {
      should(this.sync.lifecycle.blocked).be.false()
      should(this.sync.retryInterval).be.null()

      await this.sync.scheduleRetry([cause])

      should(this.sync.lifecycle.blocked).be.true()
      should(this.sync.retryInterval).not.be.null()
    })
  })

  describe('blocked cause key', () => {
    it('overwrites existing blocked cause for same doc with latest seq', async function() {
      const doc = await builders
        .metafile()
        .path('overwrite')
        .sides({ local: 1 })
        .create()

      await this.sync.blockSyncFor({
        err: blockingSyncError(doc),
        change: {
          changes: [{ rev: doc._rev }],
          doc,
          id: doc._id,
          seq: 10,
          operation: { type: 'ADD', side: 'remote' }
        }
      })

      should(this.sync._blockedCauses.size).equal(1)
      const key10 = this.sync._blockedCauseKey({
        docId: doc._id,
        code: syncErrors.MISSING_PERMISSIONS_CODE
      })
      should(this.sync._blockedCauses.get(key10).change.seq).equal(10)

      await this.sync.blockSyncFor({
        err: blockingSyncError(doc),
        change: {
          changes: [{ rev: doc._rev }],
          doc,
          id: doc._id,
          seq: 20,
          operation: { type: 'ADD', side: 'remote' }
        }
      })

      should(this.sync._blockedCauses.size).equal(1)
      should(this.sync._blockedCauses.get(key10).change.seq).equal(20)
    })
  })

  describe('apply of a change with existing errors counter', () => {
    it('increments errors on retry when a change fails', async function() {
      const doc = await builders
        .metafile()
        .path('retry-count')
        .sides({ local: 1 })
        .create()

      sinon.stub(this.sync, 'apply').rejects(retryableError(doc))

      await this.sync.syncBatch()

      this.events.emit('user-action-command', { cmd: 'retry' })
      await Promise.delay(100)

      const synced = await this.pouch.bySyncedPath(doc.path)
      should(synced.errors).equal(1)

      this.sync.apply.restore()
    })
  })

  describe('offline / online lifecycle', () => {
    it('emits offline/online events through multiple blocking/unblocking cycles', async function() {
      sinon.spy(this.events, 'emit')

      const err = retryableError(null, remoteErrors.UNREACHABLE_COZY_CODE)

      await this.sync.blockSyncFor({ err })
      should(this.events.emit).have.been.calledWith('offline')
      should(this.sync.lifecycle.blocked).be.true()
      this.events.emit.resetHistory()

      this.sync.lifecycle.unblock()
      should(this.sync.lifecycle.blocked).be.false()

      await this.sync.blockSyncFor({ err })
      should(this.events.emit).have.been.calledWith('offline')
      should(this.sync.lifecycle.blocked).be.true()

      this.events.emit.restore()
    })
  })

  describe('resolveBlockingCause', () => {
    beforeEach(function() {
      this.events = new SyncState()
      this.sync.events = this.events
      sinon.spy(this.events, 'emit')
    })

    afterEach(function() {
      this.events.emit.restore()
    })

    it('clears the userAlert when a blocked cause is resolved', async function() {
      const doc = await builders
        .metafile()
        .path('resolve')
        .sides({ local: 1 })
        .create()

      const change = {
        changes: [{ rev: doc._rev }],
        doc,
        id: doc._id,
        seq: 42,
        operation: { type: 'ADD', side: 'remote' }
      }

      await this.sync.blockSyncFor({ err: blockingSyncError(doc), change })

      should(this.sync._blockedCauses.size).equal(1)
      should(this.events.state.userAlerts.length).equal(1)

      this.sync.resolveBlockingCause(doc._id)

      should(this.sync._blockedCauses.size).equal(0)
      should(this.events.state.userAlerts.length).equal(0)
      should(this.events.emit).have.been.calledWith('user-action-done')
    })

    it('keeps other blocked causes alerts intact', async function() {
      const docA = await builders
        .metafile()
        .path('a')
        .sides({ local: 1 })
        .create()
      const docB = await builders
        .metafile()
        .path('b')
        .sides({ local: 1 })
        .create()

      await this.sync.blockSyncFor({
        err: blockingSyncError(docA),
        change: {
          changes: [{ rev: docA._rev }],
          doc: docA,
          id: docA._id,
          seq: 10,
          operation: { type: 'ADD', side: 'remote' }
        }
      })
      await this.sync.blockSyncFor({
        err: blockingSyncError(docB),
        change: {
          changes: [{ rev: docB._rev }],
          doc: docB,
          id: docB._id,
          seq: 20,
          operation: { type: 'ADD', side: 'remote' }
        }
      })

      should(this.sync._blockedCauses.size).equal(2)
      should(this.events.state.userAlerts.length).equal(2)

      this.sync.resolveBlockingCause(docA._id)

      should(this.sync._blockedCauses.size).equal(1)
      should(this.sync._blockedCauses.has(docB._id)).be.true()
      should(this.events.state.userAlerts.length).equal(1)
      should(this.events.state.userAlerts[0].doc.path).equal('b')
    })

    it('is a no-op for an unknown key', function() {
      this.sync.resolveBlockingCause('nonexistent')

      should(this.events.emit).not.have.been.calledWith('user-action-done')
    })
  })

  describe('SyncState status priority', () => {
    it('shows offline status over pre-existing user alerts', function() {
      const events = new SyncState()

      // Simulate a pre-existing user alert
      events.update({
        userAlerts: [
          {
            seq: 1,
            code: syncErrors.MISSING_PERMISSIONS_CODE,
            status: 'Required',
            doc: null,
            side: null,
            links: null,
            lastSeenAt: Date.now()
          }
        ]
      })

      // Simulate network loss
      events.emit('offline')

      should(events.state.offline).be.true()
      should(events.state.userAlerts.length).equal(1)

      let emitted
      events.on('sync-state', state => {
        emitted = state.status
      })
      events.emitStatus()

      should(emitted).equal('offline')
    })
  })
})
