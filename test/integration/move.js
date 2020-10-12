/* @flow */
/* eslint-env mocha */

const _ = require('lodash')
const path = require('path')
const should = require('should')

const Builders = require('../support/builders')
const dbBuilders = require('../support/builders/db')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const TestHelpers = require('../support/helpers')
const { onPlatform } = require('../support/helpers/platform')

/*::
import type { SavedMetadata } from '../../core/metadata'
*/

const builders = new Builders()
const cozy = cozyHelpers.cozy

describe('Move', () => {
  if (process.env.APPVEYOR) {
    it('is unstable on AppVeyor')
    return
  }

  let helpers, pouch, prep

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  beforeEach(async function() {
    helpers = TestHelpers.init(this)
    pouch = helpers.pouch
    prep = helpers.prep

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  describe('file', () => {
    let file, src, dst

    beforeEach(async () => {
      dst = await cozy.files.createDirectory({ name: 'dst' })
      src = await cozy.files.createDirectory({ name: 'src' })
      file = await cozy.files.create('foo', { name: 'file', dirID: src._id })

      await helpers.pullAndSyncAll()
      await helpers.flushLocalAndSyncAll()
      helpers.spyPouch()
    })

    it('local', async () => {
      const oldFile = await pouch.byRemoteIdMaybe(file._id)
      await prep.moveFileAsync(
        'local',
        _.merge(
          {
            path: 'dst/file',
            updated_at: '2017-06-19T08:19:26.769Z'
          },
          _.pick(oldFile, ['docType', 'md5sum', 'mime', 'class', 'size'])
        ),
        oldFile
      )

      should(
        helpers.putDocs('path', '_deleted', 'trashed', 'moveFrom')
      ).deepEqual([
        { path: path.normalize('src/file'), _deleted: true },
        { path: path.normalize('dst/file'), moveFrom: oldFile }
      ])

      await helpers.syncAll()

      should(await helpers.remote.tree()).deepEqual([
        '.cozy_trash/',
        'dst/',
        'dst/file',
        'src/'
      ])
    })

    it('remote', async () => {
      const oldFile = await pouch.byRemoteIdMaybe(file._id)
      await prep.moveFileAsync(
        'remote',
        _.merge(
          _.pick(oldFile, [
            'docType',
            'size',
            'md5sum',
            'class',
            'mime',
            'tags'
          ]),
          {
            path: 'dst/file',
            updated_at: '2017-06-19T08:19:26.769Z',
            remote: {
              _id: file._id,
              _rev: dbBuilders.rev()
            }
          }
        ),
        oldFile
      )

      should(helpers.putDocs('path', '_deleted', 'trashed')).deepEqual([
        { path: path.normalize('src/file'), _deleted: true },
        { path: path.normalize('dst/file') }
      ])

      await helpers.syncAll()

      should(await helpers.local.tree()).deepEqual(['dst/', 'dst/file', 'src/'])
    })

    it('local overwriting other file', async () => {
      const existing = await cozy.files.create('foo', {
        name: 'file',
        dirID: dst._id
      })
      await helpers.remote.pullChanges()
      await helpers.syncAll()
      // We don't want the calls made above to show up in our expectations
      helpers.resetPouchSpy()

      const oldFile = await pouch.byRemoteIdMaybe(file._id)
      await prep.moveFileAsync(
        'local',
        _.merge(
          {
            path: 'dst/file',
            updated_at: '2017-06-19T08:19:26.769Z'
          },
          _.pick(oldFile, [
            'docType',
            'md5sum',
            'mime',
            'class',
            'size',
            'sides'
          ])
        ),
        oldFile
      )

      should(
        helpers.putDocs(
          'path',
          '_deleted',
          'trashed',
          'moveFrom',
          'overwrite.path'
        )
      ).deepEqual([
        { path: path.normalize('src/file'), _deleted: true },
        {
          path: path.normalize('dst/file'),
          moveFrom: oldFile,
          overwrite: { path: 'dst/file' }
        }
      ])

      await helpers.syncAll()

      should(await helpers.remote.tree()).deepEqual([
        '.cozy_trash/',
        '.cozy_trash/file',
        'dst/',
        'dst/file',
        'src/'
      ])
      should(await helpers.remote.byIdMaybe(existing._id)).have.property(
        'trashed',
        true
      )
      should(await helpers.remote.byIdMaybe(oldFile.remote._id)).not.be.null()
    })

    context('local to an ignored path', () => {
      it('trashes the file on the remote Cozy', async () => {
        const oldFile = await pouch.byRemoteIdMaybe(file._id)
        await prep.moveFileAsync(
          'local',
          _.merge(
            {
              path: 'dst/file.tmp',
              updated_at: '2017-06-19T08:19:26.769Z'
            },
            _.pick(oldFile, ['docType', 'md5sum', 'mime', 'class', 'size'])
          ),
          oldFile
        )

        should(
          helpers.putDocs('path', 'deleted', 'trashed', 'moveFrom')
        ).deepEqual([{ path: path.normalize('src/file'), deleted: true }])

        await helpers.syncAll()

        should(await helpers.remote.tree()).deepEqual([
          '.cozy_trash/',
          '.cozy_trash/file',
          'dst/',
          'src/'
        ])
      })

      context('after a previous local move', () => {
        const intermediaryPath = path.normalize('dst/file-moved')
        beforeEach(async () => {
          const oldFile = await pouch.byRemoteIdMaybe(file._id)
          await prep.moveFileAsync(
            'local',
            _.merge(
              {
                path: intermediaryPath,
                updated_at: '2017-06-19T08:19:26.769Z'
              },
              _.pick(oldFile, ['docType', 'md5sum', 'mime', 'class', 'size'])
            ),
            oldFile
          )
          helpers.resetPouchSpy()
        })

        it('trashes the file on the remote Cozy', async () => {
          const oldFile = await pouch.byRemoteIdMaybe(file._id)
          await prep.moveFileAsync(
            'local',
            _.merge(
              {
                path: 'dst/file.tmp',
                updated_at: '2017-06-19T08:19:26.769Z'
              },
              _.pick(oldFile, ['docType', 'md5sum', 'mime', 'class', 'size'])
            ),
            oldFile
          )

          should(
            helpers.putDocs('path', 'deleted', 'trashed', 'moveFrom')
          ).deepEqual([
            {
              path: intermediaryPath,
              deleted: true
            }
          ])

          await helpers.syncAll()

          should(await helpers.remote.tree()).deepEqual([
            '.cozy_trash/',
            '.cozy_trash/file',
            'dst/',
            'src/'
          ])
        })
      })
    })

    describe('with synced file update', () => {
      it('local', async () => {
        await helpers.local.syncDir.outputFile(
          'src/file',
          'updated file content'
        )
        await helpers.flushLocalAndSyncAll()
        await helpers.local.syncDir.rename('src/file', 'file2')
        await helpers.flushLocalAndSyncAll()

        should(await helpers.docByPath('src/file2')).match({
          remote: { _id: file._id }
        })
        should(await helpers.remote.readFile('src/file2')).eql(
          'updated file content'
        )
        should(await helpers.local.readFile('src/file2')).eql(
          'updated file content'
        )
      })

      it('remote', async () => {
        await cozy.files.updateById(file._id, 'updated file content', {})
        await helpers.pullAndSyncAll()
        const was = await pouch.byRemoteId(file._id)
        await helpers._remote.moveAsync(
          {
            ...was,
            path: path.normalize('src/file2')
          },
          was
        )
        await helpers.pullAndSyncAll()

        should(await helpers.docByPath('src/file2')).match({
          remote: { _id: file._id }
        })
        should(await helpers.remote.readFile('src/file2')).eql(
          'updated file content'
        )
        should(await helpers.local.readFile('src/file2')).eql(
          'updated file content'
        )
      })
    })

    describe('with unsynced file update', () => {
      context('local', () => {
        it('moves and updates the file on the remote Cozy', async () => {
          await helpers.local.syncDir.outputFile(
            'src/file',
            'updated file content'
          )
          await helpers.local.scan()
          await helpers.local.syncDir.rename('src/file', 'file2')
          await helpers.flushLocalAndSyncAll()

          should(await helpers.docByPath('src/file2')).match({
            remote: { _id: file._id }
          })
          should(await helpers.remote.readFile('src/file2')).eql(
            'updated file content'
          )
          should(await helpers.local.readFile('src/file2')).eql(
            'updated file content'
          )
        })
      })

      context('remote', () => {
        it('moves and updates the file on the local filesystem', async () => {
          await cozy.files.updateById(file._id, 'updated file content', {})
          await helpers.remote.pullChanges()
          const was = await pouch.byRemoteId(file._id)
          await helpers._remote.moveAsync(
            {
              ...was,
              path: path.normalize('src/file2')
            },
            was
          )
          await helpers.pullAndSyncAll()

          should(await helpers.docByPath('src/file2')).match({
            remote: { _id: file._id }
          })
          should(await helpers.remote.readFile('src/file2')).eql(
            'updated file content'
          )
          should(await helpers.local.readFile('src/file2')).eql(
            'updated file content'
          )
        })
      })
    })
  })

  describe('unsynced local file', () => {
    beforeEach(async () => {
      await helpers.local.syncDir.ensureDir('src')
      await helpers.local.syncDir.ensureDir('dst')
      await helpers.local.scan()
      await helpers.syncAll()

      await helpers.local.syncDir.outputFile(
        'src/file',
        'whatever file content'
      )
      await helpers.local.scan()
    })

    it('moved during sync', async () => {
      should(await helpers.local.tree()).deepEqual(['dst/', 'src/', 'src/file'])
      await helpers.local.syncDir.move('src/file', 'dst/file')
      // Sync will fail since file was already moved.
      await helpers.syncAll()
      // This will prepend made up unlink event to scan add one, ending up as
      // the expected move.
      await helpers.local.scan()
      await helpers.syncAll()

      should(await helpers.trees('metadata', 'remote')).deepEqual({
        remote: ['dst/', 'dst/file', 'src/'],
        metadata: ['dst/', 'dst/file', 'src/']
      })
    })

    it('moved before sync', async () => {
      should(await helpers.local.tree()).deepEqual(['dst/', 'src/', 'src/file'])
      await helpers.local.syncDir.move('src/file', 'dst/file')
      await helpers.local.scan()
      await helpers.syncAll()

      should(await helpers.trees('metadata', 'remote')).deepEqual({
        remote: ['dst/', 'dst/file', 'src/'],
        metadata: ['dst/', 'dst/file', 'src/']
      })
    })
  })

  describe('directory', () => {
    let dir, dst

    beforeEach(async () => {
      const parent = await cozy.files.createDirectory({ name: 'parent' })
      const src = await cozy.files.createDirectory({
        name: 'src',
        dirID: parent._id
      })
      dst = await cozy.files.createDirectory({ name: 'dst', dirID: parent._id })
      dir = await cozy.files.createDirectory({ name: 'dir', dirID: src._id })
      await cozy.files.createDirectory({
        name: 'empty-subdir',
        dirID: dir._id
      })
      const subdir = await cozy.files.createDirectory({
        name: 'subdir',
        dirID: dir._id
      })
      await cozy.files.create('foo', { name: 'file', dirID: subdir._id })

      await helpers.remote.pullChanges()
      await helpers.syncAll()
      helpers.spyPouch()
    })

    it('local', async () => {
      const oldFolder = await pouch.byRemoteIdMaybe(dir._id)
      const doc = builders
        .metadir()
        .path('parent/dst/dir')
        .build()

      await prep.moveFolderAsync('local', doc, oldFolder)

      should(
        helpers.putDocs('path', '_deleted', 'trashed', 'childMove')
      ).deepEqual([
        { path: path.normalize('parent/src/dir'), _deleted: true },
        { path: path.normalize('parent/dst/dir') },
        {
          path: path.normalize('parent/src/dir/empty-subdir'),
          _deleted: true,
          childMove: true
        },
        { path: path.normalize('parent/dst/dir/empty-subdir') },
        {
          path: path.normalize('parent/src/dir/subdir'),
          _deleted: true,
          childMove: true
        },
        { path: path.normalize('parent/dst/dir/subdir') },
        {
          path: path.normalize('parent/src/dir/subdir/file'),
          _deleted: true,
          childMove: true
        },
        { path: path.normalize('parent/dst/dir/subdir/file') }
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

    it('from remote cozy', async () => {
      await cozy.files.updateAttributesById(dir._id, { dir_id: dst._id })
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

      const subdir = await cozy.files.statByPath('/parent/dst/dir/subdir')
      should(await helpers.pouch.byRemoteId(subdir._id))
        .have.propertyByPath('remote', '_rev')
        .eql(subdir._rev)
    })

    it('from remote client', async () => {
      const was = await pouch.byRemoteId(dir._id)
      await helpers._remote.moveAsync(
        {
          ...was,
          path: path.normalize('parent/dst/dir')
        },
        was
      )

      await helpers.remote.pullChanges()

      /* FIXME: Wrong order
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

      should(
        (await helpers.local.tree())
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

    it('local overwriting other directory', async () => {
      const existing = await cozy.files.createDirectory({
        name: 'dir',
        dirID: dst._id
      })
      // The file deletion would be merged by another event but even without
      // that event, we'll delete it remotely.
      await cozy.files.create('foo', {
        name: 'file',
        dirID: existing._id
      })
      await helpers.remote.pullChanges()
      await helpers.syncAll()
      // We don't want the calls made above to show up in our expectations
      helpers.resetPouchSpy()

      const oldFolder = await pouch.byRemoteIdMaybe(dir._id)
      const doc = builders
        .metadir()
        .path('parent/dst/dir')
        .build()

      await prep.moveFolderAsync('local', doc, oldFolder)

      should(
        helpers.putDocs(
          'path',
          '_deleted',
          'trashed',
          'childMove',
          'overwrite.path'
        )
      ).deepEqual([
        { path: path.normalize('parent/src/dir'), _deleted: true },
        {
          path: path.normalize('parent/dst/dir'),
          overwrite: { path: 'parent/dst/dir' }
        },
        {
          path: path.normalize('parent/src/dir/empty-subdir'),
          _deleted: true,
          childMove: true
        },
        { path: path.normalize('parent/dst/dir/empty-subdir') },
        {
          path: path.normalize('parent/src/dir/subdir'),
          _deleted: true,
          childMove: true
        },
        { path: path.normalize('parent/dst/dir/subdir') },
        {
          path: path.normalize('parent/src/dir/subdir/file'),
          _deleted: true,
          childMove: true
        },
        { path: path.normalize('parent/dst/dir/subdir/file') }
      ])

      await helpers.syncAll()

      should(await helpers.remote.tree()).deepEqual([
        '.cozy_trash/',
        '.cozy_trash/dir/',
        '.cozy_trash/dir/file',
        'parent/',
        'parent/dst/',
        'parent/dst/dir/',
        'parent/dst/dir/empty-subdir/',
        'parent/dst/dir/subdir/',
        'parent/dst/dir/subdir/file',
        'parent/src/'
      ])

      should(await helpers.remote.byIdMaybe(existing._id)).have.property(
        'path',
        '/.cozy_trash/dir'
      )
      should(await helpers.remote.byIdMaybe(oldFolder.remote._id)).not.be.null()
    })

    context('local to an ignored path', () => {
      // XXX: We should try to trash the entire folder and keep its hierarchy
      // but we're deleting the content first so the file is deleted before its
      // parents which get completely erased from the Cozy since they're empty
      // when we finally trash them.
      it('trashes the folder content on the remote Cozy', async () => {
        const oldFolder = await pouch.byRemoteIdMaybe(dir._id)
        const doc = builders
          .metadir()
          .path('.system-tmp-cozy-drive/dir')
          .build()

        await prep.moveFolderAsync('local', doc, oldFolder)

        should(
          helpers.putDocs('path', 'deleted', 'trashed', 'childMove')
        ).deepEqual([
          {
            path: path.normalize('parent/src/dir/subdir/file'),
            deleted: true
          },
          {
            path: path.normalize('parent/src/dir/subdir'),
            deleted: true
          },
          {
            path: path.normalize('parent/src/dir/empty-subdir'),
            deleted: true
          },
          { path: path.normalize('parent/src/dir'), deleted: true }
        ])

        await helpers.syncAll()

        should(await helpers.remote.tree()).deepEqual([
          '.cozy_trash/',
          '.cozy_trash/file',
          'parent/',
          'parent/dst/',
          'parent/src/'
        ])
      })

      context('after a previous local move', () => {
        beforeEach(async () => {
          const oldFolder = await pouch.byRemoteIdMaybe(dir._id)
          const doc = builders
            .metadir(oldFolder)
            .path('parent/dst/dir')
            .build()

          await prep.moveFolderAsync('local', doc, oldFolder)
          helpers.resetPouchSpy()
        })

        // XXX: We have the expected behavior of trashing the entire directory
        // with its hierarchy because the `moveFrom` and `childMove` attributes
        // of its children records are not deleted and thus Sync tries to apply
        // child moves rather than deletions and child moves are not applied (we
        // move their parent instead).
        it('trashes the folder content on the remote Cozy', async () => {
          const oldFolder = await pouch.byRemoteIdMaybe(dir._id)
          const doc = builders
            .metadir(oldFolder)
            .path('.system-tmp-cozy-drive/dir')
            .build()

          await prep.moveFolderAsync('local', doc, oldFolder)

          should(
            helpers.putDocs('path', 'deleted', 'trashed', 'childMove')
          ).deepEqual([
            {
              path: path.normalize('parent/dst/dir/subdir/file'),
              deleted: true
            },
            {
              path: path.normalize('parent/dst/dir/subdir'),
              deleted: true
            },
            {
              path: path.normalize('parent/dst/dir/empty-subdir'),
              deleted: true
            },
            { path: path.normalize('parent/dst/dir'), deleted: true }
          ])

          await helpers.syncAll()

          should(await helpers.remote.tree()).deepEqual([
            '.cozy_trash/',
            '.cozy_trash/dir/',
            '.cozy_trash/dir/empty-subdir/',
            '.cozy_trash/dir/subdir/',
            '.cozy_trash/dir/subdir/file',
            'parent/',
            'parent/dst/',
            'parent/src/'
          ])
        })
      })
    })

    describe('with synced file update', () => {
      let file
      beforeEach(async () => {
        file = await cozy.files.create('initial file content', {
          name: 'file',
          dirID: dir._id
        })
        await helpers.remote.pullChanges()
        await helpers.syncAll()

        await cozy.files.updateById(file._id, 'updated file content', {})
        await helpers.remote.pullChanges()
        await helpers.syncAll()
      })

      it('local', async () => {
        should(await helpers.local.tree()).deepEqual([
          'parent/',
          'parent/dst/',
          'parent/src/',
          'parent/src/dir/',
          'parent/src/dir/empty-subdir/',
          'parent/src/dir/file',
          'parent/src/dir/subdir/',
          'parent/src/dir/subdir/file'
        ])
        await helpers.local.syncDir.rename('parent/src/dir/', 'dir2')
        await helpers.local.scan()
        await helpers.syncAll()

        should(await helpers.docByPath('parent/src/dir2/file')).match({
          remote: { _id: file._id }
        })
        should(await helpers.remote.readFile('parent/src/dir2/file')).eql(
          'updated file content'
        )
        should(await helpers.local.readFile('parent/src/dir2/file')).eql(
          'updated file content'
        )
      })

      it('remote', async () => {
        should(await helpers.local.tree()).deepEqual([
          'parent/',
          'parent/dst/',
          'parent/src/',
          'parent/src/dir/',
          'parent/src/dir/empty-subdir/',
          'parent/src/dir/file',
          'parent/src/dir/subdir/',
          'parent/src/dir/subdir/file'
        ])
        const was = await pouch.byRemoteId(dir._id)
        await helpers._remote.moveAsync(
          {
            ...was,
            path: path.normalize('parent/src/dir2')
          },
          was
        )
        await helpers.remote.pullChanges()
        await helpers.syncAll()

        should(await helpers.docByPath('parent/src/dir2/file')).match({
          remote: { _id: file._id }
        })
        should(await helpers.remote.readFile('parent/src/dir2/file')).eql(
          'updated file content'
        )
        should(await helpers.local.readFile('parent/src/dir2/file')).eql(
          'updated file content'
        )
      })
    })

    describe('with unsynced file update', () => {
      let file
      beforeEach(async () => {
        file = await cozy.files.create('initial file content', {
          name: 'file',
          dirID: dir._id
        })
        await helpers.pullAndSyncAll()
        await helpers.flushLocalAndSyncAll()
      })

      it('local', async () => {
        should(await helpers.local.tree()).deepEqual([
          'parent/',
          'parent/dst/',
          'parent/src/',
          'parent/src/dir/',
          'parent/src/dir/empty-subdir/',
          'parent/src/dir/file',
          'parent/src/dir/subdir/',
          'parent/src/dir/subdir/file'
        ])
        await helpers.local.syncDir.outputFile(
          'parent/src/dir/file',
          'updated file content'
        )
        await helpers.local.scan()
        await helpers.local.syncDir.rename('parent/src/dir/', 'dir2')
        await helpers.local.scan()
        await helpers.syncAll()

        should(await helpers.docByPath('parent/src/dir2/file')).match({
          remote: { _id: file._id }
        })
        should(await helpers.remote.readFile('parent/src/dir2/file')).eql(
          'updated file content'
        )
        should(await helpers.local.readFile('parent/src/dir2/file')).eql(
          'updated file content'
        )
      })

      it('remote', async () => {
        should(await helpers.local.tree()).deepEqual([
          'parent/',
          'parent/dst/',
          'parent/src/',
          'parent/src/dir/',
          'parent/src/dir/empty-subdir/',
          'parent/src/dir/file',
          'parent/src/dir/subdir/',
          'parent/src/dir/subdir/file'
        ])
        await cozy.files.updateById(file._id, 'updated file content', {})
        await helpers.remote.pullChanges()
        const was = await pouch.byRemoteId(dir._id)
        await helpers._remote.moveAsync(
          {
            ...was,
            path: path.normalize('parent/src/dir2')
          },
          was
        )
        await helpers.remote.pullChanges()
        await helpers.syncAll()

        should(await helpers.docByPath('parent/src/dir2/file')).match({
          remote: { _id: file._id }
        })
        should(await helpers.remote.readFile('parent/src/dir2/file')).eql(
          'updated file content'
        )
        should(await helpers.local.readFile('parent/src/dir2/file')).eql(
          'updated file content'
        )
      })
    })

    describe('with unsynced file', () => {
      beforeEach(async () => {
        await helpers.local.syncDir.ensureDir('parent/src/dir')
        await helpers.local.scan()
        await helpers.syncAll()
        await helpers.local.syncDir.outputFile(
          'parent/src/dir/file',
          'whatever file content'
        )
        await helpers.local.scan()
      })

      it('local', async () => {
        should(await helpers.local.tree()).deepEqual([
          'parent/',
          'parent/dst/',
          'parent/src/',
          'parent/src/dir/',
          'parent/src/dir/empty-subdir/',
          'parent/src/dir/file',
          'parent/src/dir/subdir/',
          'parent/src/dir/subdir/file'
        ])
        await helpers.local.syncDir.rename('parent/src/dir/', 'dir2')
        // Sync will fail since file was already moved.
        await helpers.syncAll()
        // This will prepend made up unlink event to scan add one, ending up as
        // the expected move.
        await helpers.local.scan()
        await helpers.syncAll()
        should(await helpers.trees('metadata', 'remote')).deepEqual({
          remote: [
            'parent/',
            'parent/dst/',
            'parent/src/',
            'parent/src/dir2/',
            'parent/src/dir2/empty-subdir/',
            'parent/src/dir2/file',
            'parent/src/dir2/subdir/',
            'parent/src/dir2/subdir/file'
          ],
          metadata: [
            'parent/',
            'parent/dst/',
            'parent/src/',
            'parent/src/dir2/',
            'parent/src/dir2/empty-subdir/',
            'parent/src/dir2/file',
            'parent/src/dir2/subdir/',
            'parent/src/dir2/subdir/file'
          ]
        })
      })

      it('on initial scan with parent move', async () => {
        should(await helpers.local.tree()).deepEqual([
          'parent/',
          'parent/dst/',
          'parent/src/',
          'parent/src/dir/',
          'parent/src/dir/empty-subdir/',
          'parent/src/dir/file',
          'parent/src/dir/subdir/',
          'parent/src/dir/subdir/file'
        ])
        const was = await pouch.byRemoteId(dir._id)
        await helpers._remote.moveAsync(
          {
            ...was,
            path: path.normalize('parent/dst/dir')
          },
          was
        )
        await helpers.pullAndSyncAll()
        should(await helpers.trees('metadata', 'remote')).deepEqual({
          remote: [
            'parent/',
            'parent/dst/',
            'parent/dst/dir/',
            'parent/dst/dir/empty-subdir/',
            'parent/dst/dir/file',
            'parent/dst/dir/subdir/',
            'parent/dst/dir/subdir/file',
            'parent/src/'
          ],
          metadata: [
            'parent/',
            'parent/dst/',
            'parent/dst/dir/',
            'parent/dst/dir/empty-subdir/',
            'parent/dst/dir/file',
            'parent/dst/dir/subdir/',
            'parent/dst/dir/subdir/file',
            'parent/src/'
          ]
        })
      })
    })
  })

  describe('unsynced local directory', () => {
    beforeEach(async () => {
      await helpers.local.syncDir.ensureDir('src')
      await helpers.local.syncDir.ensureDir('dst')
      await helpers.local.scan()
      await helpers.syncAll()

      await helpers.local.syncDir.ensureDir('src/dir')
      await helpers.local.scan()
    })

    it('moved during sync', async () => {
      should(await helpers.local.tree()).deepEqual(['dst/', 'src/', 'src/dir/'])
      await helpers.local.syncDir.move('src/dir', 'dst/dir')
      // Sync will fail since file was already moved.
      await helpers.syncAll()
      // This will prepend made up unlink event to scan add one, ending up as
      // the expected move.
      await helpers.local.scan()
      await helpers.syncAll()

      should(await helpers.trees('metadata', 'remote')).deepEqual({
        remote: ['dst/', 'dst/dir/', 'src/'],
        metadata: ['dst/', 'dst/dir/', 'src/']
      })
    })

    it('moved before sync', async () => {
      should(await helpers.local.tree()).deepEqual(['dst/', 'src/', 'src/dir/'])
      await helpers.local.syncDir.move('src/dir', 'dst/dir')
      await helpers.local.scan()
      await helpers.syncAll()

      should(await helpers.trees('metadata', 'remote')).deepEqual({
        remote: ['dst/', 'dst/dir/', 'src/'],
        metadata: ['dst/', 'dst/dir/', 'src/']
      })
    })

    it('moved twice before sync', async () => {
      should(await helpers.local.tree()).deepEqual(['dst/', 'src/', 'src/dir/'])
      await helpers.local.syncDir.move('src/dir', 'dst/dir')
      await helpers.local.scan()
      await helpers.local.syncDir.move('dst/dir', 'dst/final')
      await helpers.local.scan()
      await helpers.syncAll()

      should(await helpers.trees('metadata', 'remote')).deepEqual({
        remote: ['dst/', 'dst/final/', 'src/'],
        metadata: ['dst/', 'dst/final/', 'src/']
      })
    })
  })

  onPlatform('darwin', () => {
    describe('unsynced remote file move followed by content update', () => {
      context('with a case change in file name', () => {
        let file
        beforeEach('create normalized file', async () => {
          const parent = await cozy.files.createDirectory({
            name: 'Sujets'
          })
          file = await cozy.files.create('initial content', {
            name: 'ds-1.pdf',
            dirID: parent._id
          })
          await helpers.pullAndSyncAll()
          await helpers.flushLocalAndSyncAll()
        })

        it('does not trash the file', async () => {
          await cozy.files.updateAttributesById(file._id, {
            name: 'DS-1.pdf'
          })
          await helpers.remote.pullChanges()
          await cozy.files.updateById(file._id, 'updated content', {})
          await helpers.pullAndSyncAll()

          should(await helpers.docByPath('Sujets/DS-1.pdf')).match({
            remote: { _id: file._id }
          })
          should(await helpers.remote.readFile('Sujets/DS-1.pdf')).eql(
            'updated content'
          )
          should(await helpers.local.readFile('Sujets/DS-1.pdf')).eql(
            'updated content'
          )
        })
      })

      context('with a normalization difference in parent path', () => {
        let file
        beforeEach('create normalized file', async () => {
          const parent = await cozy.files.createDirectory({
            name: 'énoncés'
          })
          file = await cozy.files.create('initial content', {
            name: 'sujet.pdf',
            dirID: parent._id
          })
          await helpers.pullAndSyncAll()
          await helpers.flushLocalAndSyncAll()

          // Fake local re-normalization from NFC to NFD
          const doc = await helpers.docByPath(
            path.join(parent.attributes.name, file.attributes.name)
          )
          await helpers.pouch.put(
            ({
              ...doc,
              path: doc.path.normalize('NFD')
            } /*: SavedMetadata */)
          )
        })

        it('does not trash the file', async () => {
          await cozy.files.updateAttributesById(file._id, {
            name: 'DS-1.pdf'
          })
          await helpers.remote.pullChanges()
          await cozy.files.updateById(file._id, 'updated content', {})
          await helpers.pullAndSyncAll()

          should(await helpers.docByPath('énoncés/DS-1.pdf')).match({
            remote: { _id: file._id }
          })
          should(await helpers.remote.readFile('énoncés/DS-1.pdf')).eql(
            'updated content'
          )
          should(await helpers.local.readFile('énoncés/DS-1.pdf')).eql(
            'updated content'
          )
        })
      })
    })
  })
})
