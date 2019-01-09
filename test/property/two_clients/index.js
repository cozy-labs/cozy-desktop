/* @flow */
/* eslint-env mocha */

const should = require('should')

const crypto = require('crypto')
const fs = require('fs')
const fse = require('fs-extra')
const glob = require('glob')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const Promise = require('bluebird')

const { ContextDir } = require('../../support/helpers/context_dir')
const TmpDir = require('../../support/helpers/TmpDir')

/*::
import type { ChildProcess } from 'child_process'
*/

let winfs
if (process.platform === 'win32') {
  // $FlowFixMe
  winfs = require('@gyselroth/windows-fsstat')
}
const byFileIds = new Map()

async function step (state, op) {
  // Slow down things to avoid issues with chokidar throttler
  await Promise.delay(10)

  switch (op.op) {
    case 'start_client':
      await state.start()
      break
    case 'stop_client':
      await state.stop()
      break
    case 'sleep':
      await Promise.delay(op.duration)
      break
    case 'mkdir':
      try {
        await state.dir.ensureDir(op.path)
      } catch (err) {}
      break
    case 'create_file':
    case 'update_file':
      let size = op.size || 16
      const block = size > 65536 ? 65536 : size
      const content = await crypto.randomBytes(block)
      size -= block
      try {
        await state.dir.outputFile(op.path, content)
      } catch (err) {}
      for (let i = 0; size > 0; i++) {
        const block = size > 65536 ? 65536 : size
        const content = await crypto.randomBytes(block)
        size -= block
        setTimeout(async function () {
          try {
            await state.dir.outputFile(op.path, content)
          } catch (err) {}
        }, (i + 1) * 10)
      }
      break
    case 'mv':
      try {
        // XXX fs-extra move can enter in an infinite loop for some stupid moves
        await new Promise(resolve =>
          fs.rename(state.dir.abspath(op.from), state.dir.abspath(op.to), resolve)
        ).then((err) => {
          if (!err && op.to.match(/^\.\.\/outside/)) {
            // Remove the reference for files/dirs moved outside
            const abspath = state.dir.abspath(op.to)
            if (winfs) {
              const stats = winfs.lstatSync(abspath)
              byFileIds.delete(stats.fileid)
            } else {
              fs.chmodSync(abspath, 0o700)
            }
          }
        })
      } catch (err) {
        console.log('Rename err', err)
      }
      break
    case 'rm':
      try {
        await state.dir.remove(op.path)
      } catch (err) {}
      break
    default:
      throw new Error(`${op.op} is an unknown operation`)
  }
  return state
}

async function run (ops, state) {
  for (let op of ops) {
    state = await step(state, op)
  }
}

class Stack {
  /*::
  dir: string
  instance: string
  child: ?ChildProcess
  stopped: ?Promise<void>
  */

  constructor (dir) {
    this.dir = dir
    this.instance = 'testdesktop.cozy.tools:8080'
    this.child = null
    this.stopped = null
  }

  async start () {
    const log = fs.openSync(`${this.dir}.log`, 'w+')
    this.child = spawn('cozy-stack',
      ['serve', '--fs-url', `file://${this.dir}`],
      { stdio: ['ignore', log, log] }
    )
    this.stopped = new Promise((resolve, reject) => {
      this.child && this.child.on('exit', () => {
        this.child = null
        resolve()
      })
      this.child && this.child.on('error', err => {
        this.child = null
        reject(err)
      })
    })
    await Promise.delay(1000)
  }

  async stop () {
    if (!this.child) { return }
    this.child.kill()
    await this.stopped
  }

  async createInstance () {
    const log = fs.openSync(`${this.dir}-instance-add.log`, 'w+')
    spawnSync('cozy-stack',
      ['instance', 'add', `${this.instance}`, '--dev', '--passphrase', 'cozy'],
      { stdio: ['ignore', log, log] })
  }

  async cleanInstance () {
    const log = fs.openSync(`${this.dir}-instance-rm.log`, 'w+')
    spawnSync('cozy-stack',
      ['instance', 'rm', '--force', `${this.instance}`],
      { stdio: ['ignore', log, log] })
  }

