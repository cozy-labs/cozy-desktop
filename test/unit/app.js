/* eslint-env mocha */

const fs = require('fs-extra')
const os = require('os')
const path = require('path')
const should = require('should')

const { App } = require('../../core/app')
const { LOG_FILENAME } = require('../../core/logger')
const { version } = require('../../package.json')

const configHelpers = require('../support/helpers/config')

describe('App', function () {
  describe('parseCozyUrl', function () {
    it('parses https://example.com/', function () {
      let parsed = App.prototype.parseCozyUrl('https://example.com')
      parsed.protocol.should.equal('https:')
      parsed.host.should.equal('example.com')
    })

    it('parses example.org as https://example.org', function () {
      let parsed = App.prototype.parseCozyUrl('example.org')
      parsed.protocol.should.equal('https:')
      parsed.host.should.equal('example.org')
    })

    it('parses zoe as https://zoe.cozycloud.cc', function () {
      let parsed = App.prototype.parseCozyUrl('zoe')
      parsed.protocol.should.equal('https:')
      parsed.host.should.equal('zoe.cozycloud.cc')
    })

    it('parses http://localhost:9104', function () {
      let parsed = App.prototype.parseCozyUrl('http://localhost:9104')
      parsed.protocol.should.equal('http:')
      parsed.hostname.should.equal('localhost')
      parsed.port.should.equal('9104')
    })
  })

  describe('removeConfig', () => {
    beforeEach(configHelpers.createConfig)
    beforeEach(configHelpers.registerClient)

    it('removes everything but the logs from the config dir', async function () {
      const configDir = path.dirname(this.config.configPath)
      const basePath = path.dirname(configDir)
      const app = new App(basePath)
      app.config = this.config

      // Make sure Pouch db is being used
      app.instanciate()

      // Make sure current & rotated logs exist
      const logFilenames = [LOG_FILENAME, LOG_FILENAME + '.1']
      for (const filename of logFilenames) {
        await fs.ensureFile(path.join(configDir, filename))
      }

      await app.removeConfig()
      should(await fs.readdir(configDir)).deepEqual(logFilenames)
    })
  })

  describe('checkSyncPath', () => {
    it('cannot be the user home dir', () => {
      const syncPath = os.homedir()
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).have.properties({syncPath})
      should(result.error).not.be.empty()
    })

    it('cannot be the parent of the user home dir', () => {
      const syncPath = path.dirname(os.homedir())
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).have.properties({syncPath})
      should(result.error).not.be.empty()
    })

    it('cannot be the whole system', () => {
      const syncPath = process.platform === 'win32' ? 'C:\\' : '/'
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).have.properties({syncPath})
      should(result.error).not.be.empty()
    })

    it('can be an existing non-empty dir', () => {
      const syncPath = fs.mkdtempSync(path.join(os.tmpdir(), 'existing-non-empty-dir'))
      try {
        fs.writeFileSync(path.join(syncPath, 'some-file'), 'some-content')
        const result = App.prototype.checkSyncPath(syncPath)
        should(result).have.properties({syncPath})
        should(result).not.have.property('error')
      } finally {
        fs.removeSync(syncPath)
      }
    })

    it('can be the default dir', () => {
      const syncPath = path.join(os.homedir(), 'Cozy Drive')
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).deepEqual({syncPath})
    })

    it('can be a subdir of the user home', () => {
      const syncPath = path.join(os.homedir(), 'Cozy Drive Test ' + new Date().getTime())
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).deepEqual({syncPath})
    })

    it('can be a subdir outside the user home', () => {
      const syncPath = process.platform === 'win32' ? 'C:\\Cozy' : '/cozy'
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).deepEqual({syncPath})
    })

    if (process.platform === 'win32') {
      it('can be another volume', () => {
        const syncPath = 'D:\\'
        const result = App.prototype.checkSyncPath(syncPath)
        should(result).deepEqual({syncPath})
      })
    }
  })

  describe('clientInfo', () => {
    it('works when app is not configured', () => {
      const basePath = fs.mkdtempSync(path.join(os.tmpdir(), 'base-dir-'))
      const app = new App(basePath)

      const info = app.clientInfo()

      should(info.appVersion).equal(version)
      should(info.configPath).startWith(basePath)
      should.not.exist(info.configVersion)
      should.not.exist(info.cozyUrl)
      should(info.deviceName).equal('')
      should.exist(info.osRelease)
      should.exist(info.osType)
      should(info.permissions).deepEqual([])
      should.not.exist(info.syncPath)
    })

    it('works when app is configured', function () {
      configHelpers.createConfig.call(this)
      configHelpers.registerClient.call(this)
      const app = new App(this.basePath)

      const info = app.clientInfo()

      should(info.appVersion).equal(version)
      should(info.configPath).startWith(this.basePath)
      should(info.configVersion).equal(this.config.version)
      should(info.cozyUrl).equal(this.config.cozyUrl)
      should(info.deviceName).equal(this.config.deviceName)
      should.exist(info.osRelease)
      should.exist(info.osType)
      should(info.permissions).deepEqual(this.config.permissions)
      should(info.syncPath).equal(this.syncPath)
    })
  })
})
