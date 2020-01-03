/* @flow */
/* eslint-env mocha */

const path = require('path')
const should = require('should')

const metadata = require('../../core/metadata')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const TestHelpers = require('../support/helpers')

const cozy = cozyHelpers.cozy

describe('Add', () => {
  let helpers, parent

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function() {
    helpers = TestHelpers.init(this)
    helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()

    parent = await cozy.files.createDirectory({ name: 'parent' })
    await helpers.remote.pullChanges()
    await helpers.syncAll()

    helpers.spyPouch()
  })

  describe('file', () => {
    const createDoc = async (side, filename) => {
      if (side === 'remote') {
        await cozy.files.create('foo', {
          name: filename,
          dirID: parent._id
        })
      } else {
        await helpers.local.syncDir.outputFile(
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

    describe('on local file system', () => {
      it('creates the file on the remote Cozy', async () => {
        await createDoc('local', 'file')
        await helpers.local.scan()

        should(
          helpers.putDocs('path', '_deleted', 'trashed', 'sides')
        ).deepEqual([
          {
            path: path.normalize('parent/file'),
            sides: { target: 1, local: 1 }
          }
        ])

        await helpers.syncAll()

        // $FlowFixMe
        should(await helpers.remote.treeWithoutTrash()).deepEqual([
          'parent/',
          'parent/file'
        ])
      })

      context('if file already exists on the remote Cozy', () => {
        it('renames the remote file as conflict', async () => {
          await createDoc('remote', 'file.txt')
          await createDoc('local', 'file.txt')

          await syncSideAddition('local')
          should(await helpers.trees()).deepEqual({
            local: ['parent/', 'parent/file.txt'],
            remote: ['parent/', 'parent/file-conflict-...', 'parent/file.txt']
          })

          await helpers.pullAndSyncAll()
          should(await helpers.trees()).deepEqual({
            local: ['parent/', 'parent/file-conflict-...', 'parent/file.txt'],
            remote: ['parent/', 'parent/file-conflict-...', 'parent/file.txt']
          })
        })
      })
    })

    describe('on remote Cozy', () => {
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

        should(await helpers.local.treeWithoutTrash()).deepEqual([
          'parent/',
          'parent/file'
        ])
      })
    })
  })

  describe('dir', () => {
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
          { path: 'parent/dir', sides: { target: 1, local: 1 } },
          { path: 'parent/dir/empty-subdir', sides: { target: 1, local: 1 } },
          { path: 'parent/dir/subdir', sides: { target: 1, local: 1 } },
          { path: 'parent/dir/subdir/file', sides: { target: 1, local: 1 } }
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

      context('if directory already exists on the remote Cozy', () => {
        it('links the two directories', async () => {
          const remoteDir = await createDoc('remote', 'dir', parent)
          await createDoc('local', 'dir', parent)

          await syncSideAddition('local')
          should(await helpers.trees()).deepEqual({
            local: ['parent/', 'parent/dir/'],
            remote: ['parent/', 'parent/dir/']
          })
          should(helpers.putDocs('path', 'remote', 'sides')).deepEqual([
            {
              path: 'parent/dir',
              remote: undefined,
              sides: { target: 1, local: 1 }
            },
            {
              path: 'parent/dir',
              remote: { _id: remoteDir._id, _rev: remoteDir._rev },
              sides: { target: 2, local: 2, remote: 2 }
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
          { path: 'parent/dir', sides: { target: 1, remote: 1 } },
          { path: 'parent/dir/empty-subdir', sides: { target: 1, remote: 1 } },
          { path: 'parent/dir/subdir', sides: { target: 1, remote: 1 } },
          { path: 'parent/dir/subdir/file', sides: { target: 1, remote: 1 } }
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
