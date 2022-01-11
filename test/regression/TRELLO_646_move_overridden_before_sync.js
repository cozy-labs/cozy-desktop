/* eslint-env mocha */
/* @flow */

const fse = require('fs-extra')
const _ = require('lodash')
const should = require('should')

const metadata = require('../../core/metadata')

const { runActions, init } = require('../support/helpers/scenarios')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const TestHelpers = require('../support/helpers')
const pouchHelpers = require('../support/helpers/pouch')

describe('TRELLO #646: Déplacement écrasé avant synchro (malgré la synchro par lot, https://trello.com/c/Co05qttn)', () => {
  let helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)
  beforeEach('set up synced dir', async function () {
    await fse.emptyDir(this.syncPath)
  })

  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function () {
    helpers = TestHelpers.init(this)
    await helpers.local.setupTrash()
  })

  it('is broken', async function () {
    this.timeout(30000)
    const pouchTree = async () =>
      _.chain(await this.pouch.byRecursivePath(''))
        .map('_id')
        .sort()
        .value()

    // Initial state
    const ctime = new Date('2017-10-09T08:40:51.472Z')
    const mtime = ctime
    await helpers.remote.ignorePreviousChanges()
    await init(
      {
        init: [
          { ino: 1, path: 'src/' },
          { ino: 2, path: 'src/file' }
        ]
      },
      this.pouch,
      helpers.local.syncDir.abspath,
      _.identity
    )

    const cozySrcID = (await this.pouch.db.get(metadata.id('src'))).remote._id

    // Move (not detected yet)
    await runActions(
      { actions: [{ type: 'mv', src: 'src', dst: 'dst' }] },
      helpers.local.syncDir.abspath,
      _.identity
    )

    // Detect and merge move
    // $FlowFixMe
    await helpers.local.simulateEvents([
      { type: 'unlinkDir', path: 'src' },
      {
        type: 'addDir',
        path: 'dst',
        stats: { ino: 1, size: 4096, mtime, ctime }
      },
      { type: 'unlink', path: 'src/file' },
      {
        type: 'add',
        path: 'dst/file',
        stats: { ino: 2, size: 0, mtime, ctime }
      }
    ])
    should(await helpers.local.tree()).deepEqual(['dst/', 'dst/file'])
    should(await helpers.remote.tree()).deepEqual([
      '.cozy_trash/',
      'src/',
      'src/file'
    ])
    should(await pouchTree()).deepEqual(['dst', 'dst/file'].map(metadata.id))

    // Polling occurs before syncing move (recreates src metadata and breaks move)
    await helpers.remote.pullChanges()
    should(await helpers.local.tree()).deepEqual(['dst/', 'dst/file'])
    should(await helpers.remote.tree()).deepEqual([
      '.cozy_trash/',
      'src/',
      'src/file'
    ])
    should(await pouchTree()).deepEqual(['dst', 'dst/file'].map(metadata.id))

    // Sync move
    await helpers.syncAll()
    should(await helpers.local.tree()).deepEqual(['dst/', 'dst/file'])
    should(await helpers.remote.tree()).deepEqual([
      '.cozy_trash/',
      'dst/',
      'dst/file'
    ])
    should(await pouchTree()).deepEqual(['dst', 'dst/file'].map(metadata.id))

    // Sync polling twice, just to be sure
    await helpers.syncAll()
    await helpers.remote.pullChanges()
    await helpers.syncAll()
    should(await helpers.local.tree()).deepEqual(['dst/', 'dst/file'])
    should(await helpers.remote.tree()).deepEqual([
      '.cozy_trash/',
      'dst/',
      'dst/file'
    ])
    should(await pouchTree()).deepEqual(['dst', 'dst/file'].map(metadata.id))

    should(cozySrcID).equal(
      (await this.pouch.db.get(metadata.id('dst'))).remote._id
    )
  })
})
