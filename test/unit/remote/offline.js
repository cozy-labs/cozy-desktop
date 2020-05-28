/* @flow */
/* eslint-env mocha */

const EventEmitter = require('events')
const sinon = require('sinon')
const { FetchError } = require('electron-fetch')

const Prep = require('../../../core/prep')
const { Remote } = require('../../../core/remote')

const configHelpers = require('../../support/helpers/config')
const pouchHelpers = require('../../support/helpers/pouch')
const cozyHelpers = require('../../support/helpers/cozy')
const Builders = require('../../support/builders')

const builders = new Builders({ cozy: cozyHelpers.cozy })
/*::
import type { Metadata } from '../../../core/metadata'
import type { RemoteDoc, JsonApiDoc } from '../../../core/remote/document'
*/

describe('Remote', function() {
  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  before('instanciate pouch', pouchHelpers.createDatabase)
  before('instanciate remote', function() {
    this.prep = sinon.createStubInstance(Prep)
    this.prep.config = this.config
    this.events = new EventEmitter()
    this.remote = new Remote(this)
  })
  beforeEach(cozyHelpers.deleteAll)
  beforeEach('create the couchdb folder', async function() {
    await builders
      .remoteDir()
      .name('couchdb-folder')
      .inRootDir()
      .create()
  })
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('offline management', () => {
    it('The remote can be started when offline ', async function() {
      let fetchStub = sinon
        .stub(global, 'fetch')
        .rejects(new FetchError('net::ERR_INTERNET_DISCONNECTED'))
      let eventsSpy = sinon.spy(this.events, 'emit')
      await this.remote.start()
      eventsSpy.should.have.been.calledWith('offline')
      fetchStub.restore()
      // skip waiting for HEARTBEAT
      await this.remote.watcher.watch()
      eventsSpy.should.have.been.calledWith('online')
      eventsSpy.restore()
    }).timeout(120000)
  })
})
