/* eslint-env mocha */

const fse = require('fs-extra')
const os = require('os')
const path = require('path')
const should = require('should')
const sinon = require('sinon')

const { App } = require('../../core/app')
const { LOG_FILENAME } = require('../../core/utils/logger')
const pkg = require('../../package.json')
const { version } = pkg
const { FetchError } = require('../../core/remote/cozy')

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

    it('parses zoe as https://zoe.mycozy.cloud', function () {
      let parsed = App.prototype.parseCozyUrl('zoe')
      parsed.protocol.should.equal('https:')
      parsed.host.should.equal('zoe.mycozy.cloud')
    })

    it('parses http://localhost:9104', function () {
      let parsed = App.prototype.parseCozyUrl('http://localhost:9104')
      parsed.protocol.should.equal('http:')
      parsed.hostname.should.equal('localhost')
      parsed.port.should.equal('9104')
    })

    it('parses https://toto.cozy.claude.fr:8084', function () {
      let parsed = App.prototype.parseCozyUrl(
        'https://toto.cozy.claude.fr:8084'
      )
      parsed.protocol.should.equal('https:')
      parsed.hostname.should.equal('toto.cozy.claude.fr')
      parsed.port.should.equal('8084')
    })
  })

  describe('removeRemote', () => {
    beforeEach(configHelpers.createConfig)

    it('removes the config even if the Cozy is unreachable', async function () {
      // We have to call this helper here and not in a beforeEach otherwise the
      // next test will actually delete the test OAuth client on the Cozy and
      // other tests will subsequently fail.
      await configHelpers.registerClient.call(this)

      const configDir = path.dirname(this.config.configPath)
      const basePath = path.dirname(configDir)
      const app = new App(basePath)
      app.config = this.config
      app.instanciate()

      sinon.spy(app, 'removeConfig')
      sinon
        .stub(app.remote, 'unregister')
        .rejects(new FetchError({ status: 404 }, 'Cannot reach Cozy'))

      await app.removeRemote()

      should(app.removeConfig).have.been.called()
    })

    // FIXME
    if (process.env.TRAVIS || process.env.GITHUB_ENV) {
      it('works only on AppVeyor since it uses an actual Cozy.')
      return
    }

    it('unregisters the client', async function () {
      await configHelpers.registerOAuthClient.call(this)
      const configDir = path.dirname(this.config.configPath)
      const basePath = path.dirname(configDir)
      const app = new App(basePath)
      // Ugly hack to inject Config into App, because there is currently no
      // other way. Working as long as we don't use Pouch, since it will still
      // have the old config.
      app.config = this.config
      app.instanciate()

      const err = await app.removeRemote()
      // The removeRemote() method has a weird behavior: it may return an
      // Error object. We better throw it than asserting it doesn't exist, so
      // we get a readable stack trace.
      if (err) throw err
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
        await fse.ensureFile(path.join(configDir, filename))
      }

      await app.removeConfig()
      should(await fse.readdir(configDir)).deepEqual(logFilenames)
    })
  })

  describe('checkSyncPath', () => {
    it('cannot be the user home dir', () => {
      const syncPath = os.homedir()
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).have.properties({ syncPath })
      should(result.error).not.be.empty()
    })

    it('cannot be the parent of the user home dir', () => {
      const syncPath = path.dirname(os.homedir())
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).have.properties({ syncPath })
      should(result.error).not.be.empty()
    })

    it('cannot be the whole system', () => {
      const syncPath = process.platform === 'win32' ? 'C:\\' : '/'
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).have.properties({ syncPath })
      should(result.error).not.be.empty()
    })

    it('can be an existing non-empty dir', () => {
      const syncPath = fse.mkdtempSync(
        path.join(os.tmpdir(), 'existing-non-empty-dir')
      )
      try {
        fse.writeFileSync(path.join(syncPath, 'some-file'), 'some-content')
        const result = App.prototype.checkSyncPath(syncPath)
        should(result).have.properties({ syncPath })
        should(result).not.have.property('error')
      } finally {
        fse.removeSync(syncPath)
      }
    })

    it('can be the default dir', () => {
      const syncPath = path.join(os.homedir(), 'Cozy Drive')
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).deepEqual({ syncPath })
    })

    it('can be a subdir of the user home', () => {
      const syncPath = path.join(
        os.homedir(),
        'Cozy Drive Test ' + new Date().getTime()
      )
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).deepEqual({ syncPath })
    })

    it('can be a subdir outside the user home', () => {
      const syncPath = process.platform === 'win32' ? 'C:\\Cozy' : '/cozy'
      const result = App.prototype.checkSyncPath(syncPath)
      should(result).deepEqual({ syncPath })
    })

    if (process.platform === 'win32') {
      it('can be another volume', () => {
        const syncPath = 'D:\\'
        const result = App.prototype.checkSyncPath(syncPath)
        should(result).deepEqual({ syncPath })
      })
    }
  })

  describe('stopSync', () => {
    let app
    beforeEach('create app', function () {
      configHelpers.createConfig.call(this)
      configHelpers.registerClient.call(this)
      this.config.persist() // the config helper does not persist it
      app = new App(this.basePath)
    })

    context('when we have an instanciated Sync', () => {
      beforeEach('instanciate app', function () {
        app.instanciate()
      })

      it('returns a Promise', () => {
        should(app.stopSync()).be.a.Promise()
      })
    })

    context('when we do not have an instanciated Sync', () => {
      it('returns a Promise', () => {
        should(app.stopSync()).be.a.Promise()
      })
    })
  })

  describe('clientInfo', () => {
    it('works when app is not configured', () => {
      const basePath = fse.mkdtempSync(path.join(os.tmpdir(), 'base-dir-'))
      const app = new App(basePath)

      const info = app.clientInfo()

      should(info).deepEqual({
        appVersion: version,
        configPath: path.join(basePath, '.cozy-desktop', 'config.json'),
        configVersion: '',
        cozyUrl: undefined,
        deviceName: '',
        osRelease: os.release(),
        osType: os.type(),
        osArch: os.arch(),
        permissions: [],
        syncPath: undefined
      })
    })

    it('works when app is configured', function () {
      configHelpers.createConfig.call(this)
      configHelpers.registerClient.call(this)
      this.config.persist() // the config helper does not persist it

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

  describe('sendMailToSupport', () => {
    it('sends email even without the local PouchDB tree', async function () {
      configHelpers.createConfig.call(this)
      configHelpers.registerClient.call(this)
      this.config.persist() // the config helper does not persist it

      const app = new App(this.basePath)
      app.instanciate()

      sinon.stub(app, 'uploadFileToSupport').resolves()
      sinon
        .stub(app.pouch, 'localTree')
        .throws(new Error('Cannot fetch local tree'))
      sinon.stub(app.remote, 'sendMail').resolves()

      await should(app.sendMailToSupport()).be.fulfilled()
      should(app.remote.sendMail).have.been.called()

      app.uploadFileToSupport.restore()
      app.pouch.localTree.restore()
      app.remote.sendMail.restore()
    })
  })
})
