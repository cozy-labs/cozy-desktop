/* eslint-env mocha */

const path = require('path')
const should = require('should')
const fs = require('fs-extra')

const configHelpers = require('../support/helpers/config')

const Config = require('../../core/config')

describe('Config', function () {
  before('instanciate config', configHelpers.createConfig)
  after('clean config directory', configHelpers.cleanConfig)

  describe('constructor', function () {
    it('resets corrupted config', function () {
      const corruptedContent = '\0'
      fs.writeFileSync(this.config.configPath, corruptedContent)

      let conf
      (() => {
        conf = new Config(path.dirname(this.config.configPath))
      }).should.not.throw()
      conf.should.be.an.Object()
    })
  })

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

  describe('gui', () => {
    it('returns an empty hash by default', function () {
      should(this.config.gui).deepEqual({})
    })

    it('returns GUI configuration if any', function () {
      const guiConfig = {foo: 'bar'}
      this.config.config.gui = guiConfig
      should(this.config.gui).deepEqual(guiConfig)
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
