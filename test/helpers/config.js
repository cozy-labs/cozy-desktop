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
    return this.config.devices['tester'] = {
      deviceName: 'tester',
      password: 'password',
      url: 'nonecozy',
      path: this.syncPath
    }
  },

  cleanConfig () {
    return del.sync(this.syncPath)
  }
}
