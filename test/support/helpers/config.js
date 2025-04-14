const path = require('path')

const del = require('del')
const fse = require('fs-extra')

const { COZY_URL } = require('./cozy')
const PASSPHRASE = require('./passphrase')
const config = require('../../../core/config')
const { DEFAULT_SYNC_DIR_NAME } = require('../../../core/local/constants')
const { findBasePath } = require('../../../core/migrations/configPaths')
const automatedRegistration = require('../../../dev/remote/automated_registration')
const pkg = require('../../../package.json')

module.exports = {
  createConfig() {
    let parent = process.env.COZY_DESKTOP_DIR || 'tmp'
    this.basePath = path.resolve(`${parent}/test/${+new Date()}`)

    this.config = config.load(findBasePath(this.basePath))
    this.config.syncPath = path.join(this.basePath, DEFAULT_SYNC_DIR_NAME)
    this.config.cozyUrl = COZY_URL

    this.syncPath = this.config.syncPath
    fse.ensureDirSync(this.syncPath)
    this.tmpPath = this.config.tmpPath
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
