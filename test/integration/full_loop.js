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

import * as metadata from '../../core/metadata'

import configHelpers from '../helpers/config'
import * as cozyHelpers from '../helpers/cozy'
import pouchHelpers from '../helpers/pouch'
import { IntegrationTestHelpers } from '../helpers/integration'

const cozy = cozyHelpers.cozy

suite('Full watch/merge/sync/repeat loop', () => {
  let helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function () {
    helpers = new IntegrationTestHelpers(this.config, this.pouch, cozy)
    helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()

    await helpers.remote.pullChanges()
    await helpers.syncAll()

    helpers.spyPouch()
  })

  test('remote -> local add file', async () => {
    await cozy.files.create('some file content', {name: 'file'})
    await helpers.remote.pullChanges()
    await helpers.syncAll()
    should(await helpers.local.tree()).deepEqual([
      'file'
    ])

    await helpers._local.watcher.start()

    const doc = await helpers._pouch.db.get(metadata.id('file'))
    should(doc.ino).be.a.Number()
    should(doc.sides).deepEqual({local: 2, remote: 2})
    await helpers._local.watcher.stop()
  })
})
