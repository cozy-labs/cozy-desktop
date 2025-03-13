/* @flow */
/* eslint-env mocha */

const { FetchError } = require('electron-fetch')
const fse = require('fs-extra')
const _ = require('lodash')
const should = require('should')
const sinon = require('sinon')

const metadata = require('../../core/metadata')
const Builders = require('../support/builders')
const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')

const cozy = cozyHelpers.cozy

describe('Conflict resolution', () => {
  let helpers, builders

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)

  afterEach(() => helpers.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function() {
    helpers = TestHelpers.init(this)
    builders = new Builders(this)

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })
  afterEach(async function() {
    await helpers.stop()
  })

  describe('local', () => {
    beforeEach('create and merge conflicting remote file', async () => {
      await cozy.files.create('whatever', { name: 'foo' })
      await helpers.remote.pullChanges()
    })

    it('success', async () => {
      await helpers.local.syncDir.ensureDir('foo')
      await helpers.prep.putFolderAsync(
        'local',
        builders
          .metadir()
          .path('foo')
          .build()
      )
      should(await helpers.local.tree()).deepEqual(['foo-conflict-.../'])

      await helpers.flushLocalAndSyncAll()
      await helpers.pullAndSyncAll()

      should(await helpers.local.tree()).deepEqual(['foo', 'foo-conflict-.../'])
      should(await helpers.remote.treeWithoutTrash()).deepEqual([
        'foo',
        'foo-conflict-.../'
      ])
    })
  })

  describe('with unmerged local and remote changes', () => {
    beforeEach(async () => {
      // Create file and synchronize it
      await helpers.local.syncDir.outputFile(
        'concurrent-edited',
        'local-content'
      )
      await helpers.local.scan()
      await helpers.syncAll()

      // Update file remotely
      const remoteFile = await cozy.files.statByPath('/concurrent-edited')
      await helpers.pouch.byRemoteIdMaybe(remoteFile._id)
      await cozy.files.updateById(remoteFile._id, 'remote-content', {
        contentType: 'text/plain'
      })
    })

    const expectedTree = ['concurrent-edited', 'concurrent-edited-conflict-...']

    it('local change', async () => {
      await helpers.local.syncDir.outputFile(
        'concurrent-edited',
        'new-local-content'
      )

      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual({
        remote: expectedTree,
        local: expectedTree
      })
    })

    it('local replacement', async () => {
      // Replace file locally with new one (ino needs to be different)
      await helpers.local.syncDir.outputFile(
        'concurrent-edited2',
        'new-local-content'
      )
      await helpers.local.syncDir.unlink('concurrent-edited')
      await helpers.local.syncDir.move(
        'concurrent-edited2',
        'concurrent-edited'
      )

      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual({
        remote: expectedTree,
        local: expectedTree
      })
    })
  })

  describe('concurrent edit', () => {
    const localUpdateContent = 'local update'
    const remoteUpdateContent = 'remote update'

    let remoteFile, pouchFile
    beforeEach(async () => {
      await helpers.local.syncDir.outputFile(
        'concurrent-edited',
        'original content'
      )
      await helpers.flushLocalAndSyncAll()
      await helpers.pullAndSyncAll()

      // change both concurrently
      await helpers.local.syncDir.outputFile(
        'concurrent-edited',
        localUpdateContent
      )
      remoteFile = await cozy.files.statByPath(`/concurrent-edited`)
      pouchFile = await helpers.pouch.byRemoteIdMaybe(remoteFile._id)
      await cozy.files.updateById(remoteFile._id, remoteUpdateContent, {
        contentType: 'text/plain',
        contentLength: remoteUpdateContent.length
      })
    })

    const simulateLocalUpdateMerge = async () => {
      const localUpdate = _.merge(pouchFile, {
        updated_at: new Date().toISOString(),
        md5sum: await helpers.local.syncDir.checksum('concurrent-edited'),
        size: localUpdateContent.length
      })
      metadata.updateLocal(localUpdate)
      await helpers.prep.updateFileAsync('local', localUpdate)
    }

    const expectedTree = ['concurrent-edited', 'concurrent-edited-conflict-...']

    context('local merged first', () => {
      beforeEach('run actions', async () => {
        await simulateLocalUpdateMerge()
        await helpers.pullAndSyncAll() // creates remote conflict
        await helpers.flushLocalAndSyncAll()
        await helpers.pullAndSyncAll() // fetches remote conflict
      })

      it('creates a conflict', async () => {
        should(await helpers.trees()).deepEqual({
          remote: expectedTree,
          local: expectedTree
        })
      })

      it('conflict correction local', async () => {
        const conflictedPath = (
          await fse.readdir(helpers.local.syncPath)
        ).filter(x => x.indexOf('-conflict-') !== -1)[0]

        await helpers.local.syncDir.remove(conflictedPath)
        await helpers.local.syncDir.outputFile('concurrent-edited', 'content5')
        await helpers.flushLocalAndSyncAll()

        should(await helpers.trees()).deepEqual({
          remote: ['concurrent-edited'],
          local: ['concurrent-edited']
        })
      })

      it('conflict correction remote', async () => {
        const conflictedPath = (
          await fse.readdir(helpers.local.syncPath)
        ).filter(x => x.indexOf('-conflict-') !== -1)[0]

        const remoteBadFile = await cozy.files.statByPath('/' + conflictedPath)
        const remoteFile = await cozy.files.statByPath(`/concurrent-edited`)
        await cozy.files.trashById(remoteBadFile._id)
        await cozy.files.updateById(remoteFile._id, `content6`, {
          contentType: 'text/plain'
        })

        await helpers.remote.pullChanges()
        await helpers.syncAll()

        should(await helpers.trees()).deepEqual({
          remote: ['concurrent-edited'],
          local: ['/Trash/concurrent-edited-conflict-...', 'concurrent-edited']
        })
      })
    })

    context('remote merged first', () => {
      it('creates a local conflict', async () => {
        await helpers.remote.pullChanges()
        await simulateLocalUpdateMerge() // Client restart with wrong update detection
        await helpers.syncAll()
        await helpers.pullAndSyncAll()
        await helpers.flushLocalAndSyncAll()

        should(await helpers.trees()).deepEqual({
          remote: expectedTree,
          local: expectedTree
        })
      })
    })
  })

  // FIXME: Move to helpers?
  const fullSyncStartingFrom = async sideName => {
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

  const bothSides = tree => ({ local: tree, remote: tree })

  describe('merging local file then remote one', () => {
    context('when the content differs', () => {
      it('renames one of them', async () => {
        await helpers.local.syncDir.outputFile('same-name', 'content1')
        await cozy.files.create('content2', {
          name: 'same-name',
          contentType: 'text/plain'
        })

        await fullSyncStartingFrom('local')

        should(await helpers.trees()).deepEqual(
          bothSides(['same-name', 'same-name-conflict-...'])
        )
      })
    })

    context('when the content is the same', () => {
      it('links the two within the same PouchDB record', async () => {
        await helpers.local.syncDir.outputFile('same-name', 'same content')
        await cozy.files.create('same content', {
          name: 'same-name',
          contentType: 'text/plain'
        })

        await fullSyncStartingFrom('local')

        should(await helpers.trees()).deepEqual(bothSides(['same-name']))
      })
    })
  })

  describe('merging local file then remote dir', () => {
    beforeEach(async () => {
      await helpers.local.syncDir.outputFile('same-name', 'content1')
      await cozy.files.createDirectory({
        name: 'same-name'
      })

      await fullSyncStartingFrom('local')
    })

    const expectedTree = bothSides(['same-name', 'same-name-conflict-.../'])

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

      should(await helpers.trees()).deepEqual(
        bothSides(['same-name-conflict-...', 'same-name/'])
      )
    })
  })

  describe('merging local file addition then remote file move to the same destination', () => {
    it('renames one of them', async () => {
      await helpers.local.syncDir.outputFile('src', 'src content')
      await helpers.local.scan()
      await helpers.syncAll()
      // FIXME: Initial tree helper?
      const remoteFile = await cozy.files.statByPath(`/src`)
      await cozy.files.updateAttributesById(remoteFile._id, { name: 'dst' })
      await helpers.local.syncDir.outputFile('dst', 'local dst content')

      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual(
        bothSides(['dst', 'dst-conflict-...'])
      )
    })
  })

  describe('merging local file move then remote file addition', () => {
    it('renames one of them', async () => {
      await helpers.local.syncDir.outputFile('src', 'initial content')
      await helpers.local.scan()
      await helpers.syncAll()
      await helpers.pullAndSyncAll()
      // FIXME: Initial tree helper?
      await cozy.files.create('remote dst content', { name: 'dst' })
      await helpers.local.syncDir.move('src', 'dst')

      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual(
        bothSides(['dst', 'dst-conflict-...'])
      )
    })
  })

  describe('merging local dir addition then remote dir move to the same destination', () => {
    it('renames one of them', async () => {
      await helpers.local.syncDir.ensureDir('src')
      await helpers.local.scan()
      await helpers.syncAll()
      // FIXME: Initial tree helper?
      const remoteDir = await cozy.files.statByPath(`/src`)
      await cozy.files.updateAttributesById(remoteDir._id, { name: 'dst' })
      await helpers.local.syncDir.ensureDir('dst')

      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual(
        bothSides(['dst-conflict-.../', 'dst/'])
      )
    })
  })

  describe('migrating to Cozy Desktop 3.15', () => {
    it('does not generate conflicts on existing documents with NFD encoded paths', async () => {
      const nfdName = 'Partages reçus'.normalize('NFD')

      await helpers.local.syncDir.ensureDir(nfdName)
      const stats = await helpers.local.syncDir.stat(nfdName)
      const remoteDir = await helpers.remote.createDirectory(nfdName)
      const doc = await builders
        .metadir()
        .fromRemote(remoteDir)
        .stats(stats)
        .upToDate()
        .create()
      await helpers.prep.putFolderAsync('local', doc)

      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual(bothSides([`${nfdName}/`]))
    })

    it('does not generate conflicts on new documents with NFD encoded paths', async () => {
      const nfdPath = 'Partages reçus'.normalize('NFD')

      await helpers.local.syncDir.ensureDir(nfdPath)

      await fullSyncStartingFrom('local')

      should(await helpers.trees()).deepEqual(bothSides([`${nfdPath}/`]))
    })
  })

  // FIXME: merging local dir move then remote dir addition to the same
  // destination doesn't trigger a conflict although it should.

  describe('remote', () => {
    beforeEach('set up conflict', async () => {
      await helpers.prep.putFolderAsync(
        'local',
        builders
          .metadir()
          .path('foo')
          .build()
      )
      await cozy.files.create('whatever', { name: 'foo' })
    })

    it('success', async () => {
      await helpers.remote.pullChanges()
      should(await helpers.remote.tree()).deepEqual([
        '.cozy_trash/',
        'foo-conflict-...'
      ])
    })

    describe('retry', () => {
      it('success', async () => {
        // Simulate stack failure
        sinon
          .stub(helpers.remote.side.remoteCozy, 'updateAttributesById')
          .throws(new FetchError())

        await helpers.remote.pullChanges()
        should(await helpers.remote.tree()).deepEqual(['.cozy_trash/', 'foo'])

        // Stack is back, retry...
        helpers.remote.side.remoteCozy.updateAttributesById.restore()

        await helpers.remote.pullChanges()
        should(await helpers.remote.tree()).deepEqual([
          '.cozy_trash/',
          'foo-conflict-...'
        ])
      })
    })
  })

  describe('local move of synced directory with new content to location with unmerged remote move of synced directory to same location', () => {
    beforeEach(async () => {
      // Create directories and sync it
      await helpers.local.syncDir.ensureDir('dir1')
      await helpers.local.syncDir.ensureDir('dir2')
      await helpers.local.syncDir.outputFile('dir2/file2', 'file2 content')
      await helpers.flushLocalAndSyncAll()

      // Add content
      await helpers.local.syncDir.outputFile('dir1/file1', 'file1 content')
      await helpers.local.scan()

      // Rename local directory
      await helpers.local.syncDir.move('dir1', 'dst')
      await helpers.local.scan()

      // Update dir metadata to push dir move after file addition in changesfeed
      await fse.utimes(
        helpers.local.syncDir.abspath('dst'),
        new Date(),
        new Date()
      )
      await helpers.local.scan()

      // Rename remote directory
      const { remote: remoteDir2 } = await helpers.pouch.bySyncedPath('dir2')
      await helpers.remote.move(remoteDir2, 'dst')
    })

    it('creates a conflict and keeps files in their own directories', async () => {
      await helpers.syncAll()

      await should(helpers.trees('local', 'remote')).be.fulfilledWith({
        local: [
          'dst-conflict-.../',
          'dst-conflict-.../file2',
          'dst/',
          'dst/file1'
        ],
        remote: [
          'dst-conflict-.../',
          'dst-conflict-.../file2',
          'dst/',
          'dst/file1'
        ]
      })
    })
  })

  describe.skip('local move of synced directory with new content to location with unmerged remote directory', () => {
    // FIXME: Requires the creation of a conflict when merging the creation of a
    // directory at the same path than an existing merged directory.
    // This, in turn, probably requires (or would be facilitated by) the
    // separation between creation and update of directories.
    beforeEach(async () => {
      // Create directory and sync it
      await helpers.local.syncDir.ensureDir('src')
      await helpers.flushLocalAndSyncAll()

      // Add content
      await helpers.local.syncDir.outputFile('src/file', 'local content')
      await helpers.local.scan()

      // Rename dir
      await helpers.local.syncDir.move('src', 'dst')
      await helpers.local.scan()

      // Update dir metadata
      await fse.utimes(
        helpers.local.syncDir.abspath('dst'),
        new Date(),
        new Date()
      )
      await helpers.local.scan()

      // Create remote directory with content
      const remoteDst = await cozy.files.createDirectory({ name: 'dst' })
      await cozy.files.create('remote content', {
        name: 'foo',
        dirID: remoteDst._id
      })
    })

    it('creates a conflict and uploads the local file to the conflict directory', async () => {
      await helpers.syncAll()

      await should(helpers.trees('local', 'remote')).be.fulfilledWith({
        local: ['dst-conflict-../', 'dst-conflict-.../file', 'dst/', 'dst/foo'],
        remote: ['dst-conflict-../', 'dst-conflict-.../file', 'dst/', 'dst/foo']
      })
    })
  })
})
