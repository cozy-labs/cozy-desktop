/* @flow */
/* eslint-env mocha */

const path = require('path')

const Promise = require('bluebird')
const fse = require('fs-extra')
const glob = require('glob')
const should = require('should')

const TmpDir = require('../../support/helpers/TmpDir')
const { ContextDir } = require('../../support/helpers/context_dir')
const { setupDevice } = require('../device')
const { run } = require('../runner')
const { setupStack } = require('../stack')

describe('Two clients', function() {
  this.timeout(600000)
  this.slow(60000)

  const scenarios = glob.sync(path.join(__dirname, '*.json'))
  scenarios.forEach(scenario => {
    scenario = path.normalize(scenario)
    it(`works fine for ${path.basename(scenario)}`, async function() {
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
        runnings.push(run(state[device], data[device]))
      }
      await Promise.all(runnings)

      // Wait that the dust settles
      should.exists(state.stack)
      await Promise.delay(30000)
      for (const device in data) {
        should.exists(state[device].device)
        await state[device].device.stop()
      }
      await state.stack.stop()

      // Each device should have the same tree that the Cozy
      let ctxDir = new ContextDir(
        path.join(state.stack.dir, state.stack.instance)
      )
      let expected = await ctxDir.tree()
      expected = expected.filter(item => !item.startsWith('.cozy_trash/'))
      expected = expected.filter(item => !item.startsWith('.thumbs/'))
      for (const device in data) {
        let actual = await state[device].dir.tree()
        should(actual).deepEqual(expected)
      }
    })
  })
})
