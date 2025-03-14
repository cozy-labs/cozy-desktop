/* eslint-env mocha */
/* @flow */

const should = require('should')

const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const {
  WINDOWS_DEFAULT_MODE,
  onPlatforms
} = require('../support/helpers/platform')
const pouchHelpers = require('../support/helpers/pouch')

const { platform } = process

describe('Executable handling', () => {
  let cozy, helpers, syncDir

  beforeEach(configHelpers.createConfig)
  beforeEach(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)

  afterEach(() => helpers.clean())
  afterEach(pouchHelpers.cleanDatabase)
  afterEach(configHelpers.cleanConfig)

  beforeEach(async function() {
    cozy = cozyHelpers.cozy
    helpers = TestHelpers.init(this)
    syncDir = helpers.local.syncDir

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })
  afterEach(async function() {
    await helpers.stop()
  })

  const executableStatus = async relpath => {
    const mode = await syncDir.octalMode(relpath)
    const doc = await helpers.docByPath(relpath)
    const remote = await helpers.remote.byPath(`/${relpath}`)

    return {
      local: mode,
      pouch: {
        local: doc.local && doc.local.executable,
        remote:
          doc.remote && doc.remote.type === 'file' && doc.remote.executable,
        synced: doc.executable
      },
      remote: remote.type === 'file' && remote.executable
    }
  }

  const unmergedChanges = async () => {
    helpers.spyPouch()
    await helpers.local.scan()
    await helpers.remote.pullChanges()
    return helpers.putDocs('path', 'executable', 'sides')
  }

  describe('adding a local executable file', () => {
    onPlatforms(['darwin', 'linux'], () => {
      it('is executable everywhere', async () => {
        await syncDir.ensureFileMode('file', 0o777)
        await helpers.flushLocalAndSyncAll()

        should(await executableStatus('file')).deepEqual({
          local: '777',
          pouch: {
            local: true,
            remote: true,
            synced: true
          },
          remote: true
        })
        should(await unmergedChanges()).deepEqual([])
      })
    })
  })

  describe('adding a local non-executable file', () => {
    it('is non-executable anywhere', async () => {
      await syncDir.ensureFileMode('file', 0o666)
      await helpers.flushLocalAndSyncAll()

      should(await executableStatus('file')).deepEqual({
        local:
          platform === 'win32'
            ? WINDOWS_DEFAULT_MODE // actually the same, but better separate
            : '666',
        pouch: {
          local: false,
          remote: false,
          synced: false
        },
        remote: false
      })
      should(await unmergedChanges()).deepEqual([])
    })
  })

  describe('adding a remote executable file', () => {
    it('is executable everywhere, except on Windows', async () => {
      await helpers.remote.createFileByPath('/file', 'whatever content')
      await cozy.files.updateAttributesByPath('/file', { executable: true })
      await helpers.pullAndSyncAll()
      await helpers.flushLocalAndSyncAll()

      should(await executableStatus('file')).deepEqual({
        local: platform === 'win32' ? WINDOWS_DEFAULT_MODE : '755', // assuming umask 022
        pouch: {
          local: platform !== 'win32',
          remote: true,
          synced: true
        },
        remote: true
      })
      should(await unmergedChanges()).deepEqual([])
    })
  })

  describe('adding a remote non-executable file', () => {
    it('is not executable anywhere', async () => {
      await helpers.remote.createFile('file', 'whatever content')
      await helpers.pullAndSyncAll()
      await helpers.flushLocalAndSyncAll()

      should(await executableStatus('file')).deepEqual({
        local: platform === 'win32' ? WINDOWS_DEFAULT_MODE : '644', // assuming umask 022
        pouch: {
          local: false,
          remote: false,
          synced: false
        },
        remote: false
      })
      should(await unmergedChanges()).deepEqual([])
    })
  })

  context('with a synced non-executable file', () => {
    beforeEach(async () => {
      await syncDir.ensureFileMode('file', 0o666)
      await helpers.flushLocalAndSyncAll()
    })

    describe('making it executable locally', () => {
      onPlatforms(['darwin', 'linux'], () => {
        it('makes it executable everywhere', async () => {
          await syncDir.chmod('file', 0o766)
          await helpers.flushLocalAndSyncAll()

          should(await executableStatus('file')).deepEqual({
            local: '766',
            pouch: {
              local: true,
              remote: true,
              synced: true
            },
            remote: true
          })
          should(await unmergedChanges()).deepEqual([])
        })
      })
    })

    describe('making it executable remotely', () => {
      it('is executable everywhere, forcing 755 locally, except on Windows', async () => {
        await cozy.files.updateAttributesByPath('/file', { executable: true })
        await helpers.pullAndSyncAll()
        await helpers.flushLocalAndSyncAll()

        should(await executableStatus('file')).deepEqual({
          local: platform === 'win32' ? WINDOWS_DEFAULT_MODE : '755', // assuming umask 022
          pouch: {
            local: platform !== 'win32',
            remote: true,
            synced: true
          },
          remote: true
        })
        should(await unmergedChanges()).deepEqual([])
      })
    })
  })

  context('with a synced executable file', () => {
    beforeEach(async () => {
      await helpers.remote.createFileByPath('/file', 'whatever content')
      await cozy.files.updateAttributesByPath('/file', { executable: true })
      await helpers.pullAndSyncAll()
    })

    describe('making it non-executable locally', () => {
      onPlatforms(['darwin', 'linux'], () => {
        it('is non-executable everywhere', async () => {
          await syncDir.chmod('file', 0o644)
          await helpers.flushLocalAndSyncAll()

          should(await executableStatus('file')).deepEqual({
            local: '644',
            pouch: {
              local: false,
              remote: false,
              synced: false
            },
            remote: false
          })
          should(await unmergedChanges()).deepEqual([])
        })
      })
    })

    describe('making it non-executable remotely', () => {
      it('is non-executable everywhere', async () => {
        await cozy.files.updateAttributesByPath('/file', { executable: false })
        await helpers.pullAndSyncAll()
        await helpers.flushLocalAndSyncAll()

        should(await executableStatus('file')).deepEqual({
          local: platform === 'win32' ? WINDOWS_DEFAULT_MODE : '644',
          pouch: {
            local: false,
            remote: false,
            synced: false
          },
          remote: false
        })
        should(await unmergedChanges()).deepEqual([])
      })
    })

    describe('moving it locally', () => {
      it('is executable everywhere, except on Windows', async () => {
        await syncDir.move('file', 'moved')
        await helpers.flushLocalAndSyncAll()

        should(await executableStatus('moved')).deepEqual({
          local: platform === 'win32' ? WINDOWS_DEFAULT_MODE : '755',
          pouch: {
            local: platform != 'win32',
            remote: true,
            synced: true
          },
          remote: true
        })
        should(await unmergedChanges()).deepEqual([])
      })
    })

    describe('moving it remotely', () => {
      it('is executable everywhere, except on Windows', async () => {
        await cozy.files.updateAttributesByPath('/file', { name: 'moved' })
        await helpers.pullAndSyncAll()
        await helpers.flushLocalAndSyncAll()

        should(await executableStatus('moved')).deepEqual({
          local: platform === 'win32' ? WINDOWS_DEFAULT_MODE : '755',
          pouch: {
            local: platform != 'win32',
            remote: true,
            synced: true
          },
          remote: true
        })
        should(await unmergedChanges()).deepEqual([])
      })
    })
  })
})
