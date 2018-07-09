/* @flow */
/* eslint-env mocha */

const _ = require('lodash')
const should = require('should')

const logger = require('../../core/logger')

const { IntegrationTestHelpers } = require('../support/helpers/integration')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')

const log = logger({component: 'mocha'})

describe('Update file', () => {
  let cozy, helpers, pouch, prep

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function () {
    cozy = cozyHelpers.cozy
    helpers = new IntegrationTestHelpers(this.config, this.pouch, cozy)
    pouch = helpers._pouch
    prep = helpers.prep

    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  describe('inode-only change', () => {
    // FIXME
    it.skip('should not write anything on the cozy', async () => {
      // TODO: Builder
      const file = await cozy.files.create('Initial content', {name: 'file'})
      await helpers.remote.pullChanges()
      await helpers.syncAll()
      const was = await pouch.byRemoteIdMaybeAsync(file._id)

      await prep.updateFileAsync('local', _.defaults(
        {ino: was.ino + 1},
        was
      ))
      await helpers.syncAll()
      const doc = await pouch.byRemoteIdMaybeAsync(file._id)
      should(doc).have.propertyByPath('remote', '_rev').eql(was.remote._rev)
    })
  })

  describe('older timestamp change', () => {
    it('should keep the most recent timestamp to prevent 422 errors', async () => {
      // TODO: Builder
      const file = await cozy.files.create('Initial content', {
        name: 'file',
        lastModifiedDate: new Date('2018-05-15T21:01:53.000Z')
      })
      await helpers.remote.pullChanges()
      await helpers.syncAll()
      const was = await pouch.byRemoteIdMaybeAsync(file._id)
      should(was).have.property('updated_at', '2018-05-15T21:01:53Z')

      await prep.updateFileAsync('local', _.defaults(
        {
          updated_at: '2017-05-15T21:01:53.000Z',
          tags: ['some new tag']
        },
        was
      ))
      helpers._sync.stopped = false
      await helpers.syncAll()
      const doc = await pouch.byRemoteIdMaybeAsync(file._id)
      should(doc.errors).be.undefined()
    })
  })

  describe('M1, local merge M1, M2, remote sync M1, local merge M2', () => {
    it('fails remote sync M1 & local merge M2', async () => {
      const file = await cozy.files.create('Initial content', {name: 'file'})
      await helpers.remote.pullChanges()
      await helpers.syncAll()

      log.info('-------- M1 --------')
      const m1 = 'M1'
      await helpers.local.syncDir.outputFile('file', m1)

      log.info('-------- local merge M1 --------')
      should(await helpers.local.syncDir.checksum('file')).equal('8x4e7yD2RzOhjFOAc+eDlg==')
      await prep.updateFileAsync('local', _.defaults(
        {
          md5sum: await helpers.local.syncDir.checksum('file'),
          size: 2
        },
        await pouch.byRemoteIdMaybeAsync(file._id)
      ))

      log.info('-------- M2 --------')
      const m2 = 'M2'
      await helpers.local.syncDir.outputFile('file', m2)

      log.info('-------- remote sync M1 --------')
      await helpers.syncAll()

      log.info('-------- local merge M2 --------')
      should(await helpers.local.syncDir.checksum('file')).equal('nYMiUwtn4jZuWxumcIHe2Q==')
      await prep.updateFileAsync('local', _.defaults(
        {
          md5sum: await helpers.local.syncDir.checksum('file'),
          size: 2
        },
        await pouch.byRemoteIdMaybeAsync(file._id)
      ))

      log.info('-------- remote sync M2 --------')
      await helpers.syncAll()

      should({
        localTree: await helpers.local.tree(),
        remoteTree: await helpers.remote.tree(),
        remoteFileContent: await helpers.remote.readFile('file')
      }).deepEqual({
        localTree: [
          'file'
        ],
        remoteTree: [
          '.cozy_trash/',
          'file'
        ],
        remoteFileContent: m2
      })
    })
  })
})
