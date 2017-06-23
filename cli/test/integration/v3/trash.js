/* @flow */

import {
  after,
  afterEach,
  before,
  beforeEach,
  suite,
  test
} from 'mocha'
import path from 'path'
import should from 'should'

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

    helpers.local.setupTrash()
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
      await should(prep.trashFileAsync('local', {path: 'parent/file'})).be.rejectedWith({status: 409})

      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        {path: path.normalize('parent/file'), _deleted: true, sides: {local: 3, remote: 2}},
        {path: path.normalize('parent/file'), trashed: true, sides: {local: 3, remote: 2}}
      ])
      await should(pouch.db.get(file._id)).be.rejectedWith({status: 404})

      await helpers.syncAll()

      should(await helpers.remote.tree()).deepEqual([
        '.cozy_trash/',
        '.cozy_trash/file',
        'parent/'
      ])
    })

    test('remote', async () => {
      await cozy.files.trashById(file._id)

      await should(helpers.pullChange(file._id)).be.rejectedWith({status: 409})

      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        {path: path.normalize('parent/file'), _deleted: true, sides: {local: 2, remote: 3}},
        {path: path.normalize('parent/file'), trashed: true, sides: {local: 2, remote: 3}}
      ])
      await should(pouch.db.get(file._id)).be.rejectedWith({status: 404})

      await helpers.syncAll()

      should(await helpers.local.tree()).deepEqual([
        '/Trash/file',
        'parent/'
      ])
    })
  })

  suite('directory', async () => {
    let parent, dir, emptySubdir, subdir, file

    beforeEach(async () => {
      parent = await cozy.files.createDirectory({name: 'parent'})
      dir = await cozy.files.createDirectory({name: 'dir', dirID: parent._id})
      emptySubdir = await cozy.files.createDirectory({name: 'empty-subdir', dirID: dir._id})
      subdir = await cozy.files.createDirectory({name: 'subdir', dirID: dir._id})
      file = await cozy.files.create('foo', {name: 'file', dirID: subdir._id})

      await helpers.pullChange(parent._id)
      await helpers.pullChange(dir._id)
      await helpers.pullChange(emptySubdir._id)
      await helpers.pullChange(subdir._id)
      await helpers.pullChange(file._id)
      await helpers.syncAll()

      helpers.spyPouch()
    })

    test('local', async () => {
      await should(prep.trashFolderAsync('local', {path: path.normalize('parent/dir')})).be.rejectedWith({status: 409})

      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        // XXX: Why isn't file deleted? (it works anyway)
        {path: path.normalize('parent/dir/subdir'), _deleted: true, sides: {local: 2, remote: 2}},
        {path: path.normalize('parent/dir/empty-subdir'), _deleted: true, sides: {local: 2, remote: 2}},
        {path: path.normalize('parent/dir'), _deleted: true, sides: {local: 3, remote: 2}},
        {path: path.normalize('parent/dir'), trashed: true, sides: {local: 3, remote: 2}}
      ])

      await helpers.syncAll()

      should(await helpers.remote.tree()).deepEqual([
        '.cozy_trash/',
        '.cozy_trash/dir/',
        '.cozy_trash/dir/empty-subdir/',
        '.cozy_trash/dir/subdir/',
        '.cozy_trash/dir/subdir/file',
        'parent/'
      ])
    })

    test('remote', async() => {
      // FIXME: should pass a remote doc, or trash from Cozy
      await should(prep.trashFolderAsync('remote', {path: 'parent/dir'})).be.rejectedWith({status: 409})

      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        // XXX: Why isn't file deleted? (it works anyway)
        {path: path.normalize('parent/dir/subdir'), _deleted: true, sides: {local: 2, remote: 2}},
        {path: path.normalize('parent/dir/empty-subdir'), _deleted: true, sides: {local: 2, remote: 2}},
        {path: path.normalize('parent/dir'), _deleted: true, sides: {local: 2, remote: 3}},
        {path: path.normalize('parent/dir'), trashed: true, sides: {local: 2, remote: 3}}
      ])

      await helpers.syncAll()

      should(await helpers.local.tree()).deepEqual([
        '/Trash/dir/',
        '/Trash/dir/empty-subdir/',
        '/Trash/dir/subdir/',
        '/Trash/dir/subdir/file',
        'parent/'
      ])
    })
  })
})
