/* eslint-env mocha */
/* @flow */

const should = require('should')

const config = require('../../core/config')

const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const { onPlatform, onPlatforms } = require('../support/helpers/platform')
const pouchHelpers = require('../support/helpers/pouch')
const TestHelpers = require('../support/helpers')

describe('Identity conflict', () => {
  if (process.env.TRAVIS && process.platform === 'darwin') {
    it.skip(
      'cannot work on macOS Travis since the cozy-stack is currently using ' +
        'APFS instead of EXT4 (but at least it works on AppVeyor)',
      () => {}
    )
    return
  }

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

  describe('between two dirs', () => {
    describe('both remote', () => {
      beforeEach(async () => {
        await cozy.files.createDirectoryByPath('/alfred')
        await helpers.pullAndSyncAll()

        await cozy.files.createDirectoryByPath('/Alfred')
        await helpers.pullAndSyncAll()
      })

      onPlatforms(['win32', 'darwin'], () => {
        it('renames the second one remotely to resolve the conflict on next polling', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['alfred/'],
            remote: ['Alfred-conflict-.../', 'alfred/']
          })
          await helpers.pullAndSyncAll()
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred-conflict-.../', 'alfred/'],
            remote: ['Alfred-conflict-.../', 'alfred/']
          })
        })
      })

      onPlatform('linux', () => {
        it('syncs both without any conflict', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred/', 'alfred/'],
            remote: ['Alfred/', 'alfred/']
          })
        })
      })
    })

    describe('unsynced local + remote', () => {
      beforeEach(async () => {
        await helpers.local.syncDir.ensureDir('alfred')
        await helpers.local.scan()
        await cozy.files.createDirectoryByPath('/Alfred')
        await helpers.pullAndSyncAll()
      })

      onPlatforms(['win32', 'darwin'], () => {
        it('renames the remote one to resolve the conflict on next polling', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['alfred/'],
            remote: ['Alfred-conflict-.../', 'alfred/']
          })
          await helpers.pullAndSyncAll()
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred-conflict-.../', 'alfred/'],
            remote: ['Alfred-conflict-.../', 'alfred/']
          })
        })
      })

      onPlatform('linux', () => {
        it('syncs both without any conflict', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred/', 'alfred/'],
            remote: ['Alfred/', 'alfred/']
          })
        })
      })
    })

    describe('unsynced remote + local', () => {
      beforeEach(async () => {
        await cozy.files.createDirectoryByPath('/alfred')
        await helpers.remote.pullChanges()
        await helpers.local.syncDir.ensureDir('Alfred')
        await helpers.local.scan()
        await helpers.syncAll()
      })

      onPlatforms(['win32', 'darwin'], () => {
        if (config.watcherType() === 'atom') {
          it.skip('is not supported yet')
          return
        }

        it('renames the local one to resolve the conflict on next flush', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred-conflict-.../', 'alfred/'],
            remote: ['alfred/']
          })
          await helpers.flushLocalAndSyncAll()
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred-conflict-.../', 'alfred/'],
            remote: ['Alfred-conflict-.../', 'alfred/']
          })
        })
      })

      onPlatform('linux', () => {
        it('syncs both without any conflict', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred/', 'alfred/'],
            remote: ['Alfred/', 'alfred/']
          })
        })
      })
    })

    describe('synced + moved remote', () => {
      beforeEach(async () => {
        await cozy.files.createDirectory({ name: 'alfred' })
        await cozy.files.createDirectory({ name: 'john' })
        await helpers.pullAndSyncAll()

        await cozy.files.updateAttributesByPath('/john', { name: 'Alfred' })
        await helpers.pullAndSyncAll()
      })

      onPlatforms(['win32', 'darwin'], () => {
        it('renames the moved one to resolve the conflict on next polling', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['alfred/', 'john/'],
            remote: ['Alfred-conflict-.../', 'alfred/']
          })
          await helpers.pullAndSyncAll()
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred-conflict-.../', 'alfred/'],
            remote: ['Alfred-conflict-.../', 'alfred/']
          })
        })
      })

      onPlatform('linux', () => {
        it('syncs both without any conflict', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred/', 'alfred/'],
            remote: ['Alfred/', 'alfred/']
          })
        })
      })
    })

    describe('unsynced remote + moved local', () => {
      beforeEach(async () => {
        await cozy.files.createDirectory({ name: 'john' })
        await helpers.pullAndSyncAll()

        await cozy.files.createDirectory({ name: 'alfred' })
        await helpers.remote.pullChanges()

        await helpers.local.syncDir.rename('john/', 'Alfred/')
        await helpers.local.scan()
        await helpers.syncAll()
      })

      onPlatforms(['win32', 'darwin'], () => {
        if (config.watcherType() === 'atom') {
          it.skip('is not supported yet')
          return
        }

        it('renames the moved one to resolve the conflict on next polling', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred-conflict-.../', 'alfred/'],
            remote: ['alfred/', 'john/']
          })
          await helpers.local.scan()
          await helpers.syncAll()
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred-conflict-.../', 'alfred/'],
            remote: ['Alfred-conflict-.../', 'alfred/']
          })
        })
      })

      onPlatform('linux', () => {
        it('syncs both without any conflict', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred/', 'alfred/'],
            remote: ['Alfred/', 'alfred/']
          })
        })
      })
    })
  })

  describe('between two files', () => {
    describe('both remote', () => {
      beforeEach(async () => {
        await cozy.files.create('alfred content', { name: 'alfred' })
        await helpers.pullAndSyncAll()

        await cozy.files.create('Alfred content', { name: 'Alfred' })
        await helpers.pullAndSyncAll()
      })

      onPlatforms(['win32', 'darwin'], () => {
        it('renames the second one remotely to resolve the conflict on next polling', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['alfred'],
            remote: ['Alfred-conflict-...', 'alfred']
          })
          await helpers.pullAndSyncAll()
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred-conflict-...', 'alfred'],
            remote: ['Alfred-conflict-...', 'alfred']
          })
        })
      })

      onPlatform('linux', () => {
        it('syncs both without any conflict', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred', 'alfred'],
            remote: ['Alfred', 'alfred']
          })
        })
      })
    })

    describe('unsynced local + remote', () => {
      beforeEach(async () => {
        await helpers.local.syncDir.outputFile('alfred', 'alfred content')
        await helpers.local.scan()
        await cozy.files.create('Alfred content', { name: 'Alfred' })
        await helpers.pullAndSyncAll()
      })

      onPlatforms(['win32', 'darwin'], () => {
        it('renames the remote one to resolve the conflict on next polling', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['alfred'],
            remote: ['Alfred-conflict-...', 'alfred']
          })
          await helpers.pullAndSyncAll()
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred-conflict-...', 'alfred'],
            remote: ['Alfred-conflict-...', 'alfred']
          })
        })
      })

      onPlatform('linux', () => {
        it('syncs both without any conflict', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred', 'alfred'],
            remote: ['Alfred', 'alfred']
          })
        })
      })
    })

    describe('unsynced remote + local', () => {
      beforeEach(async () => {
        await cozy.files.create('alfred content', { name: 'alfred' })
        await helpers.remote.pullChanges()
        await helpers.local.syncDir.outputFile('Alfred', 'Alfred content')
        await helpers.local.scan()
        await helpers.syncAll()
      })

      onPlatforms(['win32', 'darwin'], () => {
        if (config.watcherType() === 'atom') {
          it.skip('is not supported yet')
          return
        }

        it('renames the local one to resolve the conflict on next flush', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred-conflict-...', 'alfred'],
            remote: ['alfred']
          })
          await helpers.flushLocalAndSyncAll()
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred-conflict-...', 'alfred'],
            remote: ['Alfred-conflict-...', 'alfred']
          })
        })
      })

      onPlatform('linux', () => {
        it('syncs both without any conflict', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred', 'alfred'],
            remote: ['Alfred', 'alfred']
          })
        })
      })
    })

    describe('synced + moved remote', () => {
      beforeEach(async () => {
        await cozy.files.create('alfred content', { name: 'alfred' })
        await cozy.files.create('john content', { name: 'john' })
        await helpers.pullAndSyncAll()

        await cozy.files.updateAttributesByPath('/john', { name: 'Alfred' })
        await helpers.pullAndSyncAll()
      })

      onPlatforms(['win32', 'darwin'], () => {
        it('renames the moved one to resolve the conflict on next polling', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['alfred', 'john'],
            remote: ['Alfred-conflict-...', 'alfred']
          })
          await helpers.pullAndSyncAll()
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred-conflict-...', 'alfred'],
            remote: ['Alfred-conflict-...', 'alfred']
          })
        })
      })

      onPlatform('linux', () => {
        it('syncs both without any conflict', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred', 'alfred'],
            remote: ['Alfred', 'alfred']
          })
        })
      })
    })

    describe('unsynced remote + moved local', () => {
      beforeEach(async () => {
        await cozy.files.create('john content', { name: 'john' })
        await helpers.pullAndSyncAll()

        await cozy.files.create('alfred content', { name: 'alfred' })
        await helpers.remote.pullChanges()

        await helpers.local.syncDir.rename('john', 'Alfred')
        await helpers.local.scan()
        await helpers.syncAll()
      })

      onPlatforms(['win32', 'darwin'], () => {
        if (config.watcherType() === 'atom') {
          it.skip('is not supported yet')
          return
        }

        it('renames the moved one to resolve the conflict on next polling', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred-conflict-...', 'alfred'],
            remote: ['alfred', 'john']
          })
          await helpers.local.scan()
          await helpers.syncAll()
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred-conflict-...', 'alfred'],
            remote: ['Alfred-conflict-...', 'alfred']
          })
        })
      })

      onPlatform('linux', () => {
        it('syncs both without any conflict', async () => {
          should(await helpers.trees('local', 'remote')).deepEqual({
            local: ['Alfred', 'alfred'],
            remote: ['Alfred', 'alfred']
          })
        })
      })
    })
  })

  onPlatform('darwin', () => {
    describe('initial scan of local HFS+ NFD-normalized file/dir that was initially NFC-normalized in Pouch/Cozy', () => {
      it('is not identified as a conflict', async () => {
        const nfcDir = 'dir_\u00e9'
        const nfdDir = 'dir_e\u0301'
        const nfcFile = 'file_\u00e9'
        const nfdFile = 'file_e\u0301'

        // Remote NFC file/dir was synchronized...
        await cozy.files.createDirectory({ name: nfcDir })
        await cozy.files.create('whatever', { name: nfcFile })
        await helpers.pullAndSyncAll()
        // ...and normalized to NFD by HFS+ (simulated here)
        await helpers.local.syncDir.rename(nfcDir, nfdDir)
        await helpers.local.syncDir.rename(nfcFile, nfdFile)

        await helpers.local.scan()
        should(await helpers.trees('local', 'metadata', 'remote')).deepEqual({
          local: [`${nfdDir}/`, nfdFile],
          metadata: [`${nfdDir}/`, nfdFile],
          remote: [`${nfcDir}/`, nfcFile]
        })
        await helpers.syncAll()
        const nfdEverywhere = {
          local: [`${nfdDir}/`, nfdFile],
          metadata: [`${nfdDir}/`, nfdFile],
          remote: [`${nfdDir}/`, nfdFile]
        }
        should(await helpers.trees('local', 'metadata', 'remote')).deepEqual(
          nfdEverywhere
        )
        await helpers.remote.pullChanges()
        should(await helpers.trees('local', 'metadata', 'remote')).deepEqual(
          nfdEverywhere
        )
      })
    })
  })
})
