/* @flow */
/* eslint-env mocha */

const should = require('should')

const { ROOT_DIR_ID } = require('../../core/remote/constants')
const timestamp = require('../../core/utils/timestamp')

const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const TestHelpers = require('../support/helpers')
const platform = require('../support/helpers/platform')

const cozy = cozyHelpers.cozy

describe('Update only mtime', () => {
  let helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  beforeEach(function() {
    helpers = TestHelpers.init(this)
    helpers.local.setupTrash()
  })

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  describe('of a file', () => {
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
              updated_at: platform.localUpdatedAt(newUpdatedAt)
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
            updated_at: timestamp.roundedRemoteDate(
              newFile.attributes.updated_at
            )
          }
        ])
      })
    })
  })

  describe('of a folder', () => {
    context('when update is made on local filesystem', () => {
      let oldUpdatedAt
      beforeEach('create folder and update mtime', async function() {
        await helpers.remote.ignorePreviousChanges()

        oldUpdatedAt = new Date()
        oldUpdatedAt.setDate(oldUpdatedAt.getDate() - 1)

        await cozy.files.createDirectory({
          name: 'folder',
          dirID: ROOT_DIR_ID,
          createdAt: oldUpdatedAt.toISOString(),
          updatedAt: oldUpdatedAt.toISOString()
        })
        await helpers.pullAndSyncAll()
        await helpers.flushLocalAndSyncAll()
      })

      it('does nothing', async () => {
        helpers.spyPouch()

        const newUpdatedAt = new Date()
        newUpdatedAt.setDate(oldUpdatedAt.getDate() + 1)
        helpers.local.syncDir.utimes('folder', newUpdatedAt)

        await helpers.flushLocalAndSyncAll()

        should(
          helpers.putDocs('path', 'updated_at', 'local.updated_at')
        ).deepEqual([])
      })
    })

    context('when update is made on remote Cozy', () => {
      let oldUpdatedAt, dir
      beforeEach('create folder and update mtime', async function() {
        await helpers.remote.ignorePreviousChanges()

        oldUpdatedAt = new Date()
        oldUpdatedAt.setDate(oldUpdatedAt.getDate() - 1)

        dir = await cozy.files.createDirectory({
          name: 'folder',
          dirID: ROOT_DIR_ID,
          createdAt: oldUpdatedAt.toISOString(),
          updatedAt: oldUpdatedAt.toISOString()
        })
        await helpers.pullAndSyncAll()
        await helpers.flushLocalAndSyncAll()
      })

      it('updates the document in Pouch with the new remote rev and mtime', async () => {
        helpers.spyPouch()

        const newUpdatedAt = new Date()
        newUpdatedAt.setDate(oldUpdatedAt.getDate() + 1)
        await cozy.files.updateAttributesById(dir._id, {
          updated_at: newUpdatedAt
        })

        await helpers.remote.pullChanges()

        should(helpers.putDocs('path', 'updated_at')).deepEqual([
          {
            path: dir.attributes.name,
            updated_at: newUpdatedAt.toISOString()
          }
        ])
      })
    })
  })
})
