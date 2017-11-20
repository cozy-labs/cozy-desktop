/* @flow */

import {
  after,
  afterEach,
  before,
  beforeEach,
  suite,
  test
} from 'mocha'
import should from 'should'

import configHelpers from '../helpers/config'
import * as cozyHelpers from '../helpers/cozy'
import pouchHelpers from '../helpers/pouch'
import { IntegrationTestHelpers } from '../helpers/integration'

suite('Case or encoding change', () => {
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
