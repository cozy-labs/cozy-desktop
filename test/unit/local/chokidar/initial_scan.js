/* eslint-env mocha */

const should = require('should')

const {
  detectOfflineUnlinkEvents
} = require('../../../../core/local/chokidar/initial_scan')
const metadata = require('../../../../core/metadata')

const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')

const { platform } = process

describe('core/local/chokidar/initial_scan', () => {
  let builders

  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)

  beforeEach('set up builders', function() {
    builders = new Builders({ pouch: this.pouch })
  })

  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('.detectOfflineUnlinkEvents()', function() {
    beforeEach('reset pouchdb', function(done) {
      this.pouch.resetDatabase(done)
    })

    it('detects deleted files and folders', async function() {
      let folder1 = {
        _id: 'folder1',
        path: 'folder1',
        docType: 'folder'
      }
      let folder2 = {
        _id: 'folder2',
        path: 'folder2',
        docType: 'folder'
      }
      const folder3 = {
        _id: '.cozy_trash/folder3',
        path: '.cozy_trash/folder3',
        trashed: true,
        docType: 'folder'
      }
      let file1 = {
        _id: 'file1',
        path: 'file1',
        docType: 'file'
      }
      let file2 = {
        _id: 'file2',
        path: 'file2',
        docType: 'file'
      }
      const file3 = {
        _id: '.cozy_trash/folder3/file3',
        path: '.cozy_trash/folder3/file3',
        trashed: true,
        docType: 'file'
      }
      for (let doc of [folder1, folder2, folder3, file1, file2, file3]) {
        const { rev } = await this.pouch.db.put(doc)
        doc._rev = rev
      }
      const initialScan = { ids: ['folder1', 'file1'].map(metadata.id) }

      const { offlineEvents } = await detectOfflineUnlinkEvents(
        initialScan,
        this.pouch
      )

      should(offlineEvents).deepEqual([
        { type: 'unlinkDir', path: 'folder2', old: folder2 },
        { type: 'unlink', path: 'file2', old: file2 }
      ])
    })

    if (platform === 'win32' || platform === 'darwin') {
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
})
