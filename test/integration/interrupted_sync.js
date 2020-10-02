/* @flow */
/* eslint-env mocha */

const should = require('should')

const metadata = require('../../core/metadata')

const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const TestHelpers = require('../support/helpers')

const cozy = cozyHelpers.cozy

describe('Sync gets interrupted, initialScan occurs', () => {
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
    helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()

    await helpers.remote.pullChanges()
    await helpers.syncAll()

    helpers.spyPouch()
  })

  it('move Folder', async () => {
    const docs = await helpers.remote.createTree(['/a/', '/b/'])

    await helpers.remote.pullChanges()
    await helpers.syncAll()

    await cozy.files.updateAttributesById(docs['/b/']._id, {
      dir_id: docs['/a/']._id
    })

    await helpers.remote.pullChanges() // Merge

    // but not sync (client restart)

    await helpers.local.scan()
    await helpers.syncAll()

    const expected = ['a/', 'a/b/']

    should(await helpers.trees()).deepEqual({
      remote: expected,
      local: expected
    })

    await helpers.local.scan()
    await helpers.remote.pullChanges()
    await helpers.syncAll()

    should(await helpers.trees()).deepEqual({
      remote: expected,
      local: expected
    })
  })

  describe('remote file update', () => {
    it('does not override the remote file with the local version', async function() {
      const path = 'file'
      const _id = metadata.id(path)

      await helpers.local.syncDir.outputFile(path, 'original content')
      await helpers.flushLocalAndSyncAll()

      const doc = await this.pouch.byIdMaybe(_id)
      await cozy.files.updateById(doc.remote._id, 'remote content', {
        contentType: 'text/plain'
      })
      await helpers.remote.pullChanges() // Merge

      // but not sync (client restart)

      await helpers.flushLocalAndSyncAll()
      await helpers.pullAndSyncAll()

      // Contents are kept untouched
      const resp = await helpers.remote.cozy.files.downloadById(doc.remote._id)
      should(await resp.text()).eql('remote content')
      should(await helpers.local.readFile('file')).eql('remote content')
    })
  })
})
