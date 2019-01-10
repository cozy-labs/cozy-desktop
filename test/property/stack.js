/* @flow */

const fs = require('fs')
const fse = require('fs-extra')
const { spawn, spawnSync } = require('child_process')
const Promise = require('bluebird')

/*::
import type { ChildProcess } from 'child_process'
*/

class Stack {
  /*::
  dir: string
  instance: string
  child: ?ChildProcess
  stopped: ?Promise<void>
  */

  constructor (dir /*: string */) {
    this.dir = dir
    this.instance = 'test.desktop.cozy.tools:8080'
    this.child = null
    this.stopped = null
  }

  async start () /*: Promise<void> */ {
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

  async stop () /*: Promise<void> */ {
    if (!this.child) { return }
    this.child.kill()
    await this.stopped
  }

  async createInstance () /*: Promise<void> */ {
    const log = fs.openSync(`${this.dir}-instance-add.log`, 'a+')
    spawnSync('cozy-stack',
      ['instance', 'add', `${this.instance}`, '--dev', '--passphrase', 'cozy'],
      { stdio: ['ignore', log, log] })
  }

  async cleanInstance () /* Promise<void> */ {
    const log = fs.openSync(`${this.dir}-instance-rm.log`, 'a+')
    spawnSync('cozy-stack',
      ['instance', 'rm', '--force', `${this.instance}`],
      { stdio: ['ignore', log, log] })
  }

  async registerClient (name /*: string */) /*: Object */ {
    const log = fs.openSync(`${this.dir}-instance-client-oauth.log`, 'a+')
    const child = spawn('cozy-stack',
      ['instance', 'client-oauth', '--json', `${this.instance}`, `http://${name}.localhost`, `${name}`, 'github.com/cozy-labs/cozy-desktop'],
      { stdio: ['ignore', 'pipe', log] })
    let buffer = ''
    child.stdout.on('data', data => { buffer += data })
    await new Promise(resolve => {
      child.on('exit', resolve)
    })
    return JSON.parse(buffer)
  }

  async createToken (client /*: Object */) /*: Object */ {
    const scope = 'io.cozy.files io.cozy.settings'
    const log = fs.openSync(`${this.dir}-instance-token-oauth.log`, 'a+')
    const child = spawn('cozy-stack',
      ['instance', 'token-oauth', `${this.instance}`, `${client.client_id}`, scope],
      { stdio: ['ignore', 'pipe', log] })
    let buffer = ''
    child.stdout.on('data', data => { buffer += data })
    await new Promise(resolve => {
      child.on('exit', resolve)
    })
    return { tokenType: 'bearer', accessToken: buffer.trim(), scope }
  }
}

async function setupStack (dir /*: string */) /*: Promise<Stack> */ {
  await fse.ensureDir(dir)
  const stack = new Stack(dir)
  await stack.start()
  await stack.cleanInstance()
  await stack.createInstance()
  return stack
}

module.exports = { Stack, setupStack }
