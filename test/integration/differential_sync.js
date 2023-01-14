/* @flow */
/* eslint-env mocha */

const should = require('should')
const sinon = require('sinon')
const { Promise } = require('bluebird')

const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const TestHelpers = require('../support/helpers')
const Builders = require('../support/builders')

const {
  DIR_TYPE,
  FILES_DOCTYPE,
  OAUTH_CLIENTS_DOCTYPE
} = require('../../core/remote/constants')

const path = remoteDoc =>
  remoteDoc.type === DIR_TYPE
    ? `${remoteDoc.path.slice(1)}/`
    : remoteDoc.path.slice(1)

describe('Differential synchronization', () => {
  let helpers, builders, cozy, files

  before(configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerOAuthClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function () {
    this.cozy = cozy = await cozyHelpers.oauthCozy(this.config)

    helpers = TestHelpers.init(this)
    helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()

    helpers.spyPouch()

    builders = new Builders({ cozy })
  })

  let remoteDir, remoteFile
  beforeEach(async function () {
    remoteDir = await builders.remoteDir().name('Photos').create()
    remoteFile = await builders
      .remoteFile()
      .inDir(remoteDir)
      .name('IMG_001.jpg')
      .data('image')
      .create()

    files = (await cozyHelpers.newClient(cozy)).collection(FILES_DOCTYPE)
  })

  describe('when a folder is excluded from synchronization', () => {
    let excludedDir, oauthClient
    beforeEach(async function () {
      excludedDir = { _id: remoteDir._id, _type: FILES_DOCTYPE }
      oauthClient = {
        _id: this.config.client.clientID,
        _type: OAUTH_CLIENTS_DOCTYPE
      }
    })

    context('and the folder was never synced', () => {
      it('does not propagate it or its content to the local filesystem', async function () {
        await files.addNotSynchronizedDirectories(oauthClient, [excludedDir])

        await helpers.pullAndSyncAll()
        should(await helpers.remote.treeWithoutTrash()).deepEqual([
          path(remoteDir),
          path(remoteFile)
        ])
        should(await helpers.local.treeWithoutTrash()).deepEqual([])
      })
    })

    context('and the folder was previously synced', () => {
      beforeEach(async function () {
        await helpers.pullAndSyncAll()
      })

      it('propagates its deletion to the local filesystem', async function () {
        should(await helpers.local.treeWithoutTrash()).deepEqual([
          path(remoteDir),
          path(remoteFile)
        ])

        await files.addNotSynchronizedDirectories(oauthClient, [excludedDir])

        await helpers.pullAndSyncAll()
        should(await helpers.remote.treeWithoutTrash()).deepEqual([
          path(remoteDir),
          path(remoteFile)
        ])
        should(await helpers.local.treeWithoutTrash()).deepEqual([])
      })
    })
  })

  describe('when a folder is re-included into synchronization', () => {
    let excludedDir, oauthClient
    beforeEach(async function () {
      excludedDir = { _id: remoteDir._id, _type: FILES_DOCTYPE }
      oauthClient = {
        _id: this.config.client.clientID,
        _type: OAUTH_CLIENTS_DOCTYPE
      }

      await helpers.pullAndSyncAll()

      await files.addNotSynchronizedDirectories(oauthClient, [excludedDir])

      await helpers.pullAndSyncAll()
    })

    it('propagates its addition and that of its content to the local filesystem', async function () {
      should(await helpers.local.treeWithoutTrash()).deepEqual([])

      await files.removeNotSynchronizedDirectories(oauthClient, [excludedDir])

      await helpers.pullAndSyncAll()
      should(await helpers.remote.treeWithoutTrash()).deepEqual([
        path(remoteDir),
        path(remoteFile)
      ])
      should(await helpers.local.treeWithoutTrash()).deepEqual([
        path(remoteDir),
        path(remoteFile)
      ])
    })
  })

  describe('when a folder is created locally with the same path as an excluded folder', () => {
    let excludedDir, oauthClient
    beforeEach(async function () {
      excludedDir = { _id: remoteDir._id, _type: FILES_DOCTYPE }
      oauthClient = {
        _id: this.config.client.clientID,
        _type: OAUTH_CLIENTS_DOCTYPE
      }
    })

    context('and the user chooses to create a conflict', () => {
      beforeEach(function () {
        const originalBlockSyncFor = helpers._sync.blockSyncFor
        sinon.stub(helpers._sync, 'blockSyncFor')

        // Stub Sync.blockSyncFor to execute the create-conflict user action
        // command and run the local watcher to pick up the new local changes
        // (i.e. the conflict creation).
        helpers._sync.blockSyncFor.onFirstCall().callsFake(async cause => {
          originalBlockSyncFor(cause)
          helpers._sync.events.emit('user-action-command', {
            cmd: 'create-conflict'
          })
        })
        helpers._sync.blockSyncFor.callThrough()
      })
      afterEach(async function () {
        helpers._sync.blockSyncFor.restore()
        await helpers.local.side.stop()
      })

      it('renames the local folder with a conflict suffix before synchronizing it', async function () {
        await files.addNotSynchronizedDirectories(oauthClient, [excludedDir])

        await helpers.pullAndSyncAll()
        should(await helpers.local.treeWithoutTrash()).deepEqual([])

        // XXX: we use a normal local watcher as we need it to be able to
        // acquire the lock before Sync retries synchronizing
        // `Photos/My Image.png` too many times and ends up recreating its
        // missing parent (i.e. `Photos/`), thus triggering an uncaught
        // `ExcludedDir` error.
        const doneStart = new Promise(resolve => {
          helpers.local.side.events.on('local-end', () => {
            resolve()
          })
        })
        await helpers.local.side.start()
        await doneStart
        await helpers.local.syncDir.ensureDir('Photos')
        await helpers.local.syncDir.ensureFile('Photos/My Image.png')
        await new Promise(resolve =>
          helpers.local.side.events.on('local-end', resolve)
        )
        await helpers.syncAll()

        should(await helpers.local.treeWithoutTrash()).deepEqual([
          'Photos-conflict-.../',
          'Photos-conflict-.../My Image.png'
        ])
        should(await helpers.remote.treeWithoutTrash()).deepEqual([
          'Photos-conflict-.../',
          'Photos-conflict-.../My Image.png',
          path(remoteDir),
          path(remoteFile)
        ])
      })
    })

    context('and the user chooses to merge both folders', () => {
      beforeEach(function () {
        const originalBlockSyncFor = helpers._sync.blockSyncFor
        sinon.stub(helpers._sync, 'blockSyncFor')

        // Stub Sync.blockSyncFor to execute the create-conflict user action
        // command and run the local watcher to pick up the new local changes
        // (i.e. the conflict creation).
        helpers._sync.blockSyncFor.onFirstCall().callsFake(async cause => {
          originalBlockSyncFor(cause)
          helpers._sync.events.emit('user-action-command', {
            cmd: 'link-directories'
          })
          // XXX: give enough time to Sync to link the directories before
          // starting the remote watcher.
          await Promise.delay(100)
          helpers.remote.pullChanges()
        })
        helpers._sync.blockSyncFor.callThrough()
      })
      afterEach(function () {
        helpers._sync.blockSyncFor.restore()
      })

      it('does not rename the local folder and re-includes the remote one', async function () {
        await files.addNotSynchronizedDirectories(oauthClient, [excludedDir])

        await helpers.pullAndSyncAll()
        should(await helpers.local.treeWithoutTrash()).deepEqual([])

        await helpers.local.syncDir.ensureDir('Photos')
        await helpers.local.syncDir.ensureFile('Photos/My Image.png')
        await helpers.flushLocalAndSyncAll()

        should(await helpers.local.treeWithoutTrash()).deepEqual([
          path(remoteDir),
          path(remoteFile),
          'Photos/My Image.png'
        ])
        should(await helpers.remote.treeWithoutTrash()).deepEqual([
          path(remoteDir),
          path(remoteFile),
          'Photos/My Image.png'
        ])
      })
    })
  })
})
