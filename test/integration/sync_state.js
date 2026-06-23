/* @flow */
/* eslint-env mocha */

const should = require('should')
const sinon = require('sinon')

const Builders = require('../support/builders')
const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')

const builders = new Builders()

describe('Sync state', () => {
  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)

  afterEach(() => helpers.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  let events, helpers

  beforeEach(async function() {
    helpers = TestHelpers.init(this)
    events = helpers.events
    sinon.spy(events, 'emit')

    await helpers.remote.ignorePreviousChanges()
  })
  afterEach(async function() {
    await helpers.stop()
  })

  it('1 sync error (missing remote file)', async () => {
    const remoteFile = builders.remoteFile().build()
    await helpers._remote.watcher.processRemoteChanges([remoteFile], {
      isInitialFetch: true // XXX: avoid unnecessary remote requests
    })
    await helpers.syncAll()

    should(events.emit.args).containDeepOrdered([
      ['sync-start'],
      ['delete-file'], // Abandon change and delete PouchDB record
      ['sync-end']
    ])

    should(
      events.emit.args.find(([name]) => name === 'sync-current')
    ).be.undefined()
  })
})
