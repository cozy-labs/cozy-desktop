/* @flow */
/* eslint-env mocha */

const path = require('path')
const should = require('should')
const fse = require('fs-extra')
const sinon = require('sinon')

const metadata = require('../../core/metadata')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const TestHelpers = require('../support/helpers')

const cozy = cozyHelpers.cozy

const logger = require('../../core/utils/logger')
const log = new logger({
  component: 'TEST'
})

describe('Add', () => {
  let helpers, parent

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  beforeEach(async function () {
    helpers = TestHelpers.init(this)
    helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()

    parent = await cozy.files.createDirectory({ name: 'parent' })
    await helpers.pullAndSyncAll()
    await helpers.local.scan()

    helpers.spyPouch()
  })

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  describe('file', () => {
    const createDoc = async (side, filename, content = 'foo') => {
      if (side === 'remote') {
        return await cozy.files.create(content, {
          name: filename,
          dirID: parent._id
        })
      } else {
        return await helpers.local.syncDir.outputFile(
          path.join(parent.attributes.path.slice(1), filename),
          'foo'
        )
      }
    }
    const syncSideAddition = async side => {
      if (side === 'remote') {
        await helpers.pullAndSyncAll()
      } else {
        await helpers.flushLocalAndSyncAll()
      }
    }

    describe('local', () => {
      const filename = 'Texte.txt'
      context('when file is completely empty', () => {
        it('creates an empty file on the remote Cozy', async () => {
          await helpers.local.syncDir.touchFile(filename)

          await helpers.flushLocalAndSyncAll()
          await helpers.pullAndSyncAll()

          should(await helpers.trees()).deepEqual({
            local: [filename, 'parent/'],
            remote: [filename, 'parent/']
          })
          should(await helpers.local.readFile(filename)).eql('')
          should(await helpers.remote.readFile(filename)).eql('')
        })
      })

      context('when file has content', () => {
        it('uploads the file with its local content', async () => {
          const filecontent = 'My local content'
          await helpers.local.syncDir.outputFile(filename, filecontent)

          await helpers.flushLocalAndSyncAll()
          await helpers.pullAndSyncAll()

          should(await helpers.trees()).deepEqual({
            local: [filename, 'parent/'],
            remote: [filename, 'parent/']
          })
          should(await helpers.local.readFile(filename)).eql(filecontent)
          should(await helpers.remote.readFile(filename)).eql(filecontent)
        })
      })

      context('when file path is already taken on the remote Cozy', () => {
        it('renames the remote document as conflict', async () => {
          const remoteFile = await createDoc(
            'remote',
            'file.txt',
            'remote content'
          )
          await createDoc('local', 'file.txt', 'local content')

          await syncSideAddition('local')
          await helpers.pullAndSyncAll()

          should(await helpers.trees()).deepEqual({
            local: ['parent/', 'parent/file-conflict-...', 'parent/file.txt'],
            remote: ['parent/', 'parent/file-conflict-...', 'parent/file.txt']
          })
          should(await helpers.remote.byIdMaybe(remoteFile._id))
            .have.property('name')
            .startWith('file-conflict-')
        })
      })

      it('does not merge a parent folder modification date change', async () => {
        await createDoc('local', 'file')

        await helpers.local.scan()

        should(
          helpers.putDocs('path', '_deleted', 'trashed', 'sides')
        ).deepEqual([
          // XXX: No `parent` change merged since only its modification changed
          {
            path: path.normalize('parent/file'),
            sides: { target: 1, local: 1 }
          }
        ])
      })
    })

    describe('remote', () => {
      it('creates the file on the local file system', async () => {
        await createDoc('remote', 'file')
        await helpers.remote.pullChanges()

        should(
          helpers.putDocs('path', '_deleted', 'trashed', 'sides')
        ).deepEqual([
          {
            path: path.normalize('parent/file'),
            sides: { target: 1, remote: 1 }
          }
        ])

        await helpers.syncAll()

        should(await helpers.local.tree()).deepEqual(['parent/', 'parent/file'])
      })

      context('when the file is deleted before being downloaded', () => {
        before('prevent Sync retries', () => {
          // Otherwise we won't see the document erasing
          process.env.SYNC_SHOULD_NOT_RETRY = 'true'
        })
        after('re-enable Sync retries', () => {
          // Otherwise we won't see the document erasing
          delete process.env.SYNC_SHOULD_NOT_RETRY
        })

        it('erases the local Pouch record', async () => {
          const remoteFile = await createDoc('remote', 'file')
          await helpers.remote.pullChanges()

          should(
            helpers.putDocs('path', '_deleted', 'trashed', 'sides')
          ).deepEqual([
            {
              path: path.normalize('parent/file'),
              sides: { target: 1, remote: 1 }
            }
          ])

          // Destroy file before it is downloaded
          await cozy.files.destroyById(remoteFile._id)

          await helpers.syncAll()

          helpers.resetPouchSpy()
          should(
            helpers.putDocs('path', '_deleted', 'trashed', 'sides')
          ).deepEqual([
            {
              path: path.normalize('parent/file'),
              sides: { target: 1, remote: 1 },
              _deleted: true
            }
          ])
          should(await helpers.local.tree()).deepEqual(['parent/'])
        })
      })
    })
  })

  describe('folder', () => {
    const createDoc = async (side, name, parent) => {
      if (side === 'remote') {
        return await cozy.files.createDirectory({ name, dirID: parent._id })
      } else {
        const dirPath = path.join(parent.attributes.path.slice(1), name)
        await helpers.local.syncDir.ensureDir(dirPath)
        return {
          _id: metadata.id(dirPath),
          attributes: { path: `/${dirPath}` },
          _rev: '1'
        }
      }
    }
    const syncSideAddition = async side => {
      if (side === 'remote') {
        await helpers.pullAndSyncAll()
      } else {
        await helpers.flushLocalAndSyncAll()
      }
    }

    describe('on local file system', () => {
      it('creates the directory and its content on the remote Cozy', async () => {
        const dir = await createDoc('local', 'dir', parent)
        const subdir = await createDoc('local', 'subdir', dir)
        await createDoc('local', 'empty-subdir', dir)

        await helpers.local.syncDir.outputFile(
          path.join(subdir.attributes.path, 'file'),
          'foo'
        )
        await helpers.local.scan()

        should(
          helpers.putDocs('path', '_deleted', 'trashed', 'sides')
        ).deepEqual([
          {
            path: path.normalize('parent/dir'),
            sides: { target: 1, local: 1 }
          },
          {
            path: path.normalize('parent/dir/empty-subdir'),
            sides: { target: 1, local: 1 }
          },
          {
            path: path.normalize('parent/dir/subdir'),
            sides: { target: 1, local: 1 }
          },
          {
            path: path.normalize('parent/dir/subdir/file'),
            sides: { target: 1, local: 1 }
          }
        ])

        await helpers.syncAll()

        should(await helpers.remote.treeWithoutTrash()).deepEqual([
          'parent/',
          'parent/dir/',
          'parent/dir/empty-subdir/',
          'parent/dir/subdir/',
          'parent/dir/subdir/file'
        ])
      })

      it('does not merge a parent folder modification date change', async () => {
        await createDoc('local', 'dir', parent)

        await helpers.local.scan()

        should(
          helpers.putDocs('path', '_deleted', 'trashed', 'sides')
        ).deepEqual([
          // XXX: No `parent` change merged since only its modification changed
          {
            path: path.normalize('parent/dir'),
            sides: { target: 1, local: 1 }
          }
        ])
      })

      context('and the directory is updated after its content is added', () => {
        it('creates the directory and its content on the remote Cozy without errors', async () => {
          // Create directory and its content
          const dir = await createDoc('local', 'dir', parent)
          const subdir = await createDoc('local', 'subdir', dir)
          await createDoc('local', 'empty-subdir', dir)

          await helpers.local.syncDir.outputFile(
            path.join(subdir.attributes.path, 'file'),
            'foo'
          )
          await helpers.local.scan()

          // Update the directory's metadata
          await fse.utimes(
            helpers.local.syncDir.abspath(dir.attributes.path.slice(1)),
            new Date(),
            new Date()
          )
          await helpers.local.scan()

          should(
            helpers.putDocs('path', '_deleted', 'trashed', 'sides')
          ).deepEqual([
            {
              path: path.normalize('parent/dir'),
              sides: { target: 1, local: 1 }
            },
            {
              path: path.normalize('parent/dir/empty-subdir'),
              sides: { target: 1, local: 1 }
            },
            {
              path: path.normalize('parent/dir/subdir'),
              sides: { target: 1, local: 1 }
            },
            {
              path: path.normalize('parent/dir/subdir/file'),
              sides: { target: 1, local: 1 }
            }
          ])

          sinon.spy(helpers._sync, 'blockSyncFor')

          try {
            await helpers.syncAll()

            should(await helpers.remote.treeWithoutTrash()).deepEqual([
              'parent/',
              'parent/dir/',
              'parent/dir/empty-subdir/',
              'parent/dir/subdir/',
              'parent/dir/subdir/file'
            ])

            should(helpers._sync.blockSyncFor).not.have.been.called()
          } finally {
            helpers._sync.blockSyncFor.restore()
          }
        })
      })

      context('if directory already exists on the remote Cozy', () => {
        it('links the two directories', async () => {
          log.debug('TEST START')
          const remoteDir = await createDoc('remote', 'dir', parent)
          await createDoc('local', 'dir', parent)

          await syncSideAddition('local')

          const updatedDir = metadata.fromRemoteDoc(
            await helpers.remote.byId(remoteDir._id)
          )

          should(await helpers.trees()).deepEqual({
            local: ['parent/', 'parent/dir/'],
            remote: ['parent/', 'parent/dir/']
          })
          should(
            helpers.putDocs('path', 'local.path', 'remote', 'sides', 'errors')
          ).deepEqual([
            {
              path: path.normalize('parent/dir'),
              local: { path: path.normalize('parent/dir') },
              sides: { target: 1, local: 1 }
            },
            // We encounter a conflict error since a remote doc with the same
            // path already exists.
            {
              path: path.normalize('parent/dir'),
              local: { path: path.normalize('parent/dir') },
              sides: { target: 2, local: 2 },
              errors: 1
            },
            // The conflict is solved when the remote watcher fetches the remote
            // doc and links it to the local one during Merge.
            {
              path: path.normalize('parent/dir'),
              local: { path: path.normalize('parent/dir') },
              remote: updatedDir.remote,
              sides: { target: 3, local: 3, remote: 3 }
            }
          ])
        })
      })
    })

    describe('on remote Cozy', () => {
      it('creates the directory and its content on the local file system', async () => {
        const dir = await createDoc('remote', 'dir', parent)
        const subdir = await createDoc('remote', 'subdir', dir)
        await createDoc('remote', 'empty-subdir', dir)
        await cozy.files.create('foo', { name: 'file', dirID: subdir._id })
        await helpers.remote.pullChanges()

        should(
          helpers.putDocs('path', '_deleted', 'trashed', 'sides')
        ).deepEqual([
          {
            path: path.normalize('parent/dir'),
            sides: { target: 1, remote: 1 }
          },
          {
            path: path.normalize('parent/dir/empty-subdir'),
            sides: { target: 1, remote: 1 }
          },
          {
            path: path.normalize('parent/dir/subdir'),
            sides: { target: 1, remote: 1 }
          },
          {
            path: path.normalize('parent/dir/subdir/file'),
            sides: { target: 1, remote: 1 }
          }
        ])

        await helpers.syncAll()

        should(await helpers.local.treeWithoutTrash()).deepEqual([
          'parent/',
          'parent/dir/',
          'parent/dir/empty-subdir/',
          'parent/dir/subdir/',
          'parent/dir/subdir/file'
        ])
      })
    })
  })
})
