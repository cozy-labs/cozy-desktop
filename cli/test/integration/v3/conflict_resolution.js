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
import sinon from 'sinon'

import configHelpers from '../../helpers/config'
import * as cozyHelpers from '../../helpers/cozy'
import pouchHelpers from '../../helpers/pouch'
import { IntegrationTestHelpers } from '../../helpers/integration'

suite('Conflict resolution', () => {
  let cozy, helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function () {
    cozy = cozyHelpers.cozy
    helpers = new IntegrationTestHelpers(this.config, this.pouch, cozy)

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  suite('local', () => {
    beforeEach('create and merge conflicting remote file', async () => {
      await cozy.files.create('whatever', {name: 'foo'})
      await helpers.remote.pullChanges()
    })

    test('success', async () => {
      await helpers.local.syncDir.ensureDir('foo')
      await helpers.prep.putFolderAsync('local', {
        path: 'foo',
        docType: 'folder',
        updated_at: new Date()
      })
      should(await helpers.local.tree()).deepEqual([
        'foo-conflict-.../'
      ])
    })
  })

  suite('remote', () => {
    beforeEach('set up conflict', async () => {
      await helpers.prep.putFolderAsync('local', {
        path: 'foo',
        docType: 'folder',
        updated_at: new Date()
      })
      await cozy.files.create('whatever', {name: 'foo'})
    })

    test('success', async () => {
      await helpers.remote.pullChanges()
      should(await helpers.remote.tree()).deepEqual([
        '.cozy_trash/',
        'foo-conflict-...'
      ])
    })

    suite('retry', () => {
      beforeEach('simulate stack failure', () => {
        sinon.stub(cozy.files, 'updateAttributesById').throws('FetchError')
      })

      test('success', async () => {
        await helpers.remote.pullChanges()
        should(await helpers.remote.tree()).deepEqual([
          '.cozy_trash/',
          'foo-conflict-...'
        ])

        // Stack is back, retry...
        cozy.files.updateAttributesById.restore()
        await helpers.remote.pullChanges()
        should(await helpers.remote.tree()).deepEqual([
          '.cozy_trash/',
          'foo-conflict-...'
        ])
      })
    })
  })
})
