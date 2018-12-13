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
const { IntegrationTestHelpers } = require('../support/helpers/integration')

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

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function () {
    helpers = new IntegrationTestHelpers(this.config, this.pouch, cozy)
    pouch = helpers._pouch
    prep = helpers.prep

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  describe('file', () => {
    let file, src

    beforeEach(async () => {
      await cozy.files.createDirectory({name: 'dst'})
      src = await cozy.files.createDirectory({name: 'src'})
      file = await cozy.files.create('foo', {name: 'file', dirID: src._id})

      await helpers.remote.pullChanges()
      await helpers.syncAll()
      helpers.spyPouch()
    })

    it('local', async () => {
      const oldFile = await pouch.byRemoteIdMaybeAsync(file._id)
      await prep.moveFileAsync('local', _.merge(
        {
          path: 'dst/file',
          updated_at: '2017-06-19T08:19:26.769Z'
        },
        _.pick(oldFile, ['docType', 'md5sum', 'mime', 'class', 'size'])
      ), oldFile)

      should(helpers.putDocs('path', '_deleted', 'trashed', 'moveFrom')).deepEqual([
        {path: path.normalize('src/file'), _deleted: true},
        {path: path.normalize('dst/file'), moveFrom: oldFile}
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
      const oldFile = await pouch.byRemoteIdMaybeAsync(file._id)
      await prep.moveFileAsync('remote', _.merge(
        _.pick(oldFile, ['docType', 'size', 'md5sum', 'class', 'mime', 'tags']),
        {
          path: 'dst/file',
          updated_at: '2017-06-19T08:19:26.769Z',
          remote: {
            _id: file._id,
            _rev: dbBuilders.rev()
          }
        }
      ), oldFile)

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

  describe('unsynced file', () => {
    beforeEach(async () => {
      await helpers.local.syncDir.ensureDir('src')
      await helpers.local.syncDir.ensureDir('dst')
      await helpers.local.scan()
      await helpers.syncAll()

      await helpers.local.syncDir.outputFile('src/file', 'whatever file content')
      await helpers.local.scan()
    })

    it('local', async () => {
      should(await helpers.local.tree()).deepEqual([
        'dst/',
        'src/',
        'src/file'
      ])
      await helpers.local.syncDir.move('src/file', 'dst/file')
      // Sync will fail since file was already moved.
      await helpers.syncAll()
      // This will prepend made up unlink event to scan add one, ending up as
      // the expected move.
      await helpers.local.scan()
      await helpers.syncAll()

      should(await helpers.trees('metadata', 'remote')).deepEqual({
        remote: [
          'dst/',
          'dst/file',
          'src/'
        ],
        metadata: [
          'dst/',
          'dst/file',
          'src/'
        ]
      })
    })
  })

  describe('directory', () => {
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

    it('local', async () => {
      const oldFolder = await pouch.byRemoteIdMaybeAsync(dir._id)
      // FIXME: Why is this a file? And why does it break with a directory?
      const doc = builders.metadata.file().path('parent/dst/dir').build()

      await prep.moveFolderAsync('local', doc, oldFolder)

      should(helpers.putDocs('path', '_deleted', 'trashed', 'childMove')).deepEqual([
        {path: path.normalize('parent/src/dir'), _deleted: true},
        {path: path.normalize('parent/dst/dir')},
        {path: path.normalize('parent/src/dir/empty-subdir'), _deleted: true, childMove: true},
        {path: path.normalize('parent/dst/dir/empty-subdir')},
        {path: path.normalize('parent/src/dir/subdir'), _deleted: true, childMove: true},
        {path: path.normalize('parent/dst/dir/subdir')},
        {path: path.normalize('parent/src/dir/subdir/file'), _deleted: true, childMove: true},
        {path: path.normalize('parent/dst/dir/subdir/file')}
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

      const subdir = await cozy.files.statByPath('/parent/dst/dir/subdir')
      should(await helpers._pouch.byRemoteIdAsync(subdir._id))
        .have.propertyByPath('remote', '_rev').eql(subdir._rev)
    })

    it('from remote client', async () => {
      // FIXME: Ensure events occur in the same order as resulting from the
      // local dir test
      await helpers._remote.addFolderAsync(_.defaults(
        {
          path: path.normalize('parent/dst/dir'),
          updated_at: '2017-06-20T12:58:49.681Z'
        },
        await pouch.byRemoteIdAsync(dir._id)
      ))
      await helpers._remote.addFolderAsync(_.defaults(
        {
          path: path.normalize('parent/dst/dir/empty-subdir'),
          updated_at: '2017-06-20T12:58:49.817Z'
        },
        await pouch.byRemoteIdAsync(emptySubdir._id)
      ))
      await helpers._remote.addFolderAsync(_.defaults(
        {
          path: path.normalize('parent/dst/dir/subdir'),
          updated_at: '2017-06-20T12:58:49.873Z'
        },
        await pouch.byRemoteIdAsync(subdir._id)
      ))
      const oldFileMetadata = await pouch.byRemoteIdAsync(file._id)
      await helpers._remote.moveFileAsync(_.defaults(
        {
          path: path.normalize('parent/dst/dir/subdir/file')
          // FIXME: Why does moveFileAsync({updated_at: ...}) fail?
          // updated_at: '2017-06-20T12:58:49.921Z'
        },
        oldFileMetadata
      ), oldFileMetadata)
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

    describe('unsynced file', () => {
      beforeEach(async () => {
        await helpers.local.syncDir.ensureDir('parent/src/dir')
        await helpers.local.scan()
        await helpers.syncAll()
        await helpers.local.syncDir.outputFile('parent/src/dir/file', 'whatever file content')
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
    })
  })
})
