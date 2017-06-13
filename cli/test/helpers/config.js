import fs from 'fs-extra'
import del from 'del'
import path from 'path'

import Config from '../../src/config'

import { COZY_URL } from './cozy'

export default {
  createConfig () {
    let parent = process.env.COZY_DESKTOP_DIR || 'tmp'
    const basePath = path.resolve(`${parent}/${+new Date()}`)
    this.syncPath = path.join(basePath, 'Cozy')
    fs.ensureDirSync(this.syncPath)
    this.config = new Config(path.join(basePath, '.cozy-desktop'))
    this.config.syncPath = this.syncPath
    this.config.cozyUrl = COZY_URL
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
    return del.sync(this.syncPath, {force: process.env.TRAVIS})
  }
}
