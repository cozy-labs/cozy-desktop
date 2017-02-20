import fs from 'fs-extra'
import del from 'del'
import path from 'path'

import Config from '../../src/config'

export default {
  createConfig () {
    let parent = process.env.COZY_DESKTOP_DIR || 'tmp'
    this.syncPath = path.resolve(`${parent}/${+new Date()}`)
    fs.ensureDirSync(this.syncPath)
    this.config = new Config(path.join(this.syncPath, '.cozy-desktop'))
    this.config.syncPath = this.syncPath
  },

  registerClient () {
    this.config.config.creds = {
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

  cleanConfig () {
    return del.sync(this.syncPath)
  }
}
