/* @flow */

const {
  after,
  afterEach,
  before,
  beforeEach,
  suite,
  test
} = require('mocha')
const should = require('should')

const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const { IntegrationTestHelpers } = require('../support/helpers/integration')

suite('Case or encoding change', () => {
  // This test passes on a macOS workstation when using the docker container,
  // since files are stored on an ext4 FS. But Travis macOS workers lack
  // virtualization support, which means the cozy-stack will run directly on
  // macOS with HFS+ and the test will fail (see below).
  // Maybe we could create an ext4 volume on Travis and put the storage files
  // there to better match the production environment?
  if (process.env.TRAVIS && (process.platform === 'darwin')) {
    test.skip('is unstable on Travis (macOS)')
    return
  }

  let cozy, helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function () {
    cozy = cozyHelpers.cozy
    helpers = new IntegrationTestHelpers(this.config, this.pouch, cozy)

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  suite('directory', () => {
    let dir, dir2

    beforeEach(async () => {
      // This will fail with a 409 conflict error when cozy-stack runs directly
      // on macOS & HFS+ because a file with an equivalent name already exists.
      dir = await cozy.files.createDirectory({name: '\u0065\u0301'})
      dir2 = await cozy.files.createDirectory({name: 'foo'})
      await helpers.remote.pullChanges()
      await helpers.syncAll()
      helpers.spyPouch()
      should(await helpers.local.tree()).deepEqual([
        '\u0065\u0301/',
        'foo/'
      ])
    })

    test('remote', async () => {
      await cozy.files.updateAttributesById(dir._id, {name: '\u00e9'})
      await cozy.files.updateAttributesById(dir2._id, {name: 'FOO'})
      await helpers.remote.pullChanges()

      await helpers.syncAll()
      await helpers._local.watcher.start()
      await helpers._local.watcher.stop()
      await helpers.syncAll()

      const tree = await helpers.local.tree()
      switch (process.platform) {
        case 'win32':
          should(tree).deepEqual([
            '\u00e9/',
            'foo/'
          ])
          break

        case 'darwin':
          should(tree).deepEqual([
            '\u0065\u0301/',
            'foo/'
          ])
          break

        case 'linux':
          should(tree).deepEqual([
            '\u00e9/',
            'FOO/'
          ])
      }
    })
  })
})
