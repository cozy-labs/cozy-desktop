/* @flow */
/* eslint-env mocha */

const EventEmitter = require('events')
const sinon = require('sinon')

const Prep = require('../../../core/prep')
const { Remote } = require('../../../core/remote')

const configHelpers = require('../../support/helpers/config')
const pouchHelpers = require('../../support/helpers/pouch')
const {
  deleteAll, createTheCouchdbFolder
} = require('../../support/helpers/cozy')

/*::
import type { Metadata } from '../../../core/metadata'
import type { RemoteDoc, JsonApiDoc } from '../../../core/remote/document'
*/

describe('Remote', function () {
  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  before('instanciate pouch', pouchHelpers.createDatabase)
  before('instanciate remote', function () {
    this.prep = sinon.createStubInstance(Prep)
    this.events = new EventEmitter()
    this.remote = new Remote(this)
  })
  beforeEach(deleteAll)
  beforeEach(createTheCouchdbFolder)
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('offline management', () => {
    it('The remote can be started when offline ', async function () {
      let fetchStub = sinon.stub(global, 'fetch').rejects(new Error('net::ERR_INTERNET_DISCONNECTED'))
      let eventsSpy = sinon.spy(this.events, 'emit')
      await this.remote.start().started
      eventsSpy.should.have.been.calledWith('offline')
      fetchStub.restore()
      // skip waiting for HEARTBEAT
      await this.remote.watcher.watch()
      eventsSpy.should.have.been.calledWith('online')
      eventsSpy.restore()
    }).timeout(120000)
  })
})
