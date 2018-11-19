/* @flow */

const {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it
} = require('mocha')
const should = require('should')
const sinon = require('sinon')

const fs = require('fs-extra')
const _ = require('lodash')
const Builders = require('../support/builders')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const { IntegrationTestHelpers } = require('../support/helpers/integration')

describe('Conflict resolution', () => {
  let builders, cozy, helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function () {
    builders = new Builders(cozyHelpers.cozy, this.pouch)
    cozy = cozyHelpers.cozy
    helpers = new IntegrationTestHelpers(this.config, this.pouch, cozy)

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
      await helpers.prep.putFolderAsync('local', builders.metadata.dir().path('foo').build())
      should(await helpers.local.tree()).deepEqual([
        'foo-conflict-.../'
      ])
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
      pouchFile = await helpers._pouch.byRemoteIdMaybeAsync(remoteFile._id)
      await cozy.files.updateById(remoteFile._id, `content3`, {contentType: 'text/plain'})
    })

    const simulateLocalUpdateMerge = async () => {
      await helpers.prep.updateFileAsync('local', _.merge(pouchFile, {
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

      const conflictedPath = (await fs.readdir(helpers.local.syncPath))
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

      const conflictedPath = (await fs.readdir(helpers.local.syncPath))
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

  describe('remote', () => {
    beforeEach('set up conflict', async () => {
      await helpers.prep.putFolderAsync('local', builders.metadata.dir().path('foo').build())
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
