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

  beforeEach(async function() {
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
    })

    describe('remote', () => {
      it('downloads the new file', async () => {
        await cozy.files.create('foo', { name: 'file', dirID: parent._id })
        await helpers.remote.pullChanges()

        should(
          helpers.putDocs('path', '_deleted', 'trashed', 'sides')
        ).deepEqual([
          {
            path: path.normalize('parent/file'),
            sides: { target: 1, remote: 1 }
          }
        ])

        // $FlowFixMe
        should(await helpers.remote.treeWithoutTrash()).deepEqual([
          'parent/',
          'parent/file'
        ])
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

        should(await helpers.local.tree()).deepEqual(['parent/', 'parent/file'])
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
        log.debug('TEST START')
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
          // Adding children modifies the parent folder's metadata on the
          // filesystem triggering a call to Pouch.put with the local changes.
          { path: 'parent', sides: { target: 2, local: 2, remote: 2 } },
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

      context('if directory already exists on the remote Cozy', () => {
        it('links the two directories', async () => {
          log.debug('TEST START')
          const remoteDir = await createDoc('remote', 'dir', parent)
          await createDoc('local', 'dir', parent)

          await syncSideAddition('local')

          const updatedDir = metadata.fromRemoteDoc(
            await helpers.remote.byId(remoteDir._id)
          )
          const savedParent = metadata.fromRemoteDoc(
            await helpers.remote.byId(parent._id)
          )

          should(await helpers.trees()).deepEqual({
            local: ['parent/', 'parent/dir/'],
            remote: ['parent/', 'parent/dir/']
          })
          should(helpers.putDocs('path', 'remote', 'sides')).deepEqual([
            // Adding children modifies the parent folder's metadata on the
            // filesystem triggering a call to Pouch.put with the local changes.
            {
              path: 'parent',
              remote: savedParent.remote,
              sides: { target: 2, local: 2, remote: 2 }
            },
            {
              path: path.normalize('parent/dir'),
              sides: { target: 1, local: 1 }
            },
            {
              path: path.normalize('parent/dir'),
              remote: updatedDir.remote,
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
