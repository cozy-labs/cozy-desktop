/* @flow */
/* eslint-env mocha */

const should = require('should')

const timestamp = require('../../core/utils/timestamp')

const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const TestHelpers = require('../support/helpers')

const cozy = cozyHelpers.cozy

describe('Update only a file mtime', () => {
  let helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(function() {
    helpers = TestHelpers.init(this)
    helpers.local.setupTrash()
  })

  context('when update is made on local filesystem', () => {
    let oldUpdatedAt, created
    beforeEach('create file and update mtime', async function() {
      await helpers.remote.ignorePreviousChanges()

      oldUpdatedAt = new Date()
      oldUpdatedAt.setDate(oldUpdatedAt.getDate() - 1)

      created = await cozy.files.create('basecontent', {
        name: 'file',
        updatedAt: oldUpdatedAt.toISOString()
      })
      await helpers.pullAndSyncAll()
      await helpers.flushLocalAndSyncAll()
    })

    it('only updates the local document state in Pouch', async () => {
      helpers.spyPouch()

      const newUpdatedAt = new Date()
      newUpdatedAt.setDate(oldUpdatedAt.getDate() + 1)
      helpers.local.syncDir.utimes('file', newUpdatedAt)

      await helpers.flushLocalAndSyncAll()

      should(
        helpers.putDocs('path', 'updated_at', 'local.updated_at')
      ).deepEqual([
        {
          path: 'file',
          updated_at: timestamp.roundedRemoteDate(
            created.attributes.updated_at
          ),
          local: {
            updated_at: timestamp.fromDate(newUpdatedAt).toISOString()
          }
        }
      ])
    })
  })

  context('when update is made on remote Cozy', () => {
    let file, oldUpdatedAt
    beforeEach('create file and update mtime', async function() {
      await helpers.remote.ignorePreviousChanges()

      oldUpdatedAt = new Date()
      oldUpdatedAt.setDate(oldUpdatedAt.getDate() - 1)

      file = await cozy.files.create('basecontent', {
        name: 'file',
        updatedAt: oldUpdatedAt.toISOString()
      })
      await helpers.remote.pullChanges()
      await helpers.syncAll()
    })

    it('updates the document in Pouch with the new remote rev and mtime', async () => {
      helpers.spyPouch()

      // update only the file mtime
      await cozy.files.updateById(file._id, 'changedcontent', {
        contentType: 'text/plain'
      })
      const newFile = await cozy.files.updateById(file._id, 'basecontent', {
        contentType: 'text/plain'
      })

      await helpers.remote.pullChanges()
      should(helpers.putDocs('path', 'updated_at')).deepEqual([
        {
          path: file.attributes.name,
          updated_at: timestamp.roundedRemoteDate(newFile.attributes.updated_at)
        }
      ])
    })
  })
})
