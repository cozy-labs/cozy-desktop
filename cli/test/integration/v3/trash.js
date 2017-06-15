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

import { ROOT_DIR_ID, TRASH_DIR_ID } from '../../../src/remote/constants'

import configHelpers from '../../helpers/config'
import * as cozyHelpers from '../../helpers/cozy'
import pouchHelpers from '../../helpers/pouch'
import { IntegrationTestHelpers } from '../../helpers/integration'

suite('Trash', () => {
  if (process.env.APPVEYOR) {
    test('is unstable on AppVeyor')
    return
  }

  let cozy, helpers, pouch, prep

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(function () {
    cozy = cozyHelpers.cozy
    helpers = new IntegrationTestHelpers(this.config, this.pouch, cozy)
    pouch = helpers._pouch
    prep = helpers.prep
  })

  suite('file', async () => {
    let parent, file

    beforeEach(async () => {
      parent = await cozy.files.createDirectory({name: 'parent'})
      file = await cozy.files.create('File content...', {name: 'file', dirID: parent._id})
      await helpers.pullChange(parent._id)
      await helpers.pullChange(file._id)
      await helpers.syncAll()
      helpers.spyPouch()
    })

    test('local', async () => {
      await should(prep.trashFileAsync('local', {path: 'parent/file'}))
        .be.rejectedWith({status: 409, name: 'conflict'})

      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        {path: 'parent/file', _deleted: true, sides: {local: 3, remote: 2}},
        {path: 'parent/file', trashed: true, sides: {local: 3, remote: 2}}
      ])
      await should(pouch.db.get(file._id)).be.rejectedWith({status: 404})

      await helpers.syncAll()

      await should(await cozy.files.statById(parent._id))
        .have.propertyByPath('attributes', 'dir_id').eql(ROOT_DIR_ID)
      await should(await cozy.files.statById(file._id))
        .have.propertyByPath('attributes', 'dir_id').eql(TRASH_DIR_ID)
    })

    test('remote', async () => {
      await cozy.files.trashById(file._id)

      await should(helpers.pullChange(file._id))
        .be.rejectedWith({status: 409, name: 'conflict'})

      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        {path: 'parent/file', _deleted: true, sides: {local: 2, remote: 3}},
        {path: 'parent/file', trashed: true, sides: {local: 2, remote: 3}}
      ])
      await should(pouch.db.get(file._id)).be.rejectedWith({status: 404})

      await helpers.syncAll()

      should(await helpers.local.tree()).deepEqual([
        'parent/'
      ])
    })
  })

  suite('directory', async () => {
    let parent, dir, child

    beforeEach(async () => {
      parent = await cozy.files.createDirectory({name: 'parent'})
      dir = await cozy.files.createDirectory({name: 'dir', dirID: parent._id})
      child = await cozy.files.createDirectory({name: 'child', dirID: dir._id})

      await helpers.pullChange(parent._id)
      await helpers.pullChange(dir._id)
      await helpers.pullChange(child._id)
      await helpers.syncAll()

      helpers.spyPouch()
    })

    test('local', async () => {
      const promise = prep.trashFolderAsync('local', {path: 'parent/dir'})

      await should(promise).be.rejectedWith({status: 409, name: 'conflict'})

      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        {path: 'parent/dir/child', _deleted: true, sides: {local: 2, remote: 2}},
        {path: 'parent/dir', _deleted: true, sides: {local: 3, remote: 2}},
        {path: 'parent/dir', trashed: true, sides: {local: 3, remote: 2}}
      ])
      await should(pouch.db.get(dir._id)).be.rejectedWith({status: 404})
      await should(pouch.db.get(child._id)).be.rejectedWith({status: 404})

      await helpers.syncAll()

      await should(cozy.files.statById(child._id)).be.fulfilled()
      should(await cozy.files.statById(dir._id))
        .have.propertyByPath('attributes', 'path').eql('/.cozy_trash/dir')
      should(await cozy.files.statById(child._id))
        .have.propertyByPath('attributes', 'path').eql('/.cozy_trash/dir/child')
    })

    test('remote', async() => {
      // FIXME: should pass a remote doc, or trash from Cozy
      const promise = prep.trashFolderAsync('remote', {path: 'parent/dir'})

      await should(promise).be.rejectedWith({status: 409, name: 'conflict'})

      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        {path: 'parent/dir/child', _deleted: true, sides: {local: 2, remote: 2}},
        {path: 'parent/dir', _deleted: true, sides: {local: 2, remote: 3}},
        {path: 'parent/dir', trashed: true, sides: {local: 2, remote: 3}}
      ])
      await should(pouch.db.get(dir._id)).be.rejectedWith({status: 404})
      await should(pouch.db.get(child._id)).be.rejectedWith({status: 404})

      await helpers.syncAll()

      should(await helpers.local.tree()).deepEqual([
        'parent/'
      ])
    })
  })
})
