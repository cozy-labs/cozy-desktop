/* @flow */
/* eslint-env mocha */

const should = require('should')
const sinon = require('sinon')

const remoteErrors = require('../../core/remote/errors')
const syncErrors = require('../../core/sync/errors')
const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')

describe('Multiple sync problems', () => {
  let helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)

  afterEach(() => helpers.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function() {
    helpers = TestHelpers.init(this)

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })
  afterEach(async function() {
    await helpers.stop()
  })

  describe('multiple concurrent edits on different files', () => {
    it('creates conflict files visible on both sides', async () => {
      // Create 3 files locally
      await helpers.local.syncDir.outputFile('alpha', 'local alpha')
      await helpers.local.syncDir.outputFile('beta', 'local beta')
      await helpers.local.syncDir.outputFile('gamma', 'local gamma')
      await helpers.local.scan()

      // Create concurrent files remotely before local files could be synced
      for (const name of ['alpha', 'beta', 'gamma']) {
        await helpers.remote.createFile(name, `remote ${name}`)
      }

      await helpers.syncAll()
      await helpers.pullAndSyncAll()

      const localTree = await helpers.local.treeWithoutTrash()
      should(localTree).containDeep([
        'alpha',
        'alpha-conflict-...',
        'beta',
        'beta-conflict-...',
        'gamma',
        'gamma-conflict-...'
      ])

      const remoteTree = await helpers.remote.treeWithoutTrash()
      should(remoteTree).containDeep([
        'alpha',
        'alpha-conflict-...',
        'beta',
        'beta-conflict-...',
        'gamma',
        'gamma-conflict-...'
      ])
    })
  })

  describe('some files fail, some succeed in the same sync batch', () => {
    it('syncs the files that do not encounter errors', async function() {
      await helpers.local.syncDir.outputFile('ok', 'content ok')
      await helpers.local.syncDir.outputFile('failing', 'content failing')
      await helpers.local.syncDir.outputFile('also-ok', 'content also ok')
      await helpers.local.scan()

      // Stub addFileAsync to fail for 'failing' file
      const originalAddFile = helpers.remote.side.addFileAsync
      sinon.stub(helpers.remote.side, 'addFileAsync')
      helpers.remote.side.addFileAsync.callsFake(async (doc, ...args) => {
        if (doc.path && doc.path.includes('failing')) {
          throw new syncErrors.SyncError({
            code: syncErrors.MISSING_PERMISSIONS_CODE,
            sideName: 'local',
            err: new Error('Permission denied'),
            doc
          })
        }
        return originalAddFile(doc, ...args)
      })

      // XXX: first sync syncs also-ok and fails on failing
      await helpers.sync()
      should(await helpers.remote.side.exists('/also-ok')).be.true()

      // XXX: second sync syncs ok because failing has been updated and its
      // sequence is now after ok's.
      await helpers.sync()
      should(await helpers.remote.side.exists('/ok')).be.true()

      // Verify the failing file's error was recorded
      const doc = await helpers.pouch.bySyncedPath('failing')
      should(doc.errors).be.greaterThanOrEqual(1)

      helpers.remote.side.addFileAsync.restore()
    })
  })

  describe('blocking remote error followed by recovery', () => {
    it('blocks sync on remote error then recovers after fix', async function() {
      await helpers.local.syncDir.outputFile('blocked-file', 'original')
      await helpers.flushLocalAndSyncAll()
      await helpers.remote.pullChanges()

      await helpers.local.syncDir.outputFile('blocked-file', 'modified')
      await helpers.local.scan()

      // Spy on registerBlockingCause to verify it was called
      sinon.spy(helpers._sync, 'registerBlockingCause')

      // Stub the remote API with EACCES so wrapError produces
      // MISSING_PERMISSIONS_CODE → no retry exhaustion, user-alert emitted
      const permError = new Error('Permission denied')
      // $FlowFixMe we knowingly add the code attribute to permError
      permError.code = 'EACCES'
      sinon.stub(helpers.remote.side, 'overwriteFileAsync').rejects(permError)

      // When registerBlockingCause emits user-alert, the lifecycle is blocked
      // and a retry interval has been set. Restore overwriteFileAsync so the
      // upcoming auto-retry succeeds.
      helpers.events.once('user-alert', () => {
        helpers.remote.side.overwriteFileAsync.restore()
      })

      await helpers.syncAll()

      should(helpers._sync.registerBlockingCause).have.been.called()
      helpers._sync.registerBlockingCause.restore()
    })
  })

  describe('multiple blocking errors in the same batch', () => {
    it('shows all blocking errors and applies independent changes', async function() {
      await helpers.local.syncDir.outputFile('blocker-1', 'content 1')
      await helpers.local.syncDir.outputFile('independent', 'content ind')
      await helpers.local.syncDir.outputFile('blocker-2', 'content 2')
      await helpers.local.scan()

      const alertPaths = []
      helpers.events.on('user-alert', err => {
        if (err.doc) alertPaths.push(err.doc.path)
      })

      const originalAddFile = helpers.remote.side.addFileAsync
      sinon.stub(helpers.remote.side, 'addFileAsync')
      helpers.remote.side.addFileAsync.callsFake(async (doc, ...args) => {
        if (
          doc.path &&
          (doc.path.includes('blocker-1') || doc.path.includes('blocker-2'))
        ) {
          throw new syncErrors.SyncError({
            code: syncErrors.MISSING_PERMISSIONS_CODE,
            sideName: 'local',
            err: new Error('Permission denied'),
            doc
          })
        }
        return originalAddFile(doc, ...args)
      })

      await helpers.sync()

      // The independent file was applied despite both blockers failing.
      should(await helpers.remote.side.exists('/independent')).be.true()

      // Both blockers were registered as blocking causes with alerts.
      should(helpers._sync._blockedCauses.size).equal(2)
      should(alertPaths).containEql('blocker-1')
      should(alertPaths).containEql('blocker-2')

      helpers.remote.side.addFileAsync.restore()
    })
  })

  describe('transitive skip of dependants', () => {
    it('does not cascade a non-fatal skip (CONFLICTING_NAME on parent) to its child', async function() {
      // Pre-existing remote directory (no pullChanges → no merge → no link).
      await helpers.remote.createDirectoryByPath('/non-fatal-parent')

      // Local side: parent dir + child file under it.
      await helpers.local.syncDir.ensureDir('non-fatal-parent')
      await helpers.local.syncDir.outputFile(
        'non-fatal-parent/child',
        'child content'
      )
      await helpers.local.scan()

      const alertPaths = []
      helpers.events.on('user-alert', err => {
        if (err.doc) alertPaths.push(err.doc.path)
      })

      // First sync: parent ADD hits CONFLICTING_NAME (dir already on Cozy)
      // → non-fatal skip. Child must NOT be alerted SKIPPED_DEPENDENCY.
      await helpers.sync()

      const parentDoc = await helpers.pouch.bySyncedPath('non-fatal-parent')
      should(parentDoc.skipped).equal(remoteErrors.CONFLICTING_NAME_CODE)
      should(alertPaths).not.containEql('non-fatal-parent/child')

      const childDoc = await helpers.pouch.bySyncedPath(
        'non-fatal-parent/child'
      )
      should(childDoc.skipped).be.undefined()

      // Recovery: watcher fetches the remote dir, Merge.save clears the
      // parent's skipped flag, the child is then synced to Cozy.
      await helpers.remote.pullChanges()
      await helpers.syncAll()

      const remoteTree = await helpers.remote.treeWithoutTrash()
      should(remoteTree).containDeep([
        'non-fatal-parent/',
        'non-fatal-parent/child'
      ])
    })

    it('cascades a fatal skip (MISSING_PARENT) to its grandchild', async function() {
      // Create a parent dir + mid dir + leaf file under it.
      await helpers.local.syncDir.ensureDir('fatal-parent')
      await helpers.local.syncDir.ensureDir('fatal-parent/mid')
      await helpers.local.syncDir.outputFile('fatal-parent/mid/leaf', 'leaf')
      await helpers.local.scan()

      // Stub addFolderAsync to throw MISSING_PARENT for the mid dir.
      // MISSING_PARENT is fatal: its dependants must be cascaded with
      // SKIPPED_DEPENDENCY rather than merely blocked for this batch.
      const originalAddDir = helpers.remote.side.addFolderAsync
      sinon
        .stub(helpers.remote.side, 'addFolderAsync')
        .callsFake(async (doc, ...args) => {
          if (doc.path && doc.path.includes('fatal-parent/mid')) {
            throw new syncErrors.SyncError({
              code: remoteErrors.MISSING_PARENT_CODE,
              sideName: 'local',
              err: new Error('Parent directory is missing'),
              doc
            })
          }
          return originalAddDir(doc, ...args)
        })

      // Force retry exhaustion so MISSING_PARENT skips instead of blocking.
      sinon.stub(helpers._sync, 'scheduleRetry').resolves()
      process.env.SYNC_SHOULD_NOT_RETRY = 'true'

      const alertPaths = []
      const alertErrs = []
      helpers.events.on('user-alert', err => {
        if (err.doc) {
          alertPaths.push(err.doc.path)
          alertErrs.push(err)
        }
      })

      try {
        await helpers.sync()

        // The mid dir was fatally skipped (MISSING_PARENT_CODE).
        const midDoc = await helpers.pouch.bySyncedPath('fatal-parent/mid')
        should(midDoc.skipped).equal(remoteErrors.MISSING_PARENT_CODE)

        // The leaf was cascaded with SKIPPED_DEPENDENCY (transitive fatal
        // cascade), not merely blocked for this batch.
        should(alertPaths).containEql('fatal-parent/mid/leaf')
        const leafAlert =
          alertErrs.find(err => err.doc.path === 'fatal-parent/mid/leaf') || {}
        should(leafAlert).not.be.empty()
        should(leafAlert.code).equal(syncErrors.SKIPPED_DEPENDENCY_CODE)
        should(leafAlert.prereqPath).equal('fatal-parent/mid')

        const leafDoc = await helpers.pouch.bySyncedPath(
          'fatal-parent/mid/leaf'
        )
        should(leafDoc.skipped).equal(syncErrors.SKIPPED_DEPENDENCY_CODE)
      } finally {
        helpers.remote.side.addFolderAsync.restore()
        helpers._sync.scheduleRetry.restore()
        delete process.env.SYNC_SHOULD_NOT_RETRY
      }
    })
  })

  describe('cross-side conflicting moves', () => {
    beforeEach(async () => {
      await helpers.local.syncDir.ensureDir('dir1')
      await helpers.local.syncDir.ensureDir('dir2')
      await helpers.flushLocalAndSyncAll()
      await helpers.pullAndSyncAll()

      // Rename both dirs to the same destination
      await helpers.local.syncDir.move('dir1', 'dst')
      await helpers.local.scan()

      const { remote: remoteDir2 } = await helpers.pouch.bySyncedPath('dir2')
      await helpers.remote.move(remoteDir2, 'dst')
    })

    it('creates a conflict and merges both directories', async () => {
      await helpers.pullAndSyncAll()
      await helpers.local.scan()
      await helpers.remote.pullChanges()
      await helpers.syncAll()

      const trees = await helpers.trees()
      should(trees.local).containDeep(['dst/', 'dst-conflict-.../'])
      should(trees.remote).containDeep(['dst/', 'dst-conflict-.../'])
    })
  })
})
