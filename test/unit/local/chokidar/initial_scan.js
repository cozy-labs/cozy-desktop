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
        await builders
          .metadir()
          .path('folder1')
          .upToDate()
          .create()
        // Folder does not exist anymore
        const folder2 = await builders
          .metadir()
          .path('folder2')
          .upToDate()
          .create()
        // Folder was already trashed remotely
        await builders
          .metadir()
          .path('.cozy_trash/folder3')
          .trashed()
          .changedSide('remote')
          .create()
        // Folder was moved locally
        const srcFolder4 = await builders
          .metadir()
          .path('folder1/folder4')
          .upToDate()
          .create()
        const folder4 = await builders
          .metadir()
          .moveFrom(srcFolder4)
          .path('folder4')
          .changedSide('local')
          .create()
        // Folder was already trashed remotely and marked for deletion
        await builders
          .metadir()
          .path('.cozy_trash/folder5')
          .trashed()
          .changedSide('remote')
          .create()
        // File still exists
        builders
          .metafile()
          .path('file1')
          .upToDate()
          .create()
        // File does not exist anymore
        const file2 = await builders
          .metafile()
          .path('file2')
          .upToDate()
          .create()
        // File was trashed remotely
        builders
          .metafile()
          .path('.cozy_trash/folder3/file3')
          .trashed()
          .changedSide('remote')
          .create()
        // File was moved locally
        const srcFile4 = await builders
          .metafile()
          .path('folder1/file4')
          .upToDate()
          .create()
        const file4 = await builders
          .metafile()
          .moveFrom(srcFile4)
          .path('file4')
          .changedSide('local')
          .create()
        // File was already deleted locally and marked for deletion
        builders
          .metafile()
          .path('folder1/file5')
          .trashed()
          .changedSide('local')
          .create()
        const initialScan = { paths: ['folder1', 'file1'].map(metadata.id) }

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
