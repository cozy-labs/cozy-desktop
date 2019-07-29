/* @flow */
/* eslint-env mocha */

const should = require('should')

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
    let file, oldUpdatedAt
    beforeEach('create file and update mtime', async function() {
      await helpers.remote.ignorePreviousChanges()

      oldUpdatedAt = new Date()
      oldUpdatedAt.setDate(oldUpdatedAt.getDate() - 1)

      file = await cozy.files.create('basecontent', {
        name: 'file',
        lastModifiedDate: oldUpdatedAt
      })
      await helpers.remote.pullChanges()
      await helpers.syncAll()
    })

    it('does not update the document in Pouch', async () => {
      helpers.spyPouch()

      const newUpdatedAt = new Date()
      newUpdatedAt.setDate(oldUpdatedAt.getDate() + 1)

      const oldFile = await helpers.pouch.byRemoteIdMaybeAsync(file._id)
      await helpers.prep.updateFileAsync('local', {
        ...oldFile,
        updated_at: newUpdatedAt.toISOString()
      })

      await helpers.syncAll()
      should(helpers.putDocs('path')).deepEqual([])
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
        lastModifiedDate: oldUpdatedAt
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
          updated_at: newFile.attributes.updated_at
        }
      ])
    })
  })
})
