/* @flow */
/* eslint-env mocha */

const should = require('should')

const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')

const cozy = cozyHelpers.cozy

describe('Permanent deletion remote', () => {
  let helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function() {
    helpers = TestHelpers.init(this)
    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })
  afterEach(async function() {
    await helpers.stop()
  })

  it('file', async () => {
    const file = await cozy.files.create('File content', { name: 'file' })
    await helpers.remote.pullChanges()
    await helpers.syncAll()
    helpers.spyPouch()

    await cozy.files.trashById(file._id)
    await cozy.files.destroyById(file._id)
    await helpers.remote.pullChanges()

    should(helpers.putDocs('path', 'deleted', 'trashed')).deepEqual([
      { path: 'file', trashed: true }
    ])

    await helpers.syncAll()

    should(await helpers.local.tree()).deepEqual(['/Trash/file'])
  })
})
