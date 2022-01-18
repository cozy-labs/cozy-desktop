/* @flow */
/* eslint-env mocha */

const should = require('should')
const sinon = require('sinon')

const Builders = require('../support/builders')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const TestHelpers = require('../support/helpers')

const builders = new Builders()

describe('Sync state', () => {
  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  // afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  let events, helpers

  beforeEach(async function () {
    helpers = TestHelpers.init(this)
    events = helpers.events
    sinon.spy(events, 'emit')

    await helpers.remote.ignorePreviousChanges()
  })

  it('1 sync error (missing remote file)', async () => {
    const remoteFile = builders.remoteFile().build()
    await helpers._remote.watcher.pullMany([remoteFile])
    await helpers.syncAll()
    should(events.emit.args).containDeepOrdered([
      ['sync-start'],
      // XXX: update seq includes design docs creation so it does not start at 1
      ['sync-current', 5], // Attempt and fail to download file
      ['sync-current', 6], // Retry 1
      ['sync-current', 7], // Retry 2
      ['sync-current', 8], // Retry 3
      ['delete-file'], // Abandon change and delete PouchDB record
      ['sync-end']
    ])
  })
})
