/* @flow */
/* eslint-env mocha */

const should = require('should')
const sinon = require('sinon')

const Builders = require('../support/builders')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const { IntegrationTestHelpers } = require('../support/helpers/integration')

describe('Sync state', () => {
  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  // afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  let builders, events, helpers

  beforeEach(function () {
    helpers = new IntegrationTestHelpers(this.config, this.pouch, cozyHelpers.cozy)
    builders = new Builders({cozy: cozyHelpers.cozy, pouch: this.pouch})
    events = helpers.events
    sinon.spy(events, 'emit')
    // await helpers.local.setupTrash()
    // await helpers.remote.ignorePreviousChanges()
  })

  it('1 sync error (missing remote file)', async () => {
    await helpers._remote.watcher.pullMany([
      builders.remote.file().build()
    ])
    await helpers.syncAll()
    should(events.emit.args).deepEqual([
      ['sync-start'],
      ['syncing'],
      // FIXME: 3 attempts to download a missing file
      // FIXME: in debug.log with DEBUG=1: Sync: Seq was already synced! (seq=0)
      ['sync-current', 4],
      ['sync-current', 5],
      ['sync-current', 6],
      ['sync-end'],
      ['up-to-date']
    ])
  })
})
