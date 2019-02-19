/* eslint-env mocha */

const sinon = require('sinon')
const should = require('should')

const Builders = require('../support/builders')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const TestHelpers = require('../support/helpers')

// XXX: duplicated from remote/watcher
const HEARTBEAT /*: number */ = parseInt(process.env.COZY_DESKTOP_HEARTBEAT) || 1000 * 60

const builders = new Builders()

describe('Sync', function () {
  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  before('instanciate pouch', pouchHelpers.createDatabase)
  before('delete all', cozyHelpers.deleteAll)
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)
  after('clean  local', () => helpers.local.clean())

  let helpers

  before('instanciate local, remote & sync', async function () {
    this.sandbox = sinon.sandbox.create()
    helpers = TestHelpers.init(this)
    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()

    // remote watcher gets nothings
    this.sandbox.stub(helpers._remote.watcher, 'pullMany').callsFake(() => {
      return Promise.delay(0.1 * HEARTBEAT)
    })
  })

  after('sandbox restore', function () {
    this.sandbox.restore()
  })

  it('does not allow remote watcher to buffer more than one change', async function () {
    this.timeout(120000)

    // syncBatch takes too long
    this.sandbox.stub(helpers._sync, 'syncBatch')
                .callsFake(() => {
                  return Promise.delay(5 * HEARTBEAT)
                })

    helpers._sync.start()

    await Promise.delay(1.5 * HEARTBEAT)
    await helpers.prep.putFolderAsync('local', builders.metadir().path('foo').build())
    await cozyHelpers.cozy.files.create('some file content', {name: 'file'})
    await Promise.delay(1.5 * HEARTBEAT)
    await helpers.prep.putFolderAsync('local', builders.metadir().path('foo2').build())
    await cozyHelpers.cozy.files.create('some file content', {name: 'file2'})
    await Promise.delay(1.5 * HEARTBEAT)
    await helpers.prep.putFolderAsync('local', builders.metadir().path('foo3').build())
    await cozyHelpers.cozy.files.create('some file content', {name: 'file3'})
    await Promise.delay(1.5 * HEARTBEAT)
    await helpers._sync.stop()

    should(helpers._remote.watcher.pullMany.calledOnce).be.true()

    // this.clock.runAll()
  })
})
