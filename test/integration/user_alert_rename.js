/* @flow */
/* eslint-env mocha */

const should = require('should')
const sinon = require('sinon')

const syncErrors = require('../../core/sync/errors')
const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const pouchHelpers = require('../support/helpers/pouch')

// Regression test: while a doc is blocked with a user alert, renaming it
// remotely must update the existing alert instead of stacking a new one, and
// resolving the block must remove the alert even though the path changed.
describe('User alert on renamed blocked doc', () => {
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

  it('removes the alert when the remote doc is renamed to a compatible name', async function() {
    // A file synced on both sides
    await helpers.remote.createFile('a.docx', 'original content')
    await helpers.pullAndSyncAll()
    const pouchDoc = await helpers.pouch.bySyncedPath('a.docx')
    const remoteId = pouchDoc.remote._id
    const pouchId = pouchDoc._id

    // Any local move of this file fails and blocks the sync, whatever the name
    const stub = sinon.stub(helpers.local.side, 'moveAsync')
    stub.callsFake(async doc => {
      throw new syncErrors.SyncError({
        code: syncErrors.INCOMPATIBLE_DOC_CODE,
        sideName: 'local',
        err: new Error(`incompatible name: ${doc.path}`),
        doc
      })
    })

    const alertPaths = []
    helpers.events.on('user-alert', err => {
      if (err.doc) alertPaths.push(err.doc.path)
    })

    // First remote rename: blocked, an alert is displayed for b.docx
    await helpers.remote.updateAttributesById(remoteId, { name: 'b.docx' })
    await helpers.remote.pullChanges()
    await helpers.sync()
    clearInterval(helpers._sync.retryInterval)

    should(alertPaths).deepEqual(['b.docx'])

    // Second remote rename while still blocked: the alert follows the new
    // name instead of stacking a second alert for the same doc
    await helpers.remote.updateAttributesById(remoteId, { name: 'c.docx' })
    await helpers.remote.pullChanges()
    await helpers.sync()
    clearInterval(helpers._sync.retryInterval)

    should(alertPaths).deepEqual(['b.docx', 'c.docx'])
    const docAlerts = helpers.events.state.userAlerts.filter(
      a => a.doc && a.doc.id === pouchId
    )
    should(docAlerts.length).equal(1)
    should(docAlerts[0].doc && docAlerts[0].doc.path).equal('c.docx')

    // The user fixes the name: the sync resumes and the alert is gone
    stub.restore()
    await helpers.syncAll()

    should(helpers.events.state.userAlerts).be.empty()
    should(helpers._sync._blockedCauses.size).equal(0)
    const localTree = await helpers.local.treeWithoutTrash()
    should(localTree).containDeep(['c.docx'])
  })
})
