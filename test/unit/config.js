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
      this.config.setCozyUrl('http://cozy.local:8080/')
      this.config.persist()
      let conf = new Config(path.join(this.syncPath, '.cozy-desktop'))
      conf.getCozyUrl().should.equal('http://cozy.local:8080/')
    })
  })

  describe('SyncPath', function () {
    it('returns the set sync path', function () {
      this.config.setSyncPath('/path/to/sync/dir')
      this.config.getSyncPath().should.equal('/path/to/sync/dir')
    })
  })

  describe('CozyUrl', function () {
    it('returns the set Cozy URL', function () {
      this.config.setCozyUrl('https://cozy.example.com')
      this.config.getCozyUrl().should.equal('https://cozy.example.com')
    })
  })

  describe('Client', function () {
    it('can set a client', function () {
      this.config.saveClient({ clientName: 'test' })
      this.config.hasClient().should.be.true()
      this.config.getClient().clientName.should.equal('test')
    })

    it('has no client after a reset', function () {
      this.config.reset()
      this.config.hasClient().should.be.false()
    })
  })

  describe('saveMode', function () {
    it('sets the pull or push mode', function () {
      this.config.saveMode('push')
      this.config.config.mode.should.equal('push')
    })

    it('throws an error for incompatible mode', function () {
      this.config.saveMode('push')
      should.throws(() => this.config.saveMode('pull'), /Incompatible mode/)
      should.throws(() => this.config.saveMode('full'), /Incompatible mode/)
    })
  })
})
