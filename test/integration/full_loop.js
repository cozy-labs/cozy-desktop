/* @flow */
/* eslint-env mocha */

const should = require('should')

const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')

describe('Full watch/merge/sync/repeat loop', () => {
  let helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)

  afterEach(() => helpers.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function() {
    helpers = TestHelpers.init(this)
    helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()

    await helpers.remote.pullChanges()
    await helpers.syncAll()

    helpers.spyPouch()
  })
  afterEach(async function() {
    await helpers.stop()
  })

  it('remote -> local add file', async () => {
    await helpers._local.watcher.start()

    await helpers.remote.createFile('file', 'some file content')
    await helpers.remote.pullChanges()
    await helpers.syncAll()

    should(await helpers.local.tree()).deepEqual(['file'])

    const doc = await helpers.pouch.bySyncedPath('file')
    should(doc.ino).be.a.Number()
    should(doc.sides).deepEqual({ target: 2, local: 2, remote: 2 })
    await helpers._local.watcher.stop()
  })
})
