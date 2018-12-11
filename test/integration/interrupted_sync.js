/* @flow */
/* eslint-env mocha */

const should = require('should')

const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const { IntegrationTestHelpers } = require('../support/helpers/integration')

const cozy = cozyHelpers.cozy

describe('Sync gets interrupted, initialScan occurs', () => {
  let helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function () {
    helpers = new IntegrationTestHelpers(this.config, this.pouch, cozy)
    helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()

    await helpers.remote.pullChanges()
    await helpers.syncAll()

    helpers.spyPouch()
  })

  it('move Folder', async () => {
    const docs = await helpers.remote.createTree([
      '/a/',
      '/b/'
    ])

    await helpers.remote.pullChanges()
    await helpers.syncAll()

    await cozy.files.updateAttributesById(docs['/b/']._id, {dir_id: docs['/a/']._id})

    await helpers.remote.pullChanges() // Merge

    // but not sync (client restart)

    await helpers.local.scan()
    await helpers.syncAll()

    const expected = [ 'a/', 'a/b/' ]

    should(await helpers.trees()).deepEqual({
      remote: expected,
      local: expected
    })

    await helpers.local.scan()
    await helpers.remote.pullChanges()
    await helpers.syncAll()

    should(await helpers.trees()).deepEqual({
      remote: expected,
      local: expected
    })
  })
})
