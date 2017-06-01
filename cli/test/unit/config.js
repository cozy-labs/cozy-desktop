/* eslint-env mocha */

import path from 'path'
import should from 'should'

import configHelpers from '../helpers/config'

import Config from '../../src/config'

describe('Config', function () {
  before('instanciate config', configHelpers.createConfig)
  after('clean config directory', configHelpers.cleanConfig)

  describe('persist', function () {
    it('saves last changes made on the config', function () {
      const url = 'http://cozy.local:8080/'
      this.config.cozyUrl = url
      this.config.persist()
      let conf = new Config(path.dirname(this.config.configPath))
      should(conf.cozyUrl).equal(url)
    })
  })

  describe('SyncPath', function () {
    it('returns the set sync path', function () {
      this.config.syncPath = '/path/to/sync/dir'
      should(this.config.syncPath).equal('/path/to/sync/dir')
    })
  })

  describe('CozyUrl', function () {
    it('returns the set Cozy URL', function () {
      this.config.cozyUrl = 'https://cozy.example.com'
      should(this.config.cozyUrl).equal('https://cozy.example.com')
    })
  })

  describe('Client', function () {
    it('can set a client', function () {
      this.config.client = { clientName: 'test' }
      should(this.config.isValid()).be.true()
      should(this.config.client.clientName).equal('test')
    })

    it('has no client after a reset', function () {
      this.config.reset()
      should(this.config.isValid()).be.false()
    })
  })

  describe('saveMode', function () {
    it('sets the pull or push mode', function () {
      this.config.saveMode('push')
      should(this.config.config.mode).equal('push')
    })

    it('throws an error for incompatible mode', function () {
      this.config.saveMode('push')
      should.throws(() => this.config.saveMode('pull'), /you cannot switch/)
      should.throws(() => this.config.saveMode('full'), /you cannot switch/)
    })
  })
})
