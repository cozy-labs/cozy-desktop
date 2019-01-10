/* @flow */
/* eslint-env mocha */

const should = require('should')

const crypto = require('crypto')
const fs = require('fs')
const fse = require('fs-extra')
const glob = require('glob')
const path = require('path')
const Promise = require('bluebird')

const { ContextDir } = require('../../support/helpers/context_dir')
const TmpDir = require('../../support/helpers/TmpDir')

const { setupStack } = require('../stack')
const { setupDevice } = require('../device')

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
      await state.device.start()
      break
    case 'stop_client':
      await state.device.stop()
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
        let dir = new ContextDir(path.join(state.dir, device))
        state[device] = await setupDevice(device, dir, state.stack)
      }

      const runnings = []
      for (const device in data) {
        runnings.push(run(data[device], state[device]))
      }
      await Promise.all(runnings)

      // Wait that the dust settles
      should.exists(state.stack)
      await Promise.delay(30000)
      for (const device in data) {
        should.exists(state[device].device)
        await state[device].device.stop()
      }

      // Each device should have the same tree that the Cozy
      let ctxDir = new ContextDir(path.join(state.stack.dir, state.stack.instance))
      let expected = await ctxDir.tree()
      expected = expected.filter(item => !item.startsWith('.cozy_trash/'))
      expected = expected.filter(item => !item.startsWith('.thumbs/'))
      for (const device in data) {
        let actual = await state[device].dir.tree()
        should(actual).deepEqual(expected)
      }

      await state.stack.stop()
    })
  })
})
