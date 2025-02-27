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
    // XXX: Get current PouchDB sequence (it's not 0 since we have design docs)
    const seq = await new Promise((resolve, reject) => {
      helpers.pouch.db
        .changes({
          limit: 1,
          descending: true,
          since: 0,
          return_docs: false,
          live: false
        })
        .on('change', ({ seq }) => resolve(seq))
        .on('error', err => reject(err))
    })

    const remoteFile = builders.remoteFile().build()
    await helpers._remote.watcher.processRemoteChanges([remoteFile], {
      isInitialFetch: true // XXX: avoid unnecessary remote requests
    })
    await helpers.syncAll()

    should(events.emit.args).containDeepOrdered([
      ['sync-start'],
      ['sync-current', seq + 1], // Attempt and fail to download file
      ['sync-current', seq + 2], // Retry 1
      ['sync-current', seq + 3], // Retry 2
      ['sync-current', seq + 4], // Retry 3
      ['delete-file'], // Abandon change and delete PouchDB record
      ['sync-end']
    ])
  })
})
