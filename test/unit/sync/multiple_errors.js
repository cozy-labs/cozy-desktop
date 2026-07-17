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
    it('collects multiple blocking errors and applies independent changes', async function() {
      // A (indep, succeed) → B (indep, blocking) → C (depends on B, pending)
      // → D (indep, blocking)
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
      // C depends on B via parent/child path on the same side.
      const docC = await builders
        .metafile()
        .path('b/c')
        .sides({ local: 1 })
        .create()
      const docD = await builders
        .metafile()
        .path('d')
        .sides({ local: 1 })
        .create()

      const changeA = {
        changes: [{ rev: docA._rev }],
        doc: docA,
        id: docA._id,
        seq: 10,
        operation: { type: 'ADD', side: 'local' }
      }
      const changeB = {
        changes: [{ rev: docB._rev }],
        doc: docB,
        id: docB._id,
        seq: 11,
        operation: { type: 'ADD', side: 'local' }
      }
      const changeC = {
        changes: [{ rev: docC._rev }],
        doc: docC,
        id: docC._id,
        seq: 12,
        operation: { type: 'ADD', side: 'local' }
      }
      const changeD = {
        changes: [{ rev: docD._rev }],
        doc: docD,
        id: docD._id,
        seq: 13,
        operation: { type: 'ADD', side: 'local' }
      }

      sinon
        .stub(this.sync, 'getNextChanges')
        .onFirstCall()
        .resolves([changeA, changeB, changeC, changeD])
        .onSecondCall()
        .resolves([])

      const applyStub = sinon.stub(this.sync, 'apply')
      applyStub.callsFake(async change => {
        if (change.id === docA._id) return
        if (change.id === docB._id) throw blockingSyncError(change.doc)
        if (change.id === docD._id) throw blockingSyncError(change.doc)
        throw new Error(`Unexpected apply call for ${change.id}`)
      })

      // Stub scheduleRetry to avoid hanging on the retry interval.
      sinon.stub(this.sync, 'scheduleRetry').resolves()
      const emitSpy = sinon.spy(this.events, 'emit')

      await this.sync.syncBatch()

      // A, B and D were attempted (C was skipped as a dependant of B).
      should(applyStub).have.been.calledThrice()
      const appliedIds = applyStub.args.map(args => args[0].id)
      should(appliedIds).containEql(docA._id)
      should(appliedIds).containEql(docB._id)
      should(appliedIds).containEql(docD._id)
      should(appliedIds).not.containEql(docC._id)

      // Two blocking causes were registered (B and D), both with alerts.
      should(this.sync._blockedCauses.size).equal(2)
      const alertCalls = emitSpy.args.filter(args => args[0] === 'user-alert')
      should(alertCalls).have.length(2)

      // localSeq frozen at A's seq (last success before first failure).
      should(await this.pouch.getLocalSeq()).equal(changeA.seq)

      // scheduleRetry was called once at the end with the accumulated causes.
      should(this.sync.scheduleRetry).have.been.calledOnce()
      const causes = this.sync.scheduleRetry.args[0][0]
      should(causes).have.length(2)

      this.sync.getNextChanges.restore()
      this.sync.apply.restore()
      this.sync.scheduleRetry.restore()
      emitSpy.restore()
    })

    it('applies independent changes after a blocking error without waiting for retry', async function() {
      const docB = await builders
        .metafile()
        .path('blocker')
        .sides({ local: 1 })
        .create()
      const docD = await builders
        .metafile()
        .path('independent')
        .sides({ local: 1 })
        .create()

      const changeB = {
        changes: [{ rev: docB._rev }],
        doc: docB,
        id: docB._id,
        seq: 20,
        operation: { type: 'ADD', side: 'local' }
      }
      const changeD = {
        changes: [{ rev: docD._rev }],
        doc: docD,
        id: docD._id,
        seq: 21,
        operation: { type: 'ADD', side: 'local' }
      }

      sinon
        .stub(this.sync, 'getNextChanges')
        .onFirstCall()
        .resolves([changeB, changeD])
        .onSecondCall()
        .resolves([])

      let dApplied = false
      const applyStub = sinon.stub(this.sync, 'apply')
      applyStub.callsFake(async change => {
        if (change.id === docB._id) throw blockingSyncError(change.doc)
        if (change.id === docD._id) {
          dApplied = true
          return
        }
        throw new Error(`Unexpected apply call for ${change.id}`)
      })

      sinon.stub(this.sync, 'scheduleRetry').resolves()

      await this.sync.syncBatch()

      // D was applied even though B blocked — independent changes are not
      // delayed by the retry timer of the failed change.
      should(dApplied).be.true()

      this.sync.getNextChanges.restore()
      this.sync.apply.restore()
      this.sync.scheduleRetry.restore()
    })

    it('blocks a chained move when the move freeing its path fails', async function() {
      // Reproduces the remote rename case: i->i* (blocked on linux because
      // `*` is a reserved char) followed by j->i (must wait for i->i* to
      // free the destination path). Before the fix, j->i was attempted
      // anyway and failed with a "destination already exists" error.
      const srcI = await builders
        .metadir()
        .path('i')
        .upToDate()
        .create()
      const dstIStar = await builders
        .metadir()
        .moveFrom(srcI)
        .path('i*')
        .changedSide('local')
        .create()
      const srcJ = await builders
        .metadir()
        .path('j')
        .upToDate()
        .create()
      const dstIFromJ = await builders
        .metadir()
        .moveFrom(srcJ)
        .path('i')
        .changedSide('local')
        .create()

      const changeI = {
        changes: [{ rev: dstIStar._rev }],
        doc: dstIStar,
        id: dstIStar._id,
        seq: 40,
        operation: { type: 'MOVE', side: 'local' }
      }
      const changeJ = {
        changes: [{ rev: dstIFromJ._rev }],
        doc: dstIFromJ,
        id: dstIFromJ._id,
        seq: 41,
        operation: { type: 'MOVE', side: 'local' }
      }

      sinon
        .stub(this.sync, 'getNextChanges')
        .onFirstCall()
        .resolves([changeI, changeJ])
        .onSecondCall()
        .resolves([])

      const applyStub = sinon.stub(this.sync, 'apply')
      applyStub.callsFake(async change => {
        if (change.id === dstIStar._id) throw blockingSyncError(change.doc)
        if (change.id === dstIFromJ._id) {
          throw new Error('j->i must not be applied while i->i* is blocked')
        }
        throw new Error(`Unexpected apply call for ${change.id}`)
      })

      sinon.stub(this.sync, 'scheduleRetry').resolves()

      await this.sync.syncBatch()

      // i->i* was attempted (and blocked)...
      should(applyStub).have.been.calledOnce()
      should(applyStub.args[0][0].id).equal(dstIStar._id)

      // ...and j->i was skipped as a dependent of the blocked i->i*.
      const appliedIds = applyStub.args.map(args => args[0].id)
      should(appliedIds).not.containEql(dstIFromJ._id)

      // localSeq frozen at the failed change's predecessor (no success).
      should(await this.pouch.getLocalSeq()).equal(0)

      this.sync.getNextChanges.restore()
      this.sync.apply.restore()
      this.sync.scheduleRetry.restore()
    })

    it('freezes localSeq at last success before first failure (crash recovery)', async function() {
      const docA = await builders
        .metafile()
        .path('recover-a')
        .sides({ local: 1 })
        .create()
      const docB = await builders
        .metafile()
        .path('recover-b')
        .sides({ local: 1 })
        .create()
      const docD = await builders
        .metafile()
        .path('recover-d')
        .sides({ local: 1 })
        .create()

      const changeA = {
        changes: [{ rev: docA._rev }],
        doc: docA,
        id: docA._id,
        seq: 30,
        operation: { type: 'ADD', side: 'local' }
      }
      const changeB = {
        changes: [{ rev: docB._rev }],
        doc: docB,
        id: docB._id,
        seq: 31,
        operation: { type: 'ADD', side: 'local' }
      }
      const changeD = {
        changes: [{ rev: docD._rev }],
        doc: docD,
        id: docD._id,
        seq: 32,
        operation: { type: 'ADD', side: 'local' }
      }

      sinon
        .stub(this.sync, 'getNextChanges')
        .onFirstCall()
        .resolves([changeA, changeB, changeD])
        .onSecondCall()
        .resolves([])

      const applyStub = sinon.stub(this.sync, 'apply')
      applyStub.callsFake(async change => {
        if (change.id === docA._id) return
        if (change.id === docB._id) throw blockingSyncError(change.doc)
        if (change.id === docD._id) return
        throw new Error(`Unexpected apply call for ${change.id}`)
      })

      sinon.stub(this.sync, 'scheduleRetry').resolves()

      await this.sync.syncBatch()

      // localSeq frozen at A (last success before first failure B).
      should(await this.pouch.getLocalSeq()).equal(changeA.seq)

      // Simulate a restart: a new syncBatch from the frozen localSeq.
      // A and D are already up-to-date (no-op), B is re-attempted.
      applyStub.restore()
      const applyStub2 = sinon.stub(this.sync, 'apply')
      applyStub2.callsFake(async change => {
        if (change.id === docA._id) return
        if (change.id === docB._id) throw blockingSyncError(change.doc)
        if (change.id === docD._id) return
        throw new Error(`Unexpected apply call for ${change.id}`)
      })

      this.sync.getNextChanges.restore()
      sinon
        .stub(this.sync, 'getNextChanges')
        .onFirstCall()
        .resolves([changeA, changeB, changeD])
        .onSecondCall()
        .resolves([])

      await this.sync.syncBatch()

      // localSeq still frozen at A: B failed again, A/D were no-ops.
      should(await this.pouch.getLocalSeq()).equal(changeA.seq)

      this.sync.getNextChanges.restore()
      this.sync.apply.restore()
      this.sync.scheduleRetry.restore()
    })
  })

  describe('transitive skip of dependants', () => {
    it('skips a dependant when its prerequisite was skipped and emits SKIPPED_DEPENDENCY alert', async function() {
      // A (skipped) → B (depends on A, path under A)
      const docA = await builders
        .metafile()
        .path('skiproot')
        .sides({ local: 1 })
        .create()
      const docB = await builders
        .metafile()
        .path('skiproot/child')
        .sides({ local: 1 })
        .create()

      const changeA = {
        changes: [{ rev: docA._rev }],
        doc: docA,
        id: docA._id,
        seq: 40,
        operation: { type: 'ADD', side: 'local' }
      }
      const changeB = {
        changes: [{ rev: docB._rev }],
        doc: docB,
        id: docB._id,
        seq: 41,
        operation: { type: 'ADD', side: 'local' }
      }

      // A is already marked skipped (e.g. user skipped it earlier).
      docA.skipped = syncErrors.USER_SKIPPED_CODE
      await this.pouch.put(docA)

      sinon
        .stub(this.sync, 'getNextChanges')
        .onFirstCall()
        .resolves([changeA, changeB])
        .onSecondCall()
        .resolves([])

      const applyStub = sinon.stub(this.sync, 'apply')
      applyStub.callsFake(async change => {
        if (change.id === docB._id) {
          throw new Error('B should not be applied, only skipped')
        }
      })

      sinon.stub(this.sync, 'scheduleRetry').resolves()
      const emitSpy = sinon.spy(this.events, 'emit')

      await this.sync.syncBatch()

      // B was skipped transitively (not applied).
      should(applyStub).not.have.been.called()

      // B's doc is now marked skipped.
      const skippedB = await this.pouch.bySyncedPath(docB.path)
      should(skippedB.skipped).equal(syncErrors.SKIPPED_DEPENDENCY_CODE)

      // A SKIPPED_DEPENDENCY alert was emitted for B with A's path in backticks.
      const alertCalls = emitSpy.args.filter(args => args[0] === 'user-alert')
      should(alertCalls).have.length(1)
      const alertErr = alertCalls[0][1]
      should(alertErr.code).equal(syncErrors.SKIPPED_DEPENDENCY_CODE)
      should(alertErr.prereqPath).equal('skiproot')

      this.sync.getNextChanges.restore()
      this.sync.apply.restore()
      this.sync.scheduleRetry.restore()
      emitSpy.restore()
    })

    it('skips deep transitive chain [A(skip) → B(dep A) → C(dep B)]', async function() {
      const docA = await builders
        .metafile()
        .path('deep')
        .sides({ local: 1 })
        .create()
      const docB = await builders
        .metafile()
        .path('deep/mid')
        .sides({ local: 1 })
        .create()
      const docC = await builders
        .metafile()
        .path('deep/mid/leaf')
        .sides({ local: 1 })
        .create()

      const changeA = {
        changes: [{ rev: docA._rev }],
        doc: docA,
        id: docA._id,
        seq: 50,
        operation: { type: 'ADD', side: 'local' }
      }
      const changeB = {
        changes: [{ rev: docB._rev }],
        doc: docB,
        id: docB._id,
        seq: 51,
        operation: { type: 'ADD', side: 'local' }
      }
      const changeC = {
        changes: [{ rev: docC._rev }],
        doc: docC,
        id: docC._id,
        seq: 52,
        operation: { type: 'ADD', side: 'local' }
      }

      docA.skipped = syncErrors.USER_SKIPPED_CODE
      await this.pouch.put(docA)

      sinon
        .stub(this.sync, 'getNextChanges')
        .onFirstCall()
        .resolves([changeA, changeB, changeC])
        .onSecondCall()
        .resolves([])

      const applyStub = sinon.stub(this.sync, 'apply').resolves(true)
      sinon.stub(this.sync, 'scheduleRetry').resolves()
      const emitSpy = sinon.spy(this.events, 'emit')

      await this.sync.syncBatch()

      // B and C were not applied (skipped transitively).
      should(applyStub).not.have.been.called()

      // Both B and C are marked skipped.
      const skippedB = await this.pouch.bySyncedPath(docB.path)
      const skippedC = await this.pouch.bySyncedPath(docC.path)
      should(skippedB.skipped).equal(syncErrors.SKIPPED_DEPENDENCY_CODE)
      should(skippedC.skipped).equal(syncErrors.SKIPPED_DEPENDENCY_CODE)

      // Two SKIPPED_DEPENDENCY alerts (B and C).
      const alertCalls = emitSpy.args.filter(args => args[0] === 'user-alert')
      should(alertCalls).have.length(2)

      this.sync.getNextChanges.restore()
      this.sync.apply.restore()
      this.sync.scheduleRetry.restore()
      emitSpy.restore()
    })
  })

  describe('retry exhaustion', () => {
    it('calls setLocalSeq when a change was skipped', async function() {
      const doc = await builders
        .metafile()
        .path('exhausted')
        .skipped(syncErrors.SKIPPED_DEPENDENCY_CODE)
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
