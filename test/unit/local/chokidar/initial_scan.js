/* eslint-env mocha */

const should = require('should')

const {
  detectOfflineUnlinkEvents
} = require('../../../../core/local/chokidar/initial_scan')
const metadata = require('../../../../core/metadata')

const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')
const { onPlatform } = require('../../../support/helpers/platform')

const { platform } = process

onPlatform('darwin', () => {
  describe('core/local/chokidar/initial_scan', () => {
    let builders

    before('instanciate config', configHelpers.createConfig)
    beforeEach('instanciate pouch', pouchHelpers.createDatabase)

    beforeEach('set up builders', function() {
      builders = new Builders({ pouch: this.pouch })
    })

    afterEach('clean pouch', pouchHelpers.cleanDatabase)
    after('clean config directory', configHelpers.cleanConfig)

    describe('.detectOfflineUnlinkEvents()', function() {
      it('detects deleted files and folders', async function() {
        // Folder still exists
        const folder1 = {
          _id: 'folder1',
          path: 'folder1',
          docType: 'folder',
          sides: { target: 2, local: 2, remote: 2 }
        }
        // Folder does not exist anymore
        const folder2 = {
          _id: 'folder2',
          path: 'folder2',
          docType: 'folder',
          sides: { target: 2, local: 2, remote: 2 }
        }
        // Folder was already trashed remotely
        const folder3 = {
          _id: '.cozy_trash/folder3',
          path: '.cozy_trash/folder3',
          trashed: true,
          docType: 'folder',
          sides: { target: 3, local: 2, remote: 3 }
        }
        // Folder was moved locally
        const folder4 = {
          _id: 'folder4',
          path: 'folder4',
          docType: 'folder',
          moveFrom: {
            _id: 'folder1/folder4',
            path: 'folder1/folder4'
          },
          sides: { target: 3, local: 3, remote: 2 }
        }
        // Folder was already trashed remotely and marked for deletion
        const folder5 = {
          _id: '.cozy_trash/folder5',
          path: '.cozy_trash/folder5',
          deleted: true,
          docType: 'folder',
          sides: { target: 3, local: 2, remote: 3 }
        }
        // File still exists
        const file1 = {
          _id: 'file1',
          path: 'file1',
          docType: 'file',
          sides: { target: 2, local: 2, remote: 2 }
        }
        // File does not exist anymore
        const file2 = {
          _id: 'file2',
          path: 'file2',
          docType: 'file',
          sides: { target: 2, local: 2, remote: 2 }
        }
        // File was trashed remotely
        const file3 = {
          _id: '.cozy_trash/folder3/file3',
          path: '.cozy_trash/folder3/file3',
          trashed: true,
          docType: 'file',
          sides: { target: 3, local: 2, remote: 3 }
        }
        // File was moved locally
        const file4 = {
          _id: 'file4',
          path: 'file4',
          docType: 'file',
          moveFrom: {
            _id: 'folder1/file4',
            path: 'folder1/file4'
          },
          sides: { target: 3, local: 3, remote: 2 }
        }
        // File was already deleted locally and marked for deletion
        const file5 = {
          _id: 'folder1/file5',
          path: 'folder1/file5',
          deleted: true,
          docType: 'file',
          sides: { target: 3, local: 3, remote: 2 }
        }
        for (let doc of [
          folder1,
          folder2,
          folder3,
          folder4,
          folder5,
          file1,
          file2,
          file3,
          file4,
          file5
        ]) {
          const { rev } = await this.pouch.db.put(doc)
          doc._rev = rev
        }
        const initialScan = { ids: ['folder1', 'file1'].map(metadata.id) }

        const { offlineEvents } = await detectOfflineUnlinkEvents(
          initialScan,
          this.pouch
        )

        should(offlineEvents).deepEqual([
          { type: 'unlinkDir', path: 'folder4', old: folder4 },
          { type: 'unlinkDir', path: 'folder2', old: folder2 },
          { type: 'unlink', path: 'file4', old: file4 },
          { type: 'unlink', path: 'file2', old: file2 }
        ])
      })

      if (platform === 'win32') {
        it('ignores incompatible docs', async function() {
          await builders
            .metafile()
            .incompatible()
            .create()
          const initialScan = { ids: [] }

          const { offlineEvents } = await detectOfflineUnlinkEvents(
            initialScan,
            this.pouch
          )
          should(offlineEvents).deepEqual([])
        })
      }
    })

    it('does not detect unsynced remote additions as deleted docs', async function() {
      await builders
        .metadir()
        .path('dir')
        .ino(1)
        .sides({ remote: 1 })
        .create()
      await builders
        .metafile()
        .path('file')
        .ino(2)
        .data('initial content')
        .sides({ remote: 1 })
        .create()

      const initialScan = { ids: [] }

      const { offlineEvents } = await detectOfflineUnlinkEvents(
        initialScan,
        this.pouch
      )

      should(offlineEvents).be.empty()
    })
  })
})
