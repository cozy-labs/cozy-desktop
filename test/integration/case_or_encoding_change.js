/* @flow */
/* eslint-env mocha */

const should = require('should')

const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')

describe('Case or encoding change', () => {
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

  describe('directory', () => {
    let dir, dir2

    beforeEach(async () => {
      // This will fail with a 409 conflict error when cozy-stack runs directly
      // on macOS & HFS+ because a file with an equivalent name already exists.
      dir = await helpers.remote.createDirectory('e\u0301') // 'é'
      dir2 = await helpers.remote.createDirectory('foo')
      await helpers.remote.pullChanges()
      await helpers.syncAll()
      helpers.spyPouch()
      should(await helpers.local.tree()).deepEqual([
        'e\u0301/', // 'é/'
        'foo/'
      ])
    })

    it('remote', async () => {
      await helpers.remote.updateAttributesById(dir._id, { name: '\u00e9' }) // 'é'
      await helpers.remote.updateAttributesById(dir2._id, { name: 'FOO' })
      await helpers.remote.pullChanges()

      await helpers.syncAll()
      await helpers._local.watcher.start()
      await helpers._local.watcher.stop()
      await helpers.syncAll()

      const tree = await helpers.local.tree()
      switch (process.platform) {
        case 'win32':
          should(tree).deepEqual([
            'FOO/',
            '\u00e9/' // 'é/'
          ])
          break

        case 'darwin':
          should(tree).deepEqual([
            'FOO/',
            'e\u0301/' // 'é/'
          ])
          break

        case 'linux':
          should(tree).deepEqual([
            'FOO/',
            '\u00e9/' // 'é/'
          ])
      }
    })
  })
})
