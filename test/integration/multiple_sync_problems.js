/* @flow */
/* eslint-env mocha */

const should = require('should')
const sinon = require('sinon')

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

      // Spy on blockSyncFor to verify it was called
      sinon.spy(helpers._sync, 'blockSyncFor')

      // Stub the remote API with EACCES so wrapError produces
      // MISSING_PERMISSIONS_CODE → no retry exhaustion, user-alert emitted
      const permError = new Error('Permission denied')
      // $FlowFixMe we knowingly add the code attribute to permError
      permError.code = 'EACCES'
      sinon.stub(helpers.remote.side, 'overwriteFileAsync').rejects(permError)

      // When blockSyncFor emits user-alert, the lifecycle is blocked and a
      // retry interval has been set. Restore overwriteFileAsync so the
      // upcoming auto-retry succeeds.
      helpers.events.once('user-alert', () => {
        helpers.remote.side.overwriteFileAsync.restore()
      })

      await helpers.syncAll()

      should(helpers._sync.blockSyncFor.called).be.true()
      helpers._sync.blockSyncFor.restore()
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