  async registerClient (name) {
    const log = fs.openSync(`${this.dir}-instance-client-oauth.log`, 'w+')
    const child = spawn('cozy-stack',
      ['instance', 'client-oauth', '--json', `${this.instance}`, `http://${name}.localhost`, `${name}`, 'github.com/cozy-labs/cozy-desktop'],
      { stdio: ['ignore', 'pipe', log] })
    let buffer = ''
    child.stdout.on('data', data => { buffer += data })
    await new Promise(resolve => {
      child.on('exit', resolve)
    })
    console.log('buffer', buffer)
    return JSON.parse(buffer)
  }

  async createToken (client) {
    const scope = 'io.cozy.files io.cozy.settings'
    const log = fs.openSync(`${this.dir}-instance-token-oauth.log`, 'w+')
    const child = spawn('cozy-stack',
      ['instance', 'token-oauth', `${this.instance}`, `${client.clientID}`, scope],
      { stdio: ['ignore', 'pipe', log] })
    let buffer = ''
    child.stdout.on('data', data => { buffer += data })
    await new Promise(resolve => {
      child.on('exit', resolve)
    })
    console.log('buffer', buffer)
    return { tokenType: 'bearer', accessToken: buffer, scope }
  }
}

async function setupStack (dir) {
  await fse.ensureDir(dir)
  const stack = new Stack(dir)
  await stack.start()
  await stack.cleanInstance()
  await stack.createInstance()
  return stack
}

class Device {
  /*::
  name: string
  stack: Stack
  desktopDir: ?string
  syncPath: ?string
  */

  constructor (name, stack) {
    this.name = name
    this.stack = stack
    this.desktopDir = null
    this.syncPath = null
  }

  async register (dir) {
    const client = await this.stack.registerClient(this.name)
    const token = await this.stack.createToken(client)
    this.desktopDir = dir.root + '-config'
    this.syncPath = dir.root
    // TODO write JSON
    console.log({token})
  }

  async start () {
    // TODO
  }

  async stop () {
    // TODO
  }
}

async function setupDevice (deviceName, dir, stack) {
  const device = new Device(deviceName, stack)
  await device.register(dir)
  return { dir, device }
}

describe('Two clients', function () {
  this.timeout(600000)
  this.slow(60000)

  const scenarios = glob.sync(path.join(__dirname, '*.json'))
  scenarios.forEach(scenario => {
    scenario = path.normalize(scenario)
    it(`works fine for ${path.basename(scenario)}`, async function () {
      const data = await fse.readJson(scenario)
      if (data.pending) {
        return this.skip(data.pending.msg || 'pending')
      }

      let state /*: Object */ = {
        name: scenario,
        dir: await TmpDir.emptyForTestFile(scenario)
      }
      state.stack = await setupStack(path.join(state.dir, 'stack'))
      for (const device in data) {
        console.log(device)
        let dir = new ContextDir(path.join(state.dir, device))
        state[device] = await setupDevice(device, dir, state.stack)
      }

      const runnings = []
      for (const device in data) {
        runnings.push(run(data[device], state[device]))
      }
      await Promise.all(runnings)

      // Wait that the dust settles
      console.log('state', state) // FIXME
      should.exists(state.stack)
      await Promise.delay(25000)
      for (const device of data) {
        should.exists(state[device].client)
        await state[device].client.stop()
      }

      // Each device should have the same tree that the Cozy
      // TODO
      // let expected = await state.dir.tree()
      // expected = expected.map(item => item.replace(/\/$/, ''))
      // expected = expected.map(item => path.normalize(id(item)))
      // expected = expected.sort((a, b) => a.localeCompare(b))
      // let actual = await state.pouchdb.treeAsync()
      // actual = actual.filter(item => !item.startsWith('_design/'))
      // actual = actual.sort((a, b) => a.localeCompare(b))
      // should(actual).deepEqual(expected)

      await state.stack.stop()
    })
  })
})
