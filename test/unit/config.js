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
      this.config.setCozyUrl(url)
      this.config.persist()
      let conf = new Config(path.join(this.syncPath, '.cozy-desktop'))
      should(conf.getCozyUrl()).equal(url)
    })
  })

  describe('SyncPath', function () {
    it('returns the set sync path', function () {
      this.config.setSyncPath('/path/to/sync/dir')
      should(this.config.getSyncPath()).equal('/path/to/sync/dir')
    })
  })

  describe('CozyUrl', function () {
    it('returns the set Cozy URL', function () {
      this.config.setCozyUrl('https://cozy.example.com')
      should(this.config.getCozyUrl()).equal('https://cozy.example.com')
    })
  })

  describe('Client', function () {
    it('can set a client', function () {
      this.config.setClient({ clientName: 'test' })
      should(this.config.hasClient()).be.true()
      should(this.config.getClient().clientName).equal('test')
    })

    it('has no client after a reset', function () {
      this.config.reset()
      should(this.config.hasClient()).be.false()
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
