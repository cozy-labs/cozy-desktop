/* @flow */
/* eslint-env mocha */

const should = require('should')
const sinon = require('sinon')

const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')

const cozy = cozyHelpers.cozy

describe('Sync gets interrupted, initialScan occurs', () => {
  let helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)

  afterEach(() => helpers.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function() {
    helpers = TestHelpers.init(this)
    helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()

    await helpers.remote.pullChanges()
    await helpers.syncAll()

    helpers.spyPouch()
  })
  afterEach(async function() {
    await helpers.stop()
  })

  it('move Folder', async () => {
    const { dirs } = await helpers.remote.createTree(['/a/', '/b/'])

    await helpers.remote.pullChanges()
    await helpers.syncAll()

    await cozy.files.updateAttributesById(dirs['/b/']._id, {
      dir_id: dirs['/a/']._id
    })

    await helpers.remote.pullChanges() // Merge

    // but not sync (client restart)

    await helpers.local.scan()
    await helpers.syncAll()

    const expected = ['a/', 'a/b/']

    should(await helpers.trees()).deepEqual({
      remote: expected,
      local: expected
    })

    await helpers.local.scan()
    await helpers.remote.pullChanges()
    await helpers.syncAll()

    should(await helpers.trees()).deepEqual({
      remote: expected,
      local: expected
    })
  })

  describe('remote file update', () => {
    it('does not override the remote file with the local version', async function() {
      const path = 'file'

      await helpers.local.syncDir.outputFile(path, 'original content')
      await helpers.flushLocalAndSyncAll()

      const doc = await this.pouch.bySyncedPath(path)
      await cozy.files.updateById(doc.remote._id, 'remote content', {
        contentType: 'text/plain'
      })
      await helpers.remote.pullChanges() // Merge

      // but not sync (client restart)

      await helpers.flushLocalAndSyncAll()
      await helpers.pullAndSyncAll()

      // Contents are kept untouched
      should(await helpers.remote.downloadById(doc.remote._id)).eql(
        'remote content'
      )
      should(await helpers.local.readFile('file')).eql('remote content')
    })
  })

  describe('local file move outside dir then update then dir trashing', () => {
    beforeEach('run actions', async function() {
      const dirPath = 'dir/'
      const fileSrcPath = 'dir/file'
      const fileDstPath = 'file'

      // Setup
      await helpers.local.syncDir.makeTree([dirPath, fileSrcPath])
      await helpers.flushLocalAndSyncAll()
      await helpers.pullAndSyncAll()

      // Run local actions
      await helpers.local.syncDir.move(fileSrcPath, fileDstPath)
      await helpers.local.scan()
      await helpers.local.syncDir.remove(dirPath)
      await helpers.local.scan()
      await helpers.local.syncDir.outputFile(fileDstPath, 'updated content')
      await helpers.local.scan()

      // Sync first change then throw to force stop the sync and simulate a
      // client stop.
      const originalApply = helpers._sync.apply
      sinon.stub(helpers._sync, 'apply')
      try {
        helpers._sync.apply.onFirstCall().callsFake(async change => {
          await originalApply(change)
          // Prevent sync of next changes
          await helpers._sync.stop()
          throw new Error('STUB')
        })
        helpers._sync.apply.callThrough()
        await helpers.syncAll()

        // Simulate client restart
        await helpers.local.scan()
        await helpers.remote.pullChanges()
        await helpers.syncAll()
      } finally {
        helpers._sync.apply.restore()
      }
    })

    it('moves the file and trashes the dir', async function() {
      await should(helpers.trees('local', 'remote')).be.fulfilledWith({
        local: ['file'],
        remote: ['file']
      })
    })
  })
})
