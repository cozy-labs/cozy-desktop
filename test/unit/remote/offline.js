/* @flow */
/* eslint-env mocha */

const EventEmitter = require('events')

const { FetchError } = require('electron-fetch')
const should = require('should')
const sinon = require('sinon')

const Prep = require('../../../core/prep')
const { Remote } = require('../../../core/remote')
const remoteErrors = require('../../../core/remote/errors')
const Builders = require('../../support/builders')
const configHelpers = require('../../support/helpers/config')
const cozyHelpers = require('../../support/helpers/cozy')
const pouchHelpers = require('../../support/helpers/pouch')
const { RemoteTestHelpers } = require('../../support/helpers/remote')

/*::
import type { Metadata } from '../../../core/metadata'
import type { RemoteDoc } from '../../../core/remote/document'
*/

describe('Remote', function() {
  let remoteHelpers

  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  before('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('prepare helpers', function() {
    remoteHelpers = new RemoteTestHelpers(this)
  })
  before('instanciate remote', function() {
    this.prep = sinon.createStubInstance(Prep)
    this.prep.config = this.config
    this.events = new EventEmitter()
    this.remote = new Remote(this)
    // Use real OAuth client
    this.remote.remoteCozy.client = cozyHelpers.cozy
  })
  beforeEach('create the couchdb folder', async function() {
    const builders = new Builders({
      client: await remoteHelpers.getClient()
    })

    await builders
      .remoteDir()
      .name('couchdb-folder')
      .inRootDir()
      .create()
  })
  afterEach(() => remoteHelpers.clean())
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('offline management', () => {
    it('The remote can be started when offline ', async function() {
      const fetchStub = sinon
        .stub(global, 'fetch')
        .rejects(new FetchError('net::ERR_INTERNET_DISCONNECTED'))
      sinon.spy(this.events, 'emit')

      await this.remote.start()

      try {
        should(this.events.emit).have.been.calledWithMatch(
          'RemoteWatcher:error',
          {
            code: remoteErrors.UNREACHABLE_COZY_CODE
          }
        )

        fetchStub.restore()
        this.events.emit.resetHistory()

        await this.remote.watcher.watch()
        should(this.events.emit).not.have.been.calledWith('RemoteWatcher:error')

        this.events.emit.restore()
      } finally {
        await this.remote.stop()
      }
    }).timeout(120000)
  })
})
