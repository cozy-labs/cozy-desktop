/* eslint-env mocha */
/* @flow */

const should = require('should')

const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const {
  WINDOWS_DEFAULT_MODE,
  onPlatforms
} = require('../support/helpers/platform')
const pouchHelpers = require('../support/helpers/pouch')
const { IntegrationTestHelpers } = require('../support/helpers/integration')

const { platform } = process

describe('Executable handling', () => {
  let cozy, helpers, pouch, syncDir

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function () {
    pouch = this.pouch
    cozy = cozyHelpers.cozy
    helpers = new IntegrationTestHelpers(this.config, pouch, cozy)
    syncDir = helpers.local.syncDir

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  const executableStatus = async relpath => {
    const mode = await syncDir.octalMode(relpath)
    const doc = await helpers.docByPath(relpath)
    const remote = await cozy.files.statByPath(`/${relpath}`)

    return {
      local: mode,
      pouch: doc.executable,
      remote: remote.attributes.executable
    }
  }

  const unmergedChanges = async relpath => {
    helpers.spyPouch()
    await helpers.local.scan()
    await helpers.remote.pullChanges()
    return helpers.putDocs('path', 'executable', 'sides')
  }

  describe('adding a local executable file', () => {
    onPlatforms('darwin', 'linux', () => {
      it('is executable everywhere', async () => {
        await syncDir.ensureFileMode('file', 0o777)
        await helpers.local.scan()
        await helpers.syncAll()

        should(await executableStatus('file')).deepEqual({
          local: '777',
          pouch: true,
          remote: true
        })
        should(await unmergedChanges('file')).deepEqual([])
      })
    })
  })

  describe('adding a local non-executable file', () => {
    it('is non-executable anywhere', async () => {
      await syncDir.ensureFileMode('file', 0o666)
      await helpers.local.scan()
      await helpers.syncAll()

      should(await executableStatus('file')).deepEqual({
        local: platform === 'win32'
          ? WINDOWS_DEFAULT_MODE // actually the same, but better separate
          : '666',
        pouch: undefined,
        remote: false
      })
      should(await unmergedChanges('file')).deepEqual([])
    })
  })

  describe('adding a remote executable file', () => {
    it('is executable everywhere, except on Windows', async () => {
      await cozy.files.create('whatever content', {name: 'file'})
      await cozy.files.updateAttributesByPath('/file', {executable: true})
      await helpers.pullAndSyncAll()

      should(await executableStatus('file')).deepEqual({
        local: platform === 'win32'
          ? WINDOWS_DEFAULT_MODE
          : '755', // assuming umask 022
        pouch: true,
        remote: true
      })
      // FIXME: Windows unsynced
      // should(await unmergedChanges('file')).deepEqual([])
    })
  })

  describe('adding a remote non-executable file', () => {
    it('is not executable anywhere', async () => {
      await cozy.files.create('whatever content', {name: 'file'})
      await helpers.pullAndSyncAll()

      should(await executableStatus('file')).deepEqual({
        local: platform === 'win32'
          ? WINDOWS_DEFAULT_MODE
          : '644', // assuming umask 022
        pouch: undefined,
        remote: false
      })
      should(await unmergedChanges('file')).deepEqual([])
    })
  })

  context('with a synced non-executable file', () => {
    beforeEach(async () => {
      await syncDir.ensureFileMode('file', 0o666)
      await helpers.local.scan()
      await helpers.syncAll()
    })

    describe('making it executable locally', () => {
      onPlatforms('darwin', 'linux', () => {
        it('makes it executable everywhere', async () => {
          await syncDir.chmod('file', 0o766)
          await helpers.local.scan()
          await helpers.syncAll()

          should(await executableStatus('file')).deepEqual({
            local: '766',
            pouch: true,
            remote: true
          })
          should(await unmergedChanges('file')).deepEqual([])
        })
      })
    })

    describe('making it executable remotely', () => {
      it('is executable everywhere, forcing 755 locally, except on Windows', async () => {
        await cozy.files.updateAttributesByPath('/file', {executable: true})
        await helpers.pullAndSyncAll()

        should(await executableStatus('file')).deepEqual({
          local: platform === 'win32'
            ? WINDOWS_DEFAULT_MODE
            : '755',
          pouch: true,
          remote: true
        })
        // FIXME: Windows unsynced
        // should(await unmergedChanges('file')).deepEqual([])
      })
    })
  })

  context('with a synced executable file', () => {
    beforeEach(async () => {
      await cozy.files.create('whatever content', {name: 'file'})
      await cozy.files.updateAttributesByPath('/file', {executable: true})
      await helpers.pullAndSyncAll()
    })

    describe('making it non-executable locally', () => {
      onPlatforms('darwin', 'linux', () => {
        it('is non-executable everywhere', async () => {
          await syncDir.chmod('file', 0o644)
          await helpers.local.scan()
          await helpers.syncAll()

          should(await executableStatus('file')).deepEqual({
            local: '644',
            pouch: undefined,
            remote: false
          })
          should(await unmergedChanges('file')).deepEqual([])
        })
      })
    })

    describe('making it non-executable remotely', () => {
      it('is non-executable everywhere', async () => {
        await cozy.files.updateAttributesByPath('/file', {executable: false})
        await helpers.pullAndSyncAll()

        should(await executableStatus('file')).deepEqual({
          local: platform === 'win32'
            ? WINDOWS_DEFAULT_MODE
            : '644',
          pouch: undefined,
          remote: false
        })
        should(await unmergedChanges('file')).deepEqual([])
      })
    })
  })
})
