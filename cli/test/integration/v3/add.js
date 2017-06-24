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

import configHelpers from '../../helpers/config'
import * as cozyHelpers from '../../helpers/cozy'
import pouchHelpers from '../../helpers/pouch'
import { IntegrationTestHelpers } from '../../helpers/integration'

const cozy = cozyHelpers.cozy

suite('Add', () => {
  let helpers, parent

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

    parent = await cozy.files.createDirectory({name: 'parent'})
    await helpers.remote.pullChanges()
    await helpers.syncAll()

    helpers.spyPouch()
  })

  suite('file', () => {
    test('local')

    test('remote', async () => {
      await cozy.files.create('foo', {name: 'file', dirID: parent._id})
      await helpers.remote.pullChanges()

      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        {path: 'parent/file', sides: {remote: 1}}
      ])

      await helpers.syncAll()

      should(await helpers.local.tree()).deepEqual([
        'parent/',
        'parent/file'
      ])
    })
  })

  suite('dir', () => {
    test('local')

    test('remote', async () => {
      const dir = await cozy.files.createDirectory({name: 'dir', dirID: parent._id})
      const subdir = await cozy.files.createDirectory({name: 'subdir', dirID: dir._id})
      await cozy.files.createDirectory({name: 'empty-subdir', dirID: dir._id})
      await cozy.files.create('foo', {name: 'file', dirID: subdir._id})
      await helpers.remote.pullChanges()

      /* FIXME: Nondeterministic
      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        {path: 'parent/dir', sides: {remote: 1}},
        {path: 'parent/dir/empty-subdir', sides: {remote: 1}},
        {path: 'parent/dir/subdir', sides: {remote: 1}},
        {path: 'parent/dir/subdir/file', sides: {remote: 1}}
      ])
      */

      await helpers.syncAll()

      should(await helpers.local.tree()).deepEqual([
        'parent/',
        'parent/dir/',
        'parent/dir/empty-subdir/',
        'parent/dir/subdir/',
        'parent/dir/subdir/file'
      ])
    })
  })
})
