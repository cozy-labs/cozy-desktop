/* @flow */
/* eslint-env mocha */

const path = require('path')
const should = require('should')

const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const TestHelpers = require('../support/helpers')

const skipRemoteChange = async ({ helpers, cozy }) => {
  const since = await helpers.pouch.getRemoteSeq()
  const { last_seq } = await cozy.data.changesFeed('io.cozy.files', {
    since,
    limit: 10000
  })
  await helpers.pouch.setRemoteSeq(last_seq)
}

describe('Trash', () => {
  let cozy, helpers, pouch, prep

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function() {
    cozy = cozyHelpers.cozy
    helpers = TestHelpers.init(this)
    pouch = helpers.pouch
    prep = helpers.prep

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  describe('file', () => {
    let parent, file

    beforeEach(async () => {
      parent = await cozy.files.createDirectory({ name: 'parent' })
      file = await cozy.files.create('File content...', {
        name: 'file',
        dirID: parent._id
      })
      await helpers.remote.pullChanges()
      await helpers.syncAll()
      helpers.spyPouch()
    })

    context('on the local filesystem', () => {
      it('trashes the file on the remote Cozy', async () => {
        await prep.trashFileAsync('local', { path: 'parent/file' })

        should(helpers.putDocs('path', 'deleted', 'trashed')).deepEqual([
          { path: path.normalize('parent/file'), deleted: true }
        ])
        await should(pouch.db.get(file._id)).be.rejectedWith({ status: 404 })

        await helpers.syncAll()

        should(await helpers.remote.tree()).deepEqual([
          '.cozy_trash/',
          '.cozy_trash/file',
          'parent/'
        ])
      })

      context('before the file was moved on the remote Cozy', () => {
        it('does not trash the file on the remote Cozy and re-downloads it', async () => {
          await helpers.local.syncDir.remove('parent/file')
          await helpers.local.scan()
          await cozy.files.updateAttributesById(file._id, {
            name: 'file',
            dir_id: parent.attributes.dir_id
          })
          await helpers.remote.pullChanges()
          await helpers.syncAll()

          should(await helpers.trees()).deepEqual({
            local: ['file', 'parent/'],
            remote: ['file', 'parent/']
          })
        })
      })

      // This situation can happen if the synchronization is stopped after
      // we've merged the remote file movement but before it's been applied
      // and the local deletion is done afterwards, while the client is
      // stopped.
      context('after the file was moved on the remote Cozy', () => {
        it('does not trash the file on the remote Cozy and re-downloads it', async () => {
          await cozy.files.updateAttributesById(file._id, {
            name: 'file',
            dir_id: parent.attributes.dir_id
          })
          await helpers.remote.pullChanges()
          await helpers.local.syncDir.remove('parent/file')
          await helpers.local.scan()
          await helpers.syncAll()

          should(await helpers.trees()).deepEqual({
            local: ['file', 'parent/'],
            remote: ['file', 'parent/']
          })
        })
      })

      // This situation is an anomaly. We should not miss any remote
      // changes as this would mean we're desynchronized.
      // However, this does happen sometimes at the moment and we'll try to get
      // back on our feets.
      context('while we missed the remote file deletion', () => {
        // We should be retrying a few times and then finally skip the change to
        // avoid looping over it.
        it('ends up skipping the change', async () => {
          // Destroy file on Cozy
          await cozy.files.destroyById(file._id)
          // Fake missing the remote change by skipping its sequence
          skipRemoteChange({ helpers, cozy })

          await helpers.local.syncDir.remove('parent/file')
          await helpers.local.scan()
          await helpers.syncAll()

          should(await helpers.trees()).deepEqual({
            local: ['parent/'],
            remote: ['parent/']
          })
        })
      })

      // This situation is an anomaly. We should not miss any remote
      // changes as this would mean we're desynchronized.
      // However, this does happen sometimes at the moment and we'll try to get
      // back on our feets.
      context('while we missed a remote file update', () => {
        // The user should be able to skip it manually as we will otherwise keep
        // trying forever.
        it('can be skipped manually', async () => {
          // Destroy file on Cozy
          await cozy.files.updateById(file._id, 'remote update')
          // Fake missing the remote change by skipping its sequence
          skipRemoteChange({ helpers, cozy })

          await helpers.local.syncDir.remove('parent/file')
          await helpers.local.scan()

          // We skip any required user action as a user would do
          helpers.events.on('sync-state', ({ userActions }) => {
            if (userActions.length) {
              helpers.events.emit('user-action-command', { cmd: 'skip' })
            }
          })
          await helpers.syncAll()

          should(await helpers.trees()).deepEqual({
            local: ['parent/'],
            remote: ['parent/', 'parent/file']
          })
        })
      })
    })

    context('on the remote Cozy', () => {
      it('trashes the file on the local filesystem', async () => {
        await cozy.files.trashById(file._id)

        await helpers.remote.pullChanges()

        should(helpers.putDocs('path', 'deleted', 'trashed')).deepEqual([
          { path: path.normalize('parent/file'), deleted: true }
        ])
        await should(pouch.db.get(file._id)).be.rejectedWith({ status: 404 })

        await helpers.syncAll()

        should(await helpers.local.tree()).deepEqual(['/Trash/file', 'parent/'])
      })

      context('before the file was moved on the local filesystem', () => {
        it('does not trash the file on the local filesystem and restores it', async () => {
          await cozy.files.trashById(file._id)
          await helpers.remote.pullChanges()
          await helpers.local.syncDir.move(
            path.normalize('parent/file'),
            'file'
          )
          await helpers.local.scan()
          await helpers.syncAll()

          should(await helpers.trees()).deepEqual({
            local: ['file', 'parent/'],
            remote: ['file', 'parent/']
          })
        })
      })

      // XXX: This behavior does not work anymore since the stack is now denying
      // requests to move files that are in the Cozy trash.
      // We'll need to go the extra mile and restore the file before moving it.
      // See https://github.com/cozy/cozy-stack/commit/afa80ba65de265d5133974562014b89aae7b2836
      context.skip('after the file was moved on the local filesystem', () => {
        it('does not trash the file on the local filesystem and restores it', async () => {
          await helpers.local.syncDir.move(
            path.normalize('parent/file'),
            'file'
          )
          await helpers.local.scan()
          await cozy.files.trashById(file._id)
          await helpers.remote.pullChanges()
          await helpers.syncAll()

          should(await helpers.trees()).deepEqual({
            local: ['file', 'parent/'],
            remote: ['file', 'parent/']
          })
        })
      })
    })

    context('destroyed on the remote Cozy', () => {
      context('before the file was moved on the local filesystem', () => {
        it('does not trash the file on the local filesystem and re-uploads it', async () => {
          await cozy.files.destroyById(file._id)
          await helpers.remote.pullChanges()
          await helpers.local.syncDir.move(
            path.normalize('parent/file'),
            'file'
          )
          await helpers.local.scan()
          await helpers.syncAll()

          should(await helpers.trees()).deepEqual({
            local: ['file', 'parent/'],
            remote: ['file', 'parent/']
          })
        })
      })

      context('after the file was moved on the local filesystem', () => {
        it('does not trash the file on the local filesystem and re-uploads it', async () => {
          await helpers.local.syncDir.move(
            path.normalize('parent/file'),
            'file'
          )
          await helpers.local.scan()
          await cozy.files.destroyById(file._id)
          await helpers.remote.pullChanges()
          await helpers.syncAll()

          should(await helpers.trees()).deepEqual({
            local: ['file', 'parent/'],
            remote: ['file', 'parent/']
          })
        })
      })
    })
  })

  describe('directory', () => {
    let parent, dir, subdir

    beforeEach(async () => {
      parent = await cozy.files.createDirectory({ name: 'parent' })
      dir = await cozy.files.createDirectory({ name: 'dir', dirID: parent._id })
      await cozy.files.createDirectory({ name: 'empty-subdir', dirID: dir._id })
      subdir = await cozy.files.createDirectory({
        name: 'subdir',
        dirID: dir._id
      })
      await cozy.files.create('foo', { name: 'file', dirID: subdir._id })

      await helpers.remote.pullChanges()
      await helpers.syncAll()

      helpers.spyPouch()
    })

    context('on the local filesystem', () => {
      it('trashes the directory on the remote Cozy', async () => {
        await prep.trashFolderAsync('local', {
          path: path.normalize('parent/dir')
        })

        should(helpers.putDocs('path', 'deleted', 'trashed')).deepEqual([
          { path: path.normalize('parent/dir'), deleted: true }
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
    })

    context('on the remote Cozy', () => {
      it('trashes the directory on the local filesystem', async () => {
        await cozy.files.trashById(dir._id)

        await helpers.remote.pullChanges()
        should(helpers.putDocs('path', 'deleted', 'trashed')).deepEqual([
          { path: path.normalize('parent/dir'), deleted: true },
          { path: path.normalize('parent/dir/empty-subdir'), deleted: true },
          { path: path.normalize('parent/dir/subdir'), deleted: true },
          { path: path.normalize('parent/dir/subdir/file'), deleted: true }
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
})

describe('Restore', () => {
  let cozy, helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function() {
    cozy = cozyHelpers.cozy
    helpers = TestHelpers.init(this)

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  describe('file', () => {
    let parent, file

    beforeEach(async () => {
      parent = await cozy.files.createDirectory({ name: 'parent' })
      file = await cozy.files.create('File content...', {
        name: 'file',
        dirID: parent._id
      })
      await helpers.remote.pullChanges()
      await helpers.syncAll()
      helpers.spyPouch()
    })

    context('before trash is applied on local file system', () => {
      it('does not create a conflict', async () => {
        // Fetch and merge trashing
        await cozy.files.trashById(file._id)
        await helpers.remote.pullChanges()

        await cozy.files.restoreById(file._id)
        await helpers.remote.pullChanges()
        await helpers.syncAll()

        should(await helpers.trees()).deepEqual({
          local: ['parent/', 'parent/file'],
          remote: ['parent/', 'parent/file']
        })
      })
    })
  })

  describe('folder', () => {
    let remoteDocs

    beforeEach(async () => {
      remoteDocs = await helpers.remote.createTree([
        'parent/',
        'parent/dir/',
        'parent/dir/empty-subdir/',
        'parent/dir/subdir/',
        'parent/dir/subdir/file'
      ])

      await helpers.remote.pullChanges()
      await helpers.syncAll()
    })

    context('before trash is applied on local file system', () => {
      it('does not create conflicts', async () => {
        await cozy.files.trashById(remoteDocs['parent/dir/']._id)
        await helpers.remote.pullChanges()

        await cozy.files.restoreById(remoteDocs['parent/dir/']._id)
        await helpers.remote.pullChanges()
        await helpers.syncAll()

        should(await helpers.trees()).deepEqual({
          local: [
            'parent/',
            'parent/dir/',
            'parent/dir/empty-subdir/',
            'parent/dir/subdir/',
            'parent/dir/subdir/file'
          ],
          remote: [
            'parent/',
            'parent/dir/',
            'parent/dir/empty-subdir/',
            'parent/dir/subdir/',
            'parent/dir/subdir/file'
          ]
        })
      })
    })
  })
})
