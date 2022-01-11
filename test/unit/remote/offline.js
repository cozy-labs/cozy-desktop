/* @flow */
/* eslint-env mocha */

const EventEmitter = require('events')
const sinon = require('sinon')
const should = require('should')
const { FetchError } = require('electron-fetch')

const Prep = require('../../../core/prep')
const { Remote } = require('../../../core/remote')
const remoteErrors = require('../../../core/remote/errors')

const configHelpers = require('../../support/helpers/config')
const pouchHelpers = require('../../support/helpers/pouch')
const cozyHelpers = require('../../support/helpers/cozy')
const Builders = require('../../support/builders')

const builders = new Builders({ cozy: cozyHelpers.cozy })
/*::
import type { Metadata } from '../../../core/metadata'
import type { RemoteDoc } from '../../../core/remote/document'
*/

describe('Remote', function () {
  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  before('instanciate pouch', pouchHelpers.createDatabase)
  before('instanciate remote', function () {
    this.prep = sinon.createStubInstance(Prep)
    this.prep.config = this.config
    this.events = new EventEmitter()
    this.remote = new Remote(this)
    // Use real OAuth client
    this.remote.remoteCozy.client = cozyHelpers.cozy
  })
  beforeEach(cozyHelpers.deleteAll)
  beforeEach('create the couchdb folder', async function () {
    await builders.remoteDir().name('couchdb-folder').inRootDir().create()
  })
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('offline management', () => {
    it('The remote can be started when offline ', async function () {
      sinon
        .stub(global, 'fetch')
        .rejects(new FetchError('net::ERR_INTERNET_DISCONNECTED'))
      sinon.spy(this.events, 'emit')

      await this.remote.start()
      should(this.events.emit).have.been.calledWithMatch(
        'RemoteWatcher:error',
        { code: remoteErrors.UNREACHABLE_COZY_CODE }
      )

      fetch.restore()
      this.events.emit.resetHistory()

      await this.remote.watcher.watch()
      should(this.events.emit).not.have.been.calledWith('RemoteWatcher:error')

      this.events.emit.restore()
    }).timeout(120000)
  })
})
