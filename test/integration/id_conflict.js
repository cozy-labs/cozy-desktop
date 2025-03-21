/* eslint-env mocha */
/* @flow */

const should = require('should')

const config = require('../../core/config')
const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const {
  onPlatform,
  onPlatforms,
  onAPFS,
  onHFS
} = require('../support/helpers/platform')
const pouchHelpers = require('../support/helpers/pouch')

describe('Identity conflict', () => {
  let helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)

  afterEach(() => helpers.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function() {
    helpers = TestHelpers.init(this)

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })
  afterEach(async function() {
    await helpers.stop()
  })

  describe('between two dirs', () => {
    describe('both remote', () => {
      beforeEach(async () => {
        await helpers.remote.createDirectoryByPath('/alfred')
        await helpers.pullAndSyncAll()

        await helpers.remote.createDirectoryByPath('/Alfred')
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
        await helpers.remote.createDirectoryByPath('/Alfred')
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
        await helpers.remote.createDirectoryByPath('/alfred')
        await helpers.remote.pullChanges()
        await helpers.local.syncDir.ensureDir('Alfred')
        await helpers.local.scan()
        await helpers.syncAll()
      })

      onPlatforms(['win32', 'darwin'], () => {
        if (config.watcherType() === 'channel') {
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
        await helpers.remote.createDirectoryByPath('/alfred')
        const john = await helpers.remote.createDirectoryByPath('/john')
        await helpers.pullAndSyncAll()

        await helpers.remote.move(john, '/Alfred')
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
        await helpers.remote.createDirectory('john')
        await helpers.pullAndSyncAll()

        await helpers.remote.createDirectory('alfred')
        await helpers.remote.pullChanges()

        await helpers.local.syncDir.rename('john/', 'Alfred/')
        await helpers.local.scan()
        await helpers.syncAll()
      })

      onPlatforms(['win32', 'darwin'], () => {
        if (config.watcherType() === 'channel') {
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
        await helpers.remote.createFile('alfred', 'alfred content')
        await helpers.pullAndSyncAll()

        await helpers.remote.createFile('Alfred', 'Alfred content')
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
        await helpers.remote.createFile('Alfred', 'Alfred content')
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
        await helpers.remote.createFile('alfred', 'alfred content')
        await helpers.remote.pullChanges()
        await helpers.local.syncDir.outputFile('Alfred', 'Alfred content')
        await helpers.local.scan()
        await helpers.syncAll()
      })

      onPlatforms(['win32', 'darwin'], () => {
        if (config.watcherType() === 'channel') {
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
        await helpers.remote.createFileByPath('/alfred', 'alfred content')
        const john = await helpers.remote.createFileByPath(
          '/john',
          'john content'
        )
        await helpers.pullAndSyncAll()

        await helpers.remote.move(john, '/Alfred')
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
        await helpers.remote.createFileByPath('/john', 'john content')
        await helpers.pullAndSyncAll()

        await helpers.remote.createFileByPath('/alfred', 'alfred content')
        await helpers.remote.pullChanges()

        await helpers.local.syncDir.rename('john', 'Alfred')
        await helpers.local.scan()
        await helpers.syncAll()
      })

      onPlatforms(['win32', 'darwin'], () => {
        if (config.watcherType() === 'channel') {
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
        await helpers.remote.createDirectory(nfcDir)
        await helpers.remote.createFile(nfcFile, 'whatever')
        await helpers.pullAndSyncAll()
        // ...and normalized to NFD by HFS+ (simulated here)
        await helpers.local.syncDir.rename(nfcDir, nfdDir)
        await helpers.local.syncDir.rename(nfcFile, nfdFile)

        const nfdLocalOnly = {
          local: [`${nfdDir}/`, nfdFile],
          metadata: [`${nfcDir}/`, nfcFile],
          remote: [`${nfcDir}/`, nfcFile]
        }

        await helpers.local.scan()
        should(await helpers.trees('local', 'metadata', 'remote')).deepEqual(
          nfdLocalOnly
        )
        await helpers.syncAll()
        should(await helpers.trees('local', 'metadata', 'remote')).deepEqual(
          nfdLocalOnly
        )
        await helpers.remote.pullChanges()
        should(await helpers.trees('local', 'metadata', 'remote')).deepEqual(
          nfdLocalOnly
        )
      })
    })

    describe('synchronization of new remote file', () => {
      describe('whose name contains NFC characters', () => {
        const filename = 'Dôme'.normalize('NFC')

        onAPFS(() => {
          it('keeps the remote name everywhere and does not create a conflict', async () => {
            await helpers.remote.createFile(filename, 'whatever')
            await helpers.pullAndSyncAll()
            await helpers.flushLocalAndSyncAll()
            should(
              await helpers.trees('local', 'metadata', 'remote')
            ).deepEqual({
              local: [filename],
              metadata: [filename],
              remote: [filename]
            })
          })
        })

        onHFS(() => {
          it('keeps the remote name in PouchDB and does not create a conflict', async () => {
            await helpers.remote.createFile(filename, 'whatever')
            await helpers.pullAndSyncAll()
            await helpers.flushLocalAndSyncAll()
            should(
              await helpers.trees('local', 'metadata', 'remote')
            ).deepEqual({
              local: [filename.normalize('NFD')],
              metadata: [filename],
              remote: [filename]
            })
          })
        })
      })

      describe('whose name contains NFD characters', () => {
        const filename = 'Dôme'.normalize('NFD')

        onAPFS(() => {
          it('keeps the remote name everywhere and does not create a conflict', async () => {
            await helpers.remote.createFile(filename, 'whatever')
            await helpers.pullAndSyncAll()
            await helpers.flushLocalAndSyncAll()
            should(
              await helpers.trees('local', 'metadata', 'remote')
            ).deepEqual({
              local: [filename],
              metadata: [filename],
              remote: [filename]
            })
          })
        })

        onHFS(() => {
          it('keeps the remote name in PouchDB and does not create a conflict', async () => {
            await helpers.remote.createFile(filename, 'whatever')
            await helpers.pullAndSyncAll()
            await helpers.flushLocalAndSyncAll()
            should(
              await helpers.trees('local', 'metadata', 'remote')
            ).deepEqual({
              local: [filename.normalize('NFD')],
              metadata: [filename],
              remote: [filename]
            })
          })
        })
      })

      describe('whose name contains both NFC and NFD characters', () => {
        const filename = 'Dôme'.normalize('NFD') + ' éclipse'.normalize('NFC')

        onAPFS(() => {
          it('keeps the remote name everywhere and does not create a conflict', async () => {
            await helpers.remote.createFile(filename, 'whatever')
            await helpers.pullAndSyncAll()
            await helpers.flushLocalAndSyncAll()
            should(
              await helpers.trees('local', 'metadata', 'remote')
            ).deepEqual({
              local: [filename],
              metadata: [filename],
              remote: [filename]
            })
          })
        })

        onHFS(() => {
          it('keeps the remote name in PouchDB and does not create a conflict', async () => {
            await helpers.remote.createFile(filename, 'whatever')
            await helpers.pullAndSyncAll()
            await helpers.flushLocalAndSyncAll()
            should(
              await helpers.trees('local', 'metadata', 'remote')
            ).deepEqual({
              local: [filename.normalize('NFD')],
              metadata: [filename],
              remote: [filename]
            })
          })
        })
      })

      context(
        'when another document with a different encoding already exists',
        () => {
          const originalFilename =
            'Dôme'.normalize('NFD') + ' éclipse'.normalize('NFC')
          const newFilename = originalFilename.normalize('NFC')

          onAPFS(() => {
            it('renames the second one remotely to resolve the conflict on next polling', async () => {
              await helpers.remote.createFile(originalFilename, 'whatever')
              await helpers.pullAndSyncAll()
              await helpers.flushLocalAndSyncAll()
              should(
                await helpers.trees('local', 'metadata', 'remote')
              ).deepEqual({
                local: [originalFilename],
                metadata: [originalFilename],
                remote: [originalFilename]
              })

              await helpers.remote.createFile(newFilename, 'whatever')
              await helpers.pullAndSyncAll()
              should(
                await helpers.trees('local', 'metadata', 'remote')
              ).deepEqual({
                local: [originalFilename],
                metadata: [originalFilename],
                remote: [originalFilename, newFilename + '-conflict-...']
              })
            })
          })

          onHFS(() => {
            it('renames the second one remotely to resolve the conflict on next polling', async () => {
              await helpers.remote.createFile(originalFilename, 'whatever')
              await helpers.pullAndSyncAll()
              await helpers.flushLocalAndSyncAll()
              should(
                await helpers.trees('local', 'metadata', 'remote')
              ).deepEqual({
                local: [originalFilename.normalize('NFD')],
                metadata: [originalFilename],
                remote: [originalFilename]
              })

              await helpers.remote.createFile(newFilename, 'whatever')
              await helpers.pullAndSyncAll()
              should(
                await helpers.trees('local', 'metadata', 'remote')
              ).deepEqual({
                local: [originalFilename.normalize('NFD')],
                metadata: [originalFilename],
                remote: [originalFilename, newFilename + '-conflict-...']
              })
            })
          })
        }
      )
    })
  })
})
