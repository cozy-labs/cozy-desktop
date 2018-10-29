/* @flow */

const {
  after,
  afterEach,
  before,
  beforeEach,
  suite,
  test
} = require('mocha')
const should = require('should')

const metadata = require('../../core/metadata')

const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const { IntegrationTestHelpers } = require('../support/helpers/integration')

const cozy = cozyHelpers.cozy

suite('Sync gets interrupted, initialScan occurs', () => {
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

  test('move Folder', async () => {
    const docs = await helpers.remote.createTree([
      '/a/',
      '/b/'
    ])

    console.log(docs)

    await helpers.remote.pullChanges()
    await helpers.syncAll()

    await cozy.files.updateAttributesById(docs['/b/']._id, {dir_id: docs['/a/']._id})

    await helpers.remote.pullChanges() // Merge

    // but not sync (client restart)

    await helpers.local.scan()
    await helpers.syncAll()

    await helpers.local.scan()
    await helpers.remote.pullChanges()
    await helpers.syncAll()

    await helpers.local.scan()
    await helpers.remote.pullChanges()
    await helpers.syncAll()

    await helpers.local.scan()
    await helpers.remote.pullChanges()
    await helpers.syncAll()

    console.log(await helpers.remote.tree())
    console.log(await helpers.local.tree())
  })
})
