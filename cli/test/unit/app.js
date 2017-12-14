/* eslint-env mocha */

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import should from 'should'

import App from '../../src/app'
import { LOG_FILENAME } from '../../src/logger'

import configHelpers from '../helpers/config'

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
    it('is cannot be the user home dir', () => {
      const syncPath = os.homedir()
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).have.properties({syncPath})
      should(result.error).not.be.empty()
    })

    it('is cannot be the parent of the user home dir', () => {
      const syncPath = path.dirname(os.homedir())
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).have.properties({syncPath})
      should(result.error).not.be.empty()
    })

    it('is cannot be the whole system', () => {
      const syncPath = process.platform === 'win32' ? 'C:\\' : '/'
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).have.properties({syncPath})
      should(result.error).not.be.empty()
    })

    it('is can be the default dir', () => {
      const syncPath = path.join(os.homedir(), 'Cozy Drive')
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).deepEqual({syncPath})
    })

    it('is can be a subdir of the user home', () => {
      const syncPath = path.join(os.homedir(), 'Cozy Drive')
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).deepEqual({syncPath})
    })

    it('is can be a subdir outside the user home', () => {
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
})
