/* @flow */
/* eslint-env mocha */

const should = require('should')
const sinon = require('sinon')

const fse = require('fs-extra')
const _ = require('lodash')
const Builders = require('../support/builders')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const TestHelpers = require('../support/helpers')

const builders = new Builders()
const cozy = cozyHelpers.cozy

describe('Conflict resolution', () => {
  let helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function () {
    helpers = TestHelpers.init(this)

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  describe('local', () => {
    beforeEach('create and merge conflicting remote file', async () => {
      await cozy.files.create('whatever', {name: 'foo'})
      await helpers.remote.pullChanges()
    })

    it('success', async () => {
      await helpers.local.syncDir.ensureDir('foo')
      await helpers.prep.putFolderAsync('test', 'local', builders.metadir().path('foo').build())
      should(await helpers.local.tree()).deepEqual([
        'foo-conflict-.../'
      ])
    })
  })

  describe('with unmerged local and remote changes', () => {
    beforeEach(async () => {
      // Create file and synchronise it
      await helpers.local.syncDir.outputFile('concurrent-edited', 'local-content')
      await helpers.local.scan()
      await helpers.syncAll()

      // Update file remotely
      const remoteFile = await cozy.files.statByPath('/concurrent-edited')
      await helpers.pouch.byRemoteIdMaybeAsync(remoteFile._id)
      await cozy.files.updateById(remoteFile._id, 'remote-content', {contentType: 'text/plain'})
    })

    const expectedTree = [
      'concurrent-edited',
      'concurrent-edited-conflict-...'
    ]

    it('local change', async () => {
      await helpers.local.syncDir.outputFile('concurrent-edited', 'new-local-content')

      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual({remote: expectedTree, local: expectedTree})
    })

    it('local replacement', async () => {
      // Replace file locally with new one (ino needs to be different)
      await helpers.local.syncDir.outputFile('concurrent-edited2', 'new-local-content')
      await helpers.local.syncDir.unlink('concurrent-edited')
      await helpers.local.syncDir.move('concurrent-edited2', 'concurrent-edited')

      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual({remote: expectedTree, local: expectedTree})
    })
  })

  describe('concurrent edit', () => {
    let remoteFile, pouchFile
    beforeEach(async () => {
      await helpers.local.syncDir.outputFile('concurrent-edited', 'content1')
      await helpers.local.scan()
      await helpers.syncAll()

      // change both concurrently
      await helpers.local.syncDir.outputFile('concurrent-edited', 'content2')
      remoteFile = await cozy.files.statByPath(`/concurrent-edited`)
      pouchFile = await helpers.pouch.byRemoteIdMaybeAsync(remoteFile._id)
      await cozy.files.updateById(remoteFile._id, `content3`, {contentType: 'text/plain'})
    })

    const simulateLocalUpdateMerge = async () => {
      await helpers.prep.updateFileAsync('test', 'local', _.merge(pouchFile, {
        updated_at: new Date().toISOString(),
        md5sum: await helpers.local.syncDir.checksum('concurrent-edited')
      }))
    }

    const expectedTree = [
      'concurrent-edited',
      'concurrent-edited-conflict-...'
    ]

    it('local merged first -> conflict', async () => {
      await simulateLocalUpdateMerge()
      await helpers.remote.pullChanges()
      await helpers.syncAll()
      await helpers.remote.pullChanges()
      await helpers.local.scan()
      await helpers.syncAll()

      should(await helpers.trees()).deepEqual({remote: expectedTree, local: expectedTree})
    })

    it('remote merged first -> conflict', async () => {
      await helpers.remote.pullChanges()
      await simulateLocalUpdateMerge()
      await helpers.syncAll()
      await helpers.remote.pullChanges()
      await helpers.local.scan()
      await helpers.syncAll()

      should(await helpers.trees()).deepEqual({remote: expectedTree, local: expectedTree})
    })

    it('conflict correction local', async () => {
      await helpers.remote.pullChanges()
      await simulateLocalUpdateMerge()
      await helpers.syncAll()
      await helpers.remote.pullChanges()
      await helpers.local.scan()
      await helpers.syncAll()

      const conflictedPath = (await fse.readdir(helpers.local.syncPath))
        .filter(x => x.indexOf('-conflict-') !== -1)[0]

      await helpers.local.syncDir.remove(conflictedPath)
      await helpers.local.syncDir.outputFile('concurrent-edited', 'content5')
      await helpers.local.scan()
      await helpers.syncAll()

      should(await helpers.trees()).deepEqual({remote: ['concurrent-edited'], local: ['concurrent-edited']})
    })

    it('conflict correction remote', async () => {
      await helpers.remote.pullChanges()
      await simulateLocalUpdateMerge()
      await helpers.syncAll()
      await helpers.remote.pullChanges()
      await helpers.local.scan()
      await helpers.syncAll()

      const conflictedPath = (await fse.readdir(helpers.local.syncPath))
        .filter(x => x.indexOf('-conflict-') !== -1)[0]

      const remoteBadFile = await cozy.files.statByPath('/' + conflictedPath)
      const remoteFile = await cozy.files.statByPath(`/concurrent-edited`)
      await cozy.files.trashById(remoteBadFile._id)
      await cozy.files.updateById(remoteFile._id, `content6`, {contentType: 'text/plain'})

      await helpers.remote.pullChanges()
      await helpers.syncAll()

      should(await helpers.trees()).deepEqual({
        remote: ['concurrent-edited'],
        local: [
          '/Trash/concurrent-edited-conflict-...',
          'concurrent-edited']
      })
    })
  })

  // FIXME: Move to helpers?
  const fullSyncStartingFrom = async (sideName) => {
    if (sideName === 'local') {
      // FIXME: Initial scan is not the same as watched change
      await helpers.local.scan()
      await helpers.remote.pullChanges()
    } else {
      // FIXME: Test remote first cases
      throw new Error('Not implemented yet: fullSyncStartingFrom("remote")')
    }
    await helpers.syncAll()

    // Simulate client restart (always starting from local)
    await helpers.local.scan()
    await helpers.remote.pullChanges()
    await helpers.syncAll()
  }

  const bothSides = (tree) => ({local: tree, remote: tree})

  describe('merging local file then remote one', () => {
    it('renames one of them', async () => {
      await helpers.local.syncDir.outputFile('same-name', 'content1')
      await cozy.files.create('content2', {
        name: 'same-name',
        contentType: 'text/plain'
      })

      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual(bothSides([
        'same-name',
        'same-name-conflict-...'
      ]))
    })
  })

  describe('merging local file then remote dir', () => {
    beforeEach(async () => {
      await helpers.local.syncDir.outputFile('same-name', 'content1')
      await cozy.files.createDirectory({
        name: 'same-name',
        contentType: 'text/plain'
      })

      await fullSyncStartingFrom('local')
    })

    const expectedTree = bothSides([
      'same-name',
      'same-name-conflict-.../'
    ])

    it('renames the remote dir', async () => {
      should(await helpers.trees()).deepEqual(expectedTree)
    })

    it('does not trigger a conflict on subsequent local update', async () => {
      await helpers.local.syncDir.outputFile('same-name', 'content2')
      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual(expectedTree)
    })
  })

  describe('merging local dir then remote file', () => {
    it('renames the remote file', async () => {
      await helpers.local.syncDir.ensureDir('same-name')
      await cozy.files.create('content2', {
        name: 'same-name',
        contentType: 'text/plain'
      })

      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual(bothSides([
        'same-name-conflict-...',
        'same-name/'
      ]))
    })
  })

  describe('merging local file addition then remote file move to the same destination', () => {
    it('renames one of them', async () => {
      await helpers.local.syncDir.outputFile('src', 'src content')
      await helpers.local.scan()
      await helpers.syncAll()
      // FIXME: Initial tree helper?
      const remoteFile = await cozy.files.statByPath(`/src`)
      await cozy.files.updateAttributesById(remoteFile._id, {name: 'dst'})
      await helpers.local.syncDir.outputFile('dst', 'local dst content')

      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual(bothSides([
        'dst',
        'dst-conflict-...'
      ]))
    })
  })

  describe('merging local file move then remote file addition', () => {
    it('renames one of them', async () => {
      await helpers.local.syncDir.outputFile('src', 'initial content')
      await helpers.local.scan()
      await helpers.syncAll()
      await helpers.pullAndSyncAll()
      // FIXME: Initial tree helper?
      await cozy.files.create('remote dst content', {name: 'dst'})
      await helpers.local.syncDir.move('src', 'dst')

      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual(bothSides([
        'dst',
        'dst-conflict-...'
      ]))
    })
  })

  describe('merging local dir addition then remote dir move to the same destination', () => {
    it('renames one of them', async () => {
      await helpers.local.syncDir.ensureDir('src')
      await helpers.local.scan()
      await helpers.syncAll()
      // FIXME: Initial tree helper?
      const remoteDir = await cozy.files.statByPath(`/src`)
      await cozy.files.updateAttributesById(remoteDir._id, {name: 'dst'})
      await helpers.local.syncDir.ensureDir('dst')

      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual(bothSides([
        'dst-conflict-.../',
        'dst/'
      ]))
    })
  })

  describe('merging local dir move then remote dir addition to the same destination', () => {
    it('renames one of them', async () => {
      await helpers.local.syncDir.ensureDir('src')
      await helpers.local.scan()
      await helpers.syncAll()
      await helpers.pullAndSyncAll()
      // FIXME: Initial tree helper?
      await cozy.files.createDirectory({name: 'dst'})
      await helpers.local.syncDir.move('src', 'dst')

      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual(bothSides([
        'dst-conflict-.../',
        'dst/'
      ]))
    })
  })

  describe('remote', () => {
    beforeEach('set up conflict', async () => {
      await helpers.prep.putFolderAsync('test', 'local', builders.metadir().path('foo').build())
      await cozy.files.create('whatever', {name: 'foo'})
    })

    it('success', async () => {
      await helpers.remote.pullChanges()
      should(await helpers.remote.tree()).deepEqual([
        '.cozy_trash/',
        'foo-conflict-...'
      ])
    })

    describe('retry', () => {
      beforeEach('simulate stack failure', () => {
        sinon.stub(cozy.files, 'updateAttributesById').throws('FetchError')
      })

      it('success', async () => {
        await helpers.remote.pullChanges()
        should(await helpers.remote.tree()).deepEqual([
          '.cozy_trash/',
          'foo'
        ])

        // Stack is back, retry...
        cozy.files.updateAttributesById.restore()
        await helpers.remote.pullChanges()
        should(await helpers.remote.tree()).deepEqual([
          '.cozy_trash/',
          'foo-conflict-...'
        ])
      })
    })
  })
})
