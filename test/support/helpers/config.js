const fse = require('fs-extra')
const del = require('del')
const path = require('path')

const config = require('../../../core/config')

const automatedRegistration = require('../../../dev/remote/automated_registration')
const pkg = require('../../../package.json')
const { COZY_URL } = require('./cozy')
const PASSPHRASE = require('./passphrase')

module.exports = {
  createConfig() {
    let parent = process.env.COZY_DESKTOP_DIR || 'tmp'
    this.basePath = path.resolve(`${parent}/test/${+new Date()}`)
    this.syncPath = path.join(this.basePath, 'Cozy Drive')
    fse.ensureDirSync(this.syncPath)
    this.config = config.load(path.join(this.basePath, '.cozy-desktop'))
    this.config.syncPath = this.syncPath
    this.config.cozyUrl = COZY_URL
  },

  registerClient() {
    this.config.fileConfig.creds = {
      client: {
        clientID: process.env.COZY_CLIENT_ID || 'desktop',
        clientName: 'desktop',
        softwareID: 'cozy-desktop',
        redirectURI: 'http://localhost/'
      },
      token: {
        accessToken: process.env.COZY_STACK_TOKEN
      }
    }
  },

  async registerOAuthClient() {
    const registration = automatedRegistration(
      this.config.cozyUrl,
      PASSPHRASE,
      this.config
    )
    await registration.process(pkg)
  },

  async cleanConfig() {
    // We have to convert Windows paths to Posix paths as `del` does not handle
    // backslash separators anymore.
    const deletedPath = path.posix.join(...this.basePath.split(path.sep), '**')
    try {
      await del([deletedPath], { force: process.env.CI })
    } catch (err) {
      //
    }
  }
}
