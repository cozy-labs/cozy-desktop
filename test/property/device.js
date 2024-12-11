/* @flow */

const { spawn } = require('child_process')
const path = require('path')

const fse = require('fs-extra')
const { clone } = require('lodash')

/*::
import type { Stack } from './stack'
import type { ChildProcess } from 'child_process'
import type { ContextDir } from '../support/helpers/context_dir'
*/

class Device {
  /*::
  name: string
  stack: Stack
  desktopDir: ?string
  child: ?ChildProcess
  stopped: ?Promise<void>
  */

  constructor(name /*: string */, stack /*: Stack */) {
    this.name = name
    this.stack = stack
    this.desktopDir = null
    this.child = null
    this.stopped = null
  }

  async register(dir /*: ContextDir */) /*: Promise<void> */ {
    const client = await this.stack.registerClient(this.name)
    const token = await this.stack.createToken(client)
    const desktopDir = path.join(dir.root + '-config', '.cozy-desktop')
    await fse.ensureDir(desktopDir)
    const json = {
      url: `http://${this.stack.instance}/`,
      path: dir.root,
      creds: { client, token }
    }
    await fse.writeJson(path.join(desktopDir, 'config.json'), json)
    this.desktopDir = path.dirname(desktopDir)
  }

  async start() /*: Promise<void> */ {
    if (this.child) {
      return
    }
    if (!this.desktopDir) {
      throw new Error('Client has not been configured')
    }
    let env = clone(process.env)
    env.COZY_DESKTOP_DIR = this.desktopDir
    env.COZY_DESKTOP_HEARTBEAT = 10000
    env.COZY_DESKTOP_PROPERTY_BASED_TESTING = true
    // TODO it would be nice to start cozy-desktop without the GUI
    this.child = spawn('yarn', ['run', 'electron', '.'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      cwd: path.join(__dirname, '../..'),
      env: env
    })
    this.stopped = new Promise((resolve, reject) => {
      this.child &&
        this.child.on('exit', () => {
          this.child = null
          resolve()
        })
      this.child &&
        this.child.on('error', err => {
          this.child = null
          reject(err)
        })
    })
  }

  async stop() /*: Promise<void> */ {
    if (!this.child) {
      return
    }
    this.child.kill()
    await this.stopped
    // TODO electron starts several processes and daemonizes itself
  }
}

async function setupDevice(
  deviceName /*: string */,
  dir /*: ContextDir */,
  stack /*: Stack */
) {
  const device = new Device(deviceName, stack)
  await device.register(dir)
  return { dir, device }
}

module.exports = { Device, setupDevice }
