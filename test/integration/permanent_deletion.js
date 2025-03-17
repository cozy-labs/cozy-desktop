/* @flow */
/* eslint-env mocha */

const should = require('should')

const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')

describe('Permanent deletion remote', () => {
  let helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)

  afterEach(() => helpers.clean())
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
    const file = await helpers.remote.createFile('file', 'File content')
    await helpers.remote.pullChanges()
    await helpers.syncAll()
    helpers.spyPouch()

    await helpers.remote.trashById(file._id)
    await helpers.remote.destroyById(file._id)
    await helpers.remote.pullChanges()

    should(helpers.putDocs('path', 'deleted', 'trashed')).deepEqual([
      { path: 'file', trashed: true }
    ])

    await helpers.syncAll()

    should(await helpers.local.tree()).deepEqual(['/Trash/file'])
  })
})
