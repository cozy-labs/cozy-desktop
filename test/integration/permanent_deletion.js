/* @flow */
/* eslint-env mocha */

const should = require('should')

const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const TestHelpers = require('../support/helpers')

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

  beforeEach(function () {
    helpers = TestHelpers.init(this)
    helpers.local.setupTrash()
  })

  it('file', async () => {
    await helpers.remote.ignorePreviousChanges()
    const file = await cozy.files.create('File content', {name: 'file'})
    await helpers.remote.pullChanges()
    await helpers.syncAll()
    helpers.spyPouch()

    await cozy.files.trashById(file._id)
    await cozy.files.destroyById(file._id)
    await helpers.remote.pullChanges()

    should(helpers.putDocs('path', '_deleted', 'trashed')).deepEqual([
      {path: 'file', _deleted: true}
    ])

    await helpers.syncAll()

    should(await helpers.local.tree()).deepEqual([
      '/Trash/file'
    ])
  })
})
