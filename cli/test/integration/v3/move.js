/* @flow */

import pick from 'lodash.pick'
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

import pouchdbBuilders from '../../builders/pouchdb'
import configHelpers from '../../helpers/config'
import * as cozyHelpers from '../../helpers/cozy'
import pouchHelpers from '../../helpers/pouch'
import { IntegrationTestHelpers } from '../../helpers/integration'

suite('Move', () => {
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

  suite('file', () => {
    let dst, file, src

    beforeEach(async () => {
      dst = await cozy.files.createDirectory({name: 'dst'})
      src = await cozy.files.createDirectory({name: 'src'})
      file = await cozy.files.create('foo', {name: 'file', dirID: src._id})

      await helpers.pullChange(dst._id)
      await helpers.pullChange(src._id)
      await helpers.pullChange(file._id)
      await helpers.syncAll()
      helpers.spyPouch()
    })

    test('local', async () => {
      const oldFile = await pouch.byRemoteIdMaybeAsync(file._id)
      await prep.moveFileAsync('local', {
        path: 'dst/file',
        updated_at: '2017-06-19T08:19:26.769Z',
        ...pick(oldFile, ['docType', 'md5sum', 'mime', 'class', 'size'])
      }, oldFile)

      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        {path: path.normalize('src/file'), _deleted: true, sides: {local: 3, remote: 2}},
        {path: path.normalize('dst/file'), sides: {local: 1}}
      ])

      await helpers.syncAll()

      should(await helpers.remote.tree()).deepEqual([
        '.cozy_trash/',
        'dst/',
        'dst/file',
        'src/'
      ])
    })

    test('remote', async () => {
      const oldFile = await pouch.byRemoteIdMaybeAsync(file._id)
      await prep.moveFileAsync('remote', {
        ...pick(oldFile, ['docType', 'size', 'md5sum', 'class', 'mime', 'tags']),
        path: 'dst/file',
        updated_at: '2017-06-19T08:19:26.769Z',
        remote: {
          _id: file._id,
          _rev: pouchdbBuilders.rev()
        }
      }, oldFile)

      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        {path: path.normalize('src/file'), _deleted: true, sides: {local: 2, remote: 3}},
        {path: path.normalize('dst/file'), sides: {remote: 1}}
      ])

      await helpers.syncAll()

      should(await helpers.local.tree()).deepEqual([
        'dst/',
        'dst/file',
        'src/'
      ])
    })
  })

  suite('directory', () => {
    let dir, dst, emptySubdir, file, parent, src, subdir

    beforeEach(async () => {
      parent = await cozy.files.createDirectory({name: 'parent'})
      dst = await cozy.files.createDirectory({name: 'dst', dirID: parent._id})
      src = await cozy.files.createDirectory({name: 'src', dirID: parent._id})
      dir = await cozy.files.createDirectory({name: 'dir', dirID: src._id})
      emptySubdir = await cozy.files.createDirectory({name: 'empty-subdir', dirID: dir._id})
      subdir = await cozy.files.createDirectory({name: 'subdir', dirID: dir._id})
      file = await cozy.files.create('foo', {name: 'file', dirID: subdir._id})

      await helpers.pullChange(parent._id)
      await helpers.pullChange(dst._id)
      await helpers.pullChange(src._id)
      await helpers.pullChange(dir._id)
      await helpers.pullChange(emptySubdir._id)
      await helpers.pullChange(subdir._id)
      await helpers.pullChange(file._id)
      await helpers.syncAll()
      helpers.spyPouch()
    })

    test('local', async () => {
      await prep.putFolderAsync('local', {path: 'parent/dst/dir', docType: 'folder', updated_at: '2017-06-19T08:19:25.489Z'})
      await prep.putFolderAsync('local', {path: 'parent/dst/dir/empty-subdir', docType: 'folder', updated_at: '2017-06-19T08:19:25.547Z'})
      await prep.putFolderAsync('local', {path: 'parent/dst/dir/subdir', docType: 'folder', updated_at: '2017-06-19T08:19:25.558Z'})
      const oldFile = await pouch.byRemoteIdMaybeAsync(file._id)
      await prep.moveFileAsync('local', {
        path: 'parent/dst/dir/subdir/file',
        updated_at: '2017-06-19T08:19:26.769Z',
        ...pick(oldFile, ['docType', 'md5sum', 'mime', 'class', 'size'])
      }, oldFile)
      // FIXME: PouchDB 409 conflict errors
      await should(prep.trashFolderAsync('local', {path: 'parent/src/dir/subdir'})).be.rejectedWith({status: 409})
      await should(prep.trashFolderAsync('local', {path: 'parent/src/dir/empty-subdir'})).be.rejectedWith({status: 409})
      await should(prep.trashFolderAsync('local', {path: 'parent/src/dir'})).be.rejectedWith({status: 409})

      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        // Moved file
        {path: path.normalize('parent/src/dir/subdir/file'), _deleted: true, sides: {local: 3, remote: 2}},
        {path: path.normalize('parent/dst/dir/subdir/file'), sides: {local: 1}},
        // Created dirs
        {path: path.normalize('parent/dst/dir'), sides: {local: 1}},
        {path: path.normalize('parent/dst/dir/empty-subdir'), sides: {local: 1}},
        {path: path.normalize('parent/dst/dir/subdir'), sides: {local: 1}},
        // Deleted dirs
        {path: path.normalize('parent/src/dir/subdir'), _deleted: true, sides: {local: 3, remote: 2}},
        {path: path.normalize('parent/src/dir/subdir'), trashed: true, sides: {local: 3, remote: 2}},
        {path: path.normalize('parent/src/dir/empty-subdir'), _deleted: true, sides: {local: 3, remote: 2}},
        {path: path.normalize('parent/src/dir/empty-subdir'), trashed: true, sides: {local: 3, remote: 2}},
        {path: path.normalize('parent/src/dir'), _deleted: true, sides: {local: 3, remote: 2}},
        {path: path.normalize('parent/src/dir'), trashed: true, sides: {local: 3, remote: 2}}
      ])

      await helpers.syncAll()

      should(await helpers.remote.tree()).deepEqual([
        '.cozy_trash/',
        // FIXME: Cozy trash should be empty after local dir move
        '.cozy_trash/dir/',
        '.cozy_trash/empty-subdir/',
        '.cozy_trash/subdir/',
        'parent/',
        'parent/dst/',
        'parent/dst/dir/',
        'parent/dst/dir/empty-subdir/',
        'parent/dst/dir/subdir/',
        'parent/dst/dir/subdir/file',
        'parent/src/'
      ])
    })

    test('remote', async () => {
      const newDirMetadata = await helpers._remote.addFolderAsync({
        ...await pouch.byRemoteIdAsync(dir._id),
        path: path.normalize('parent/dst/dir'),
        updated_at: '2017-06-20T12:58:49.681Z'
      })
      const newEmptySubdirMetadata = await helpers._remote.addFolderAsync({
        ...await pouch.byRemoteIdAsync(emptySubdir._id),
        path: path.normalize('parent/dst/dir/empty-subdir'),
        updated_at: '2017-06-20T12:58:49.817Z'
      })
      const newSubdirMetadata = await helpers._remote.addFolderAsync({
        ...await pouch.byRemoteIdAsync(subdir._id),
        path: path.normalize('parent/dst/dir/subdir'),
        updated_at: '2017-06-20T12:58:49.873Z'
      })
      const oldFileMetadata = await pouch.byRemoteIdAsync(file._id)
      await helpers._remote.moveFileAsync({
        ...oldFileMetadata,
        path: path.normalize('parent/dst/dir/subdir/file')
        // FIXME: Why does moveFileAsync({updated_at: ...}) fail?
        // updated_at: '2017-06-20T12:58:49.921Z'
      }, oldFileMetadata)
      const oldSubdirMetadata = await pouch.byRemoteIdAsync(subdir._id)
      await helpers._remote.trashAsync(oldSubdirMetadata)
      const oldEmptySubdirMetadata = await pouch.byRemoteIdAsync(emptySubdir._id)
      await helpers._remote.trashAsync(oldEmptySubdirMetadata)
      const oldDirMetadata = await pouch.byRemoteIdAsync(dir._id)
      await helpers._remote.trashAsync(oldDirMetadata)

      await helpers.pullChange(newDirMetadata.remote._id)
      await helpers.pullChange(newEmptySubdirMetadata.remote._id)
      await helpers.pullChange(newSubdirMetadata.remote._id)
      await helpers.pullChange(oldFileMetadata.remote._id)
      // FIXME: PouchDB 409 conflict errors
      await should(helpers.pullChange(oldSubdirMetadata.remote._id)).be.rejectedWith({status: 409})
      await should(helpers.pullChange(oldEmptySubdirMetadata.remote._id)).be.rejectedWith({status: 409})
      await should(helpers.pullChange(oldDirMetadata.remote._id)).be.rejectedWith({status: 409})

      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        // file 1/2
        {path: path.normalize('parent/src/dir/subdir/file'), _deleted: true, sides: {local: 2, remote: 3}},
        // file 2/2
        {path: path.normalize('parent/dst/dir/subdir/file'), sides: {remote: 1}},
        // dir 2/2
        {path: path.normalize('parent/dst/dir'), sides: {remote: 1}},
        // empty-subdir 2/2
        {path: path.normalize('parent/dst/dir/empty-subdir'), sides: {remote: 1}},
        // subdir 2/3
        {path: path.normalize('parent/dst/dir/subdir'), sides: {remote: 1}},
        // subdir 1/3
        {path: path.normalize('parent/src/dir/subdir'), _deleted: true, sides: {local: 2, remote: 3}},
        {path: path.normalize('parent/src/dir/subdir'), trashed: true, sides: {local: 2, remote: 3}},
        // empty-subdir 1/2
        {path: path.normalize('parent/src/dir/empty-subdir'), _deleted: true, sides: {local: 2, remote: 3}},
        {path: path.normalize('parent/src/dir/empty-subdir'), trashed: true, sides: {local: 2, remote: 3}},
        // dir 1/2
        {path: path.normalize('parent/src/dir'), _deleted: true, sides: {local: 2, remote: 3}},
        {path: path.normalize('parent/src/dir'), trashed: true, sides: {local: 2, remote: 3}}
      ])

      await helpers.syncAll()

      should(await helpers.local.tree()).deepEqual([
        // FIXME: OS trash should be empty after remote dir move
        '/Trash/dir/',
        '/Trash/empty-subdir/',
        '/Trash/subdir/',
        'parent/',
        'parent/dst/',
        'parent/dst/dir/',
        'parent/dst/dir/empty-subdir/',
        'parent/dst/dir/subdir/',
        'parent/dst/dir/subdir/file',
        'parent/src/'
      ])
    })
  })
})
