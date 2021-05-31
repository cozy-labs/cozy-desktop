/* @flow */
/* eslint-env mocha */

const Promise = require('bluebird')
const _ = require('lodash')
const should = require('should')
const path = require('path')

const logger = require('../../core/utils/logger')
const metadata = require('../../core/metadata')
const { byPathKey } = require('../../core/pouch')

const Builders = require('../support/builders')
const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const { onPlatform } = require('../support/helpers/platform')

const log = logger({ component: 'mocha' })

describe('Update file', () => {
  let builders, cozy, helpers, pouch, prep

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function() {
    builders = new Builders({ cozy: cozyHelpers.cozy })
    cozy = cozyHelpers.cozy
    helpers = TestHelpers.init(this)
    pouch = helpers.pouch
    prep = helpers.prep

    await helpers.local.clean()
    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  describe('local offline change with unsynced previous local change', () => {
    beforeEach(async () => {
      await helpers.local.syncDir.outputFile('file', 'initial content')
      await helpers.flushLocalAndSyncAll()

      await helpers.local.syncDir.outputFile('file', 'first update')
      await helpers.local.scan()
    })

    it('synchronizes the latest change everywhere without conflicts', async () => {
      const secondUpdate = 'second update'
      await helpers.local.syncDir.outputFile('file', secondUpdate)
      await helpers.flushLocalAndSyncAll()
      await helpers.pullAndSyncAll()

      const trees = await helpers.treesNonEllipsized()
      const contents = {
        local: await Promise.reduce(
          trees.local,
          async (localContents, path) => {
            localContents[path] = await helpers.local.syncDir.readFile(path)
            return localContents
          },
          {}
        ),
        remote: await Promise.reduce(
          trees.remote,
          async (remoteContents, path) => {
            remoteContents[path] = await helpers.remote.readFile(path)
            return remoteContents
          },
          {}
        )
      }
      should({ trees, contents }).deepEqual({
        trees: {
          local: ['file'],
          remote: ['file']
        },
        contents: {
          local: { file: secondUpdate },
          remote: { file: secondUpdate }
        }
      })
    })
  })

  describe('local change on unsynced child move', () => {
    beforeEach(async () => {
      await helpers.local.syncDir.outputFile(
        path.normalize('src/file'),
        'initial content'
      )
      await helpers.flushLocalAndSyncAll()

      await helpers.local.syncDir.move('src', 'dst')
      await helpers.local.scan()
      await helpers.remote.ignorePreviousChanges()
    })

    it('synchronizes the latest change everywhere without conflicts', async () => {
      const contentUpdate = 'content update'
      await helpers.local.syncDir.outputFile(
        path.normalize('dst/file'),
        contentUpdate
      )
      await helpers.flushLocalAndSyncAll()
      await helpers.pullAndSyncAll()

      const trees = await helpers.treesNonEllipsized()
      const contents = {
        local: await Promise.reduce(
          trees.local,
          async (localContents, path) => {
            if (path.endsWith('/')) return localContents
            localContents[path] = await helpers.local.syncDir.readFile(path)
            return localContents
          },
          {}
        ),
        remote: await Promise.reduce(
          trees.remote,
          async (remoteContents, path) => {
            if (path.endsWith('/')) return remoteContents
            remoteContents[path] = await helpers.remote.readFile(path)
            return remoteContents
          },
          {}
        )
      }
      should({ trees, contents }).deepEqual({
        trees: {
          local: ['dst/', 'dst/file'],
          remote: ['dst/', 'dst/file']
        },
        contents: {
          local: {
            'dst/file': contentUpdate
          },
          remote: {
            'dst/file': contentUpdate
          }
        }
      })
    })
  })

  describe('local change on unsynced child move to previously existing path', () => {
    let existingPath = path.normalize('dst/file')

    beforeEach(async () => {
      await helpers.remote.ignorePreviousChanges()
      await helpers.local.syncDir.outputFile(existingPath, 'existing content')
      await helpers.flushLocalAndSyncAll()
      await helpers.local.syncDir.remove(existingPath)
      await helpers.local.syncDir.removeParentDir(existingPath)
      await helpers.flushLocalAndSyncAll()

      await helpers.local.syncDir.outputFile(
        path.normalize('src/file'),
        'initial content'
      )
      await helpers.flushLocalAndSyncAll()
      await helpers.local.syncDir.move('src', 'dst')
      await helpers.local.scan()
    })

    // FIXME: fails sometimes with wrong dst/file content because:
    // - dst/file is updated more than once somehow
    // - we don't handle well overwrites of overwrites (i.e. the overwrite
    //   attribute is replaced)
    // - we don't handle well 409 errors yet
    it('synchronizes the latest change everywhere without conflicts', async () => {
      const contentUpdate = 'content update'
      await helpers.local.syncDir.outputFile(existingPath, contentUpdate)
      await helpers.flushLocalAndSyncAll()
      await helpers.pullAndSyncAll()

      const trees = await helpers.treesNonEllipsized()
      const contents = {
        local: await Promise.reduce(
          trees.local,
          async (localContents, path) => {
            if (path.endsWith('/')) return localContents
            if (path.includes('/Trash/')) return localContents
            localContents[path] = await helpers.local.syncDir.readFile(path)
            return localContents
          },
          {}
        ),
        remote: await Promise.reduce(
          trees.remote,
          async (remoteContents, path) => {
            if (path.endsWith('/')) return remoteContents
            remoteContents[path] = await helpers.remote.readFile(path)
            return remoteContents
          },
          {}
        )
      }
      should({ trees, contents }).deepEqual({
        trees: {
          local: ['dst/', 'dst/file'],
          remote: ['dst/', 'dst/file']
        },
        contents: {
          local: {
            'dst/file': contentUpdate
          },
          remote: {
            'dst/file': contentUpdate
          }
        }
      })

      // Make sure we can still update the file
      const params = {
        key: byPathKey(existingPath),
        include_docs: true
      }
      const docs = await pouch.getAll('byPath', params)
      should(docs).have.size(1)
    })
  })

  describe('local inode-only change', () => {
    // OPTIMIZE: Don't trigger useless remote sync for local inode-only change
    it('works but triggers useless remote sync', async () => {
      const file = await builders
        .remoteFile()
        .name('file')
        .data('Initial content')
        .create()
      await helpers.pullAndSyncAll()
      await helpers.flushLocalAndSyncAll()
      const was = await pouch.byRemoteIdMaybe(file._id)

      const doc = _.defaults({ ino: was.ino + 1 }, was)
      metadata.updateLocal(doc)
      await prep.updateFileAsync('local', doc)

      await helpers.syncAll()
      should(await pouch.byRemoteIdMaybe(file._id))
        .have.propertyByPath('remote', '_rev')
        .not.eql(was.remote._rev)

      // Make sure there is no infinite loop
      await helpers.remote.pullChanges()
      await helpers.syncAll()
    })
  })

  describe('older timestamp change', () => {
    it('should keep the most recent timestamp to prevent 422 errors', async () => {
      const file = await builders
        .remoteFile()
        .name('file')
        .data('Initial content')
        .createdAt(2018, 5, 15, 21, 1, 53)
        .create()
      await helpers.pullAndSyncAll()
      await helpers.flushLocalAndSyncAll()
      const was = await pouch.byRemoteIdMaybe(file._id)
      should(was).have.property('updated_at', '2018-05-15T21:01:53.000Z')

      await prep.updateFileAsync(
        'local',
        _.defaults(
          {
            updated_at: '2017-05-15T21:01:53.000Z',
            tags: ['some new tag']
          },
          was
        )
      )
      await helpers.syncAll()
      const doc = await pouch.byRemoteIdMaybe(file._id)
      should(doc.errors).be.undefined()
    })
  })

  describe('M1, local merge M1, M2, remote sync M1, local merge M2', () => {
    it('fails remote sync M1 & local merge M2', async () => {
      await cozy.files.create('Initial content', { name: 'file' })
      await helpers.pullAndSyncAll()
      await helpers.flushLocalAndSyncAll()

      log.info('-------- M1 --------')
      const m1 = 'M1'
      await helpers.local.syncDir.outputFile('file', m1)

      log.info('-------- local merge M1 --------')
      should(await helpers.local.syncDir.checksum('file')).equal(
        '8x4e7yD2RzOhjFOAc+eDlg=='
      )
      await helpers.local.scan()

      log.info('-------- M2 --------')
      const m2 = 'M2'
      await helpers.local.syncDir.outputFile('file', m2)

      log.info('-------- remote sync M1 --------')
      // We don't await the end of the syncAll() call because it will raise 412
      // errors that will only be fixed by the next local scan (i.e. the
      // checksum of the file on the local filesystem is different from the one
      // stored in PouchDB).
      helpers.syncAll()

      log.info('-------- local merge (and remote sync) M2 --------')
      should(await helpers.local.syncDir.checksum('file')).equal(
        'nYMiUwtn4jZuWxumcIHe2Q=='
      )
      await helpers.local.scan()

      // Wait for Sync's retry to complete
      await helpers._sync.stopped()

      should({
        localTree: await helpers.local.tree(),
        remoteTree: await helpers.remote.tree(),
        remoteFileContent: await helpers.remote.readFile('file')
      }).deepEqual({
        localTree: ['file'],
        remoteTree: ['.cozy_trash/', 'file'],
        remoteFileContent: m2
      })
    })
  })

  onPlatform('darwin', () => {
    describe('multiple remote note updates with local buffering delay', () => {
      it.only('does not generate a local conflict', async function() {
        this.timeout(120000)
        const filename = 'file.cozy-note'

        const note = await builders
          .remoteNote()
          .name('file.cozy-note')
          .data('initial content')
          .create()
        await helpers.pullAndSyncAll()
        await helpers.flushLocalAndSyncAll()

        console.log('starting watchers')
        helpers._sync.start()
        await helpers._sync.started()
        //await helpers.local.start()
        //await helpers.remote.start()

        log.info('-------- First remote modification --------')
        console.log({ time: new Date() }, 'merging 1st remote modification')
        const firstUpdate = await builders
          .remoteNote(note)
          .data('first update')
          .update()

        log.info('-------- Local events buffering --------')
        let fileList = []
        for (let i = 0; i < 5000; i++) {
          fileList.push(`whatever-${i}`)
          helpers.local.syncDir.outputFile(`whatever-${i}`, 'local content')
        }

        // Wait for end of buffer timeout so local events are all flushed
        // 2000 is the delay used for tests.
        // See core/local/chokidar/watcher.js
        await new Promise(resolve => {
          helpers.local.side.events.once('prepare-end', async () => {
            log.info('-------- Second remote modification --------')
            console.log({ time: new Date() }, 'merging 2nd remote modification')
            await builders
              .remoteNote(firstUpdate)
              .data('second update')
              .update()
            resolve()
          })
        })

        await new Promise(resolve => {
          let count = 0
          helpers.local.side.events.on('local-end', async () => {
            count++
            if (count === 2) {
              console.log({ time: new Date() }, 'stopping watchers')
              //await helpers.local.stop()
              //await helpers.remote.stop()
              await helpers._sync.stop()
              resolve()
            }
          })
        })

        await should(helpers.local.readFile(filename)).be.fulfilledWith(
          'file\n\nsecond update'
        )
        await should(helpers.remote.readFile(filename)).be.fulfilledWith(
          'file\n\nsecond update'
        )
      })
    })
  })
})
