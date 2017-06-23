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
  let cozy, helpers, pouch, prep

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
    pouch = helpers._pouch
    prep = helpers.prep

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  suite('file', () => {
    let file, src

    beforeEach(async () => {
      await cozy.files.createDirectory({name: 'dst'})
      src = await cozy.files.createDirectory({name: 'src'})
      file = await cozy.files.create('foo', {name: 'file', dirID: src._id})

      await helpers.remote.pullChanges()
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

      should(helpers.putDocs('path', '_deleted', 'trashed')).deepEqual([
        {path: path.normalize('src/file'), _deleted: true},
        {path: path.normalize('dst/file')}
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

      should(helpers.putDocs('path', '_deleted', 'trashed')).deepEqual([
        {path: path.normalize('src/file'), _deleted: true},
        {path: path.normalize('dst/file')}
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

      await helpers.remote.pullChanges()
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
      await prep.trashFolderAsync('local', {path: 'parent/src/dir/subdir'})
      await prep.trashFolderAsync('local', {path: 'parent/src/dir/empty-subdir'})
      await prep.trashFolderAsync('local', {path: 'parent/src/dir'})

      should(helpers.putDocs('path', '_deleted', 'trashed')).deepEqual([
        // Moved file
        {path: path.normalize('parent/src/dir/subdir/file'), _deleted: true},
        {path: path.normalize('parent/dst/dir/subdir/file')},
        // Created dirs
        {path: path.normalize('parent/dst/dir')},
        {path: path.normalize('parent/dst/dir/empty-subdir')},
        {path: path.normalize('parent/dst/dir/subdir')},
        // Deleted dirs
        {path: path.normalize('parent/src/dir/subdir'), _deleted: true},
        {path: path.normalize('parent/src/dir/empty-subdir'), _deleted: true},
        {path: path.normalize('parent/src/dir'), _deleted: true}
      ])

      await helpers.syncAll()

      should(await helpers.remote.tree()).deepEqual([
        '.cozy_trash/',
        'parent/',
        'parent/dst/',
        'parent/dst/dir/',
        'parent/dst/dir/empty-subdir/',
        'parent/dst/dir/subdir/',
        'parent/dst/dir/subdir/file',
        'parent/src/'
      ])
    })

    // FIXME: cozy-client-js updateAttributesById(..., {dir_id: ...}) is not detected as a move
    test.skip('from remote cozy', async () => {
      await cozy.files.updateAttributesById(dir._id, {dir_id: dst._id})
      await helpers.remote.pullChanges()

      /* FIXME: Nondeterministic
      should(helpers.putDocs('path', '_deleted', 'trashed')).deepEqual([
        {path: 'parent/src/dir/subdir/file', _deleted: true},
        {path: 'parent/src/dir/subdir', _deleted: true},
        {path: 'parent/src/dir/empty-subdir', _deleted: true},
        {path: 'parent/src/dir', _deleted: true},
        {path: 'parent/dst/dir'},
        {path: 'parent/dst/dir/subdir'},
        {path: 'parent/dst/dir/empty-subdir'}
      ])
      */
      await helpers.syncAll()
      should(await helpers.local.tree()).deepEqual([
        'parent/',
        'parent/dst/',
        'parent/dst/dir/',
        'parent/dst/dir/empty-subdir/',
        'parent/dst/dir/subdir/',
        'parent/dst/dir/subdir/file',
        'parent/src/'
      ])
    })

    test('from remote client', async () => {
      // FIXME: Ensure events occur in the same order as resulting from the
      // local dir test
      await helpers._remote.addFolderAsync({
        ...await pouch.byRemoteIdAsync(dir._id),
        path: path.normalize('parent/dst/dir'),
        updated_at: '2017-06-20T12:58:49.681Z'
      })
      await helpers._remote.addFolderAsync({
        ...await pouch.byRemoteIdAsync(emptySubdir._id),
        path: path.normalize('parent/dst/dir/empty-subdir'),
        updated_at: '2017-06-20T12:58:49.817Z'
      })
      await helpers._remote.addFolderAsync({
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
      await helpers._remote.deleteFolderAsync(oldSubdirMetadata)
      const oldEmptySubdirMetadata = await pouch.byRemoteIdAsync(emptySubdir._id)
      await helpers._remote.deleteFolderAsync(oldEmptySubdirMetadata)
      const oldDirMetadata = await pouch.byRemoteIdAsync(dir._id)
      await helpers._remote.deleteFolderAsync(oldDirMetadata)

      await helpers.remote.pullChanges()

      /* FIXME: Nondeterministic
      should(helpers.putDocs('path', '_deleted', 'trashed')).deepEqual([
        // file 1/2
        {path: path.normalize('parent/src/dir/subdir/file'), _deleted: true},
        // file 2/2
        {path: path.normalize('parent/dst/dir/subdir/file')},
        // dir 2/2
        {path: path.normalize('parent/dst/dir')},
        // empty-subdir 2/2
        {path: path.normalize('parent/dst/dir/empty-subdir')},
        // subdir 2/3
        {path: path.normalize('parent/dst/dir/subdir')},
        // subdir 1/3
        {path: path.normalize('parent/src/dir/subdir'), _deleted: true},
        {path: path.normalize('parent/src/dir/subdir'), trashed: true},
        // empty-subdir 1/2
        {path: path.normalize('parent/src/dir/empty-subdir'), _deleted: true},
        {path: path.normalize('parent/src/dir/empty-subdir'), trashed: true},
        // dir 1/2
        {path: path.normalize('parent/src/dir'), _deleted: true},
        {path: path.normalize('parent/src/dir'), trashed: true}
      ])
      */

      await helpers.syncAll()

      should((await helpers.local.tree())
        // FIXME: Sometimes a copy of the file ends up in the OS trash.
        // Issue was already occurring from time to time, even before we start
        // to permanently delete empty dirs.
        .filter(path => path !== '/Trash/file')
      ).deepEqual([
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
