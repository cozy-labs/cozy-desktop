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

const { ROOT_DIR_ID, TRASH_DIR_ID } = require('../../core/remote/constants')

const logger = require('../../core/utils/logger')
const log = new logger({ component: 'TEST' })

/*::
import type { SavedMetadata } from '../../core/metadata'
*/

const builders = new Builders()
const cozy = cozyHelpers.cozy

const skipRemoteChanges = async ({ helpers, cozy }) => {
  const since = await helpers.pouch.getRemoteSeq()
  const { last_seq } = await cozy.data.changesFeed('io.cozy.files', {
    since,
    limit: 10000
  })
  await helpers.pouch.setRemoteSeq(last_seq)
}

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
            path: path.normalize('dst/file'),
            updated_at: '2017-06-19T08:19:26.769Z'
          },
          _.pick(oldFile, ['docType', 'md5sum', 'mime', 'class', 'size'])
        ),
        oldFile
      )

      should(
        helpers.putDocs('path', '_deleted', 'trashed', 'moveFrom')
      ).deepEqual([{ path: path.normalize('dst/file'), moveFrom: oldFile }])

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
            path: path.normalize('dst/file'),
            updated_at: '2017-06-19T08:19:26.769Z',
            remote: {
              _id: file._id,
              _rev: dbBuilders.rev()
            }
          }
        ),
        oldFile
      )

      should(
        helpers.putDocs('path', '_deleted', 'trashed', 'moveFrom')
      ).deepEqual([{ path: path.normalize('dst/file'), moveFrom: oldFile }])

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
            path: path.normalize('dst/file'),
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
        {
          path: path.normalize('dst/file'),
          moveFrom: oldFile,
          overwrite: { path: path.normalize('dst/file') }
        },
        { path: path.normalize('dst/file'), _deleted: true } // XXX: This is actually called first
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
              path: path.normalize('dst/file.tmp'),
              updated_at: '2017-06-19T08:19:26.769Z'
            },
            _.pick(oldFile, ['docType', 'md5sum', 'mime', 'class', 'size'])
          ),
          oldFile
        )

        should(
          helpers.putDocs('path', 'deleted', 'trashed', 'moveFrom')
        ).deepEqual([{ path: path.normalize('src/file'), trashed: true }])

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
                path: path.normalize('dst/file.tmp'),
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
              trashed: true
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
        await helpers.remote.move(was.remote, path.normalize('src/file2'))
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
          await helpers.remote.move(was.remote, path.normalize('src/file2'))
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

  describe('synced file', () => {
    let file

    beforeEach(async () => {
      file = await cozy.files.create('File content...', {
        name: 'file',
        dirID: ROOT_DIR_ID
      })
      await helpers.pullAndSyncAll()
    })

    const moveFile = async () => {
      await helpers.local.syncDir.move('file', 'renamed')
      await helpers.local.scan()
    }

    context('overwritting existing remote file', () => {
      let existing

      beforeEach(async () => {
        existing = await cozy.files.create('Overwritten content...', {
          name: 'renamed',
          dirID: ROOT_DIR_ID
        })
        await helpers.pullAndSyncAll()
      })

      // This situation is an anomaly. We should not miss any remote
      // changes as this would mean we're desynchronized.
      // However, this does happen sometimes at the moment and we'll try to get
      // back on our feets.
      context('while we missed the overwritten file remote deletion', () => {
        beforeEach(async () => {
          // Destroy existing file on Cozy
          await cozy.files.destroyById(existing._id)
          // Fake missing the remote change by skipping its sequence
          skipRemoteChanges({ helpers, cozy })
        })

        // We should be retrying a few times and then finally skip the change to
        // avoid looping over it.
        it('ends up moving the file', async () => {
          await moveFile()
          await helpers.syncAll()

          should(await helpers.trees()).deepEqual({
            local: ['renamed'],
            remote: ['renamed']
          })
          await should(helpers.local.readFile('renamed')).be.fulfilledWith(
            'File content...'
          )
          await should(helpers.remote.readFile('renamed')).be.fulfilledWith(
            'File content...'
          )
        })
      })

      // This situation is an anomaly. We should not miss any remote
      // changes as this would mean we're desynchronized.
      // However, this does happen sometimes at the moment and we'll try to get
      // back on our feets.
      context('while we missed the moved file remote deletion', () => {
        beforeEach(async () => {
          // Destroy moved file on Cozy
          await cozy.files.destroyById(file._id)
          // Fake missing the remote change by skipping its sequence
          skipRemoteChanges({ helpers, cozy })
        })

        // We should be retrying a few times and then finally skip the change to
        // avoid looping over it.
        it('ends up replacing the overwritten file', async () => {
          await moveFile()
          await helpers.syncAll()

          should(await helpers.trees()).deepEqual({
            local: ['renamed'],
            remote: ['renamed']
          })
          await should(helpers.local.readFile('renamed')).be.fulfilledWith(
            'File content...'
          )
          await should(helpers.remote.readFile('renamed')).be.fulfilledWith(
            'File content...'
          )
          should(await helpers.remote.byIdMaybe(existing._id)).have.property(
            'trashed',
            true
          )
        })
      })
    })

    // This situation is an anomaly. We should not miss any remote
    // changes as this would mean we're desynchronized.
    // However, this does happen sometimes at the moment and we'll try to get
    // back on our feets.
    context('while we missed the moved file remote deletion', () => {
      beforeEach(async () => {
        // Destroy moved file on Cozy
        await cozy.files.destroyById(file._id)
        // Fake missing the remote change by skipping its sequence
        skipRemoteChanges({ helpers, cozy })
      })

      // We should be retrying a few times and then finally skip the change to
      // avoid looping over it.
      it('ends up re-uploading the file at the destination', async () => {
        await moveFile()
        await helpers.syncAll()

        should(await helpers.trees()).deepEqual({
          local: ['renamed'],
          remote: ['renamed']
        })
        await should(helpers.local.readFile('renamed')).be.fulfilledWith(
          'File content...'
        )
        await should(helpers.remote.readFile('renamed')).be.fulfilledWith(
          'File content...'
        )
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
        { path: path.normalize('parent/dst/dir') },
        { path: path.normalize('parent/dst/dir/empty-subdir') },
        { path: path.normalize('parent/dst/dir/subdir') },
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
      await helpers.remote.move(was.remote, path.normalize('parent/dst/dir'))

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
        {
          path: path.normalize('parent/dst/dir'),
          overwrite: { path: path.normalize('parent/dst/dir') }
        },
        { path: path.normalize('parent/dst/dir/empty-subdir') },
        { path: path.normalize('parent/dst/dir/subdir') },
        { path: path.normalize('parent/dst/dir/subdir/file') },
        {
          path: path.normalize('parent/dst/dir'),
          _deleted: true
        }
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
      it('trashes the folder and its content on the remote Cozy', async () => {
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
            trashed: true
          },
          {
            path: path.normalize('parent/src/dir/subdir'),
            trashed: true
          },
          {
            path: path.normalize('parent/src/dir/empty-subdir'),
            trashed: true
          },
          { path: path.normalize('parent/src/dir'), trashed: true }
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

      context('after a previous local move', () => {
        beforeEach(async () => {
          const oldFolder = await pouch.byRemoteIdMaybe(dir._id)
          const doc = builders
            .metadir(oldFolder)
            .path('parent/dst/dir')
            .unmerged('local')
            .build()

          await prep.moveFolderAsync('local', doc, oldFolder)
          helpers.resetPouchSpy()
        })

        it('trashes the folder and its content on the remote Cozy', async () => {
          const oldFolder = await pouch.byRemoteIdMaybe(dir._id)
          const doc = builders
            .metadir(oldFolder)
            .path('.system-tmp-cozy-drive/dir')
            .unmerged('local')
            .build()

          await prep.moveFolderAsync('local', doc, oldFolder)

          should(
            helpers.putDocs('path', 'deleted', 'trashed', 'childMove')
          ).deepEqual([
            {
              path: path.normalize('parent/dst/dir/subdir/file'),
              trashed: true
            },
            {
              path: path.normalize('parent/dst/dir/subdir'),
              trashed: true
            },
            {
              path: path.normalize('parent/dst/dir/empty-subdir'),
              trashed: true
            },
            { path: path.normalize('parent/dst/dir'), trashed: true }
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
        log.info('TEST START')
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
        await helpers.remote.move(was.remote, path.normalize('parent/src/dir2'))
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

    describe('with unsynced child file update on the same side', () => {
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
        await helpers.remote.move(was.remote, path.normalize('parent/src/dir2'))
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

    // FIXME: This test can't pass for now for multiple reasons:
    // - metadata.updateLocal will overwrite the file's local metadata with its
    //   main metadata (which was modified by the remote update) when merging
    //   the local parent move (see the call to `updateLocal` in
    //   `Merge.moveFolderRecursivelyAsync`)
    // - we can't deal with changes from both sides for the moment because of
    //   the way to track the modifications via the `sides` attribute
    describe.skip('with unsynced child file update on the other side', () => {
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
        await cozy.files.updateById(file._id, 'updated file content', {})
        await helpers.remote.pullChanges()
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
        await helpers.local.syncDir.outputFile(
          'parent/src/dir/file',
          'updated file content'
        )
        await helpers.local.scan()
        const was = await pouch.byRemoteId(dir._id)
        await helpers.remote.move(was.remote, path.normalize('parent/src/dir2'))
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
        await helpers.remote.move(was.remote, path.normalize('parent/dst/dir'))
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

  describe('synced directory', () => {
    let dir

    beforeEach(async () => {
      dir = await cozy.files.createDirectory({
        name: 'dir',
        dirID: ROOT_DIR_ID
      })
      await cozy.files.create('File content...', {
        name: 'file',
        dirID: dir._id
      })
      await helpers.pullAndSyncAll()
    })

    const moveDir = async () => {
      await helpers.local.syncDir.remove('renamed')
      await helpers.local.syncDir.move('dir', 'renamed')
      await helpers.local.scan()
    }

    context('overwritting existing remote directory', () => {
      let existing, overwritten

      beforeEach(async () => {
        existing = await cozy.files.createDirectory({
          name: 'renamed',
          dirID: ROOT_DIR_ID
        })
        overwritten = await cozy.files.create('Overwritten content...', {
          name: 'file',
          dirID: existing._id
        })
        await helpers.pullAndSyncAll()
      })

      // This situation is an anomaly. We should not miss any remote
      // changes as this would mean we're desynchronized.
      // However, this does happen sometimes at the moment and we'll try to get
      // back on our feets.
      context(
        'while we missed the overwritten directory remote deletion',
        () => {
          beforeEach(async () => {
            // Destroy existing directory on Cozy
            await cozy.files.destroyById(existing._id)
            // Fake missing the remote changes by skipping its sequence
            skipRemoteChanges({ helpers, cozy })
          })

          // We should be retrying a few times and then finally skip the change to
          // avoid looping over it.
          it('ends up moving the directory', async () => {
            await moveDir()
            await helpers.syncAll()

            should(await helpers.trees()).deepEqual({
              local: ['renamed/', 'renamed/file'],
              remote: ['renamed/', 'renamed/file']
            })
            await should(
              helpers.local.readFile('renamed/file')
            ).be.fulfilledWith('File content...')
            await should(
              helpers.remote.readFile('renamed/file')
            ).be.fulfilledWith('File content...')
          })
        }
      )

      // This situation is an anomaly. We should not miss any remote
      // changes as this would mean we're desynchronized.
      // However, this does happen sometimes at the moment and we'll try to get
      // back on our feets.
      context('while we missed the moved directory remote deletion', () => {
        beforeEach(async () => {
          // Destroy moved directory on Cozy
          await cozy.files.destroyById(dir._id)
          // Fake missing the remote changes by skipping its sequence
          skipRemoteChanges({ helpers, cozy })
        })

        // We should be retrying a few times and then finally skip the change to
        // avoid looping over it.
        it('ends up replacing the overwritten file', async () => {
          await moveDir()
          await helpers.syncAll()

          should(await helpers.trees()).deepEqual({
            local: ['renamed/', 'renamed/file'],
            remote: ['renamed/', 'renamed/file']
          })
          await should(helpers.local.readFile('renamed/file')).be.fulfilledWith(
            'File content...'
          )
          await should(
            helpers.remote.readFile('renamed/file')
          ).be.fulfilledWith('File content...')
          // Folders don't have a `trashed` attribute so we check it's in the
          // trash via its parent `dir_id`.
          should(await helpers.remote.byIdMaybe(existing._id)).have.property(
            'dir_id',
            TRASH_DIR_ID
          )
          should(await helpers.remote.byIdMaybe(overwritten._id)).have.property(
            'trashed',
            true
          )
        })
      })
    })

    // This situation is an anomaly. We should not miss any remote
    // changes as this would mean we're desynchronized.
    // However, this does happen sometimes at the moment and we'll try to get
    // back on our feets.
    context('while we missed the moved directory remote deletion', () => {
      beforeEach(async () => {
        // Destroy moved directory on Cozy
        await cozy.files.destroyById(dir._id)
        // Fake missing the remote changes by skipping its sequence
        skipRemoteChanges({ helpers, cozy })
      })

      // We should be retrying a few times and then finally skip the change to
      // avoid looping over it.
      it('ends up re-uploading the file at the destination', async () => {
        await moveDir()
        await helpers.syncAll()

        should(await helpers.trees()).deepEqual({
          local: ['renamed/', 'renamed/file'],
          remote: ['renamed/', 'renamed/file']
        })
        await should(helpers.local.readFile('renamed/file')).be.fulfilledWith(
          'File content...'
        )
        await should(helpers.remote.readFile('renamed/file')).be.fulfilledWith(
          'File content...'
        )
      })
    })
  })

  describe('unsynced local directory with content', () => {
    beforeEach(async () => {
      await helpers.local.syncDir.ensureDir('src')
      await helpers.local.syncDir.ensureDir('dst')
      await helpers.local.scan()
      await helpers.syncAll()

      await helpers.local.syncDir.ensureDir('src/dir')
      await helpers.local.syncDir.outputFile('src/dir/file', 'file content')
      await helpers.local.scan()
    })

    describe('during sync', () => {
      it('is created at destination', async () => {
        should(await helpers.local.tree()).deepEqual([
          'dst/',
          'src/',
          'src/dir/',
          'src/dir/file'
        ])
        await helpers.local.syncDir.move('src/dir', 'dst/dir')
        // Sync will fail since file was already moved.
        await helpers.syncAll()
        // This will prepend made up unlink event to scan add one, ending up as
        // the expected move.
        await helpers.local.scan()
        await helpers.syncAll()

        should(await helpers.trees('metadata', 'remote')).deepEqual({
          remote: ['dst/', 'dst/dir/', 'dst/dir/file', 'src/'],
          metadata: ['dst/', 'dst/dir/', 'dst/dir/file', 'src/']
        })
      })
    })

    describe('before sync', () => {
      it('is created at destination', async () => {
        should(await helpers.local.tree()).deepEqual([
          'dst/',
          'src/',
          'src/dir/',
          'src/dir/file'
        ])
        await helpers.local.syncDir.move('src/dir', 'dst/dir')
        await helpers.local.scan()
        await helpers.syncAll()

        should(await helpers.trees('metadata', 'remote')).deepEqual({
          remote: ['dst/', 'dst/dir/', 'dst/dir/file', 'src/'],
          metadata: ['dst/', 'dst/dir/', 'dst/dir/file', 'src/']
        })
      })
    })

    describe('twice before sync', () => {
      it('is created at destination', async () => {
        should(await helpers.local.tree()).deepEqual([
          'dst/',
          'src/',
          'src/dir/',
          'src/dir/file'
        ])
        await helpers.local.syncDir.move('src/dir', 'dst/dir')
        await helpers.local.scan()
        await helpers.local.syncDir.move('dst/dir', 'dst/final')
        await helpers.local.scan()
        await helpers.syncAll()

        should(await helpers.trees('metadata', 'remote')).deepEqual({
          remote: ['dst/', 'dst/final/', 'dst/final/file', 'src/'],
          metadata: ['dst/', 'dst/final/', 'dst/final/file', 'src/']
        })
      })
    })
  })

  describe('unsynced remote directory with content', () => {
    let syncedRemoteDocs, unsyncedRemoteDocs
    beforeEach(async () => {
      syncedRemoteDocs = await helpers.remote.createTree(['src/', 'dst/'])
      await helpers.remote.pullChanges()
      await helpers.syncAll()

      unsyncedRemoteDocs = await helpers.remote.createTree([
        'src/dir/',
        'src/dir/file'
      ])
      await helpers.remote.pullChanges()
    })

    describe('during sync', () => {
      it('is created at destination', async () => {
        should(await helpers.remote.treeWithoutTrash()).deepEqual([
          'dst/',
          'src/',
          'src/dir/',
          'src/dir/file'
        ])
        await helpers.remote.cozy.files.updateAttributesById(
          unsyncedRemoteDocs['src/dir/']._id,
          { dir_id: syncedRemoteDocs['dst/']._id }
        )
        // Sync will fail since file was already moved.
        await helpers.syncAll()
        // This will prepend made up unlink event to scan add one, ending up as
        // the expected move.
        await helpers.remote.pullChanges()
        await helpers.syncAll()

        should(await helpers.trees('metadata', 'remote')).deepEqual({
          remote: ['dst/', 'dst/dir/', 'dst/dir/file', 'src/'],
          metadata: ['dst/', 'dst/dir/', 'dst/dir/file', 'src/']
        })
      })
    })

    describe('before sync', () => {
      it('is created at destination', async () => {
        should(await helpers.remote.treeWithoutTrash()).deepEqual([
          'dst/',
          'src/',
          'src/dir/',
          'src/dir/file'
        ])
        await helpers.remote.cozy.files.updateAttributesById(
          unsyncedRemoteDocs['src/dir/']._id,
          { dir_id: syncedRemoteDocs['dst/']._id }
        )
        await helpers.remote.pullChanges()
        await helpers.syncAll()

        should(await helpers.trees('metadata', 'remote')).deepEqual({
          remote: ['dst/', 'dst/dir/', 'dst/dir/file', 'src/'],
          metadata: ['dst/', 'dst/dir/', 'dst/dir/file', 'src/']
        })
      })
    })

    describe('twice before sync', () => {
      it('is created at destination', async () => {
        should(await helpers.remote.treeWithoutTrash()).deepEqual([
          'dst/',
          'src/',
          'src/dir/',
          'src/dir/file'
        ])
        const movedDirId = unsyncedRemoteDocs['src/dir/']._id
        await helpers.remote.cozy.files.updateAttributesById(movedDirId, {
          dir_id: syncedRemoteDocs['dst/']._id
        })
        await helpers.remote.pullChanges()
        await helpers.remote.cozy.files.updateAttributesById(movedDirId, {
          name: 'final'
        })
        await helpers.remote.pullChanges()
        await helpers.syncAll()

        should(await helpers.trees('metadata', 'remote')).deepEqual({
          remote: ['dst/', 'dst/final/', 'dst/final/file', 'src/'],
          metadata: ['dst/', 'dst/final/', 'dst/final/file', 'src/']
        })
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
