const fse = require('fs-extra')
const del = require('del')
const path = require('path')

const config = require('../../../core/config')

const { COZY_URL } = require('./cozy')

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

  async cleanConfig() {
    // We have to convert Windows paths to Posix paths as `del` does not handle
    // backslash separators anymore.
    const deletedPath = path.posix.join(...this.syncPath.split(path.sep))
    return del(deletedPath, { force: process.env.CI })
  }
}
