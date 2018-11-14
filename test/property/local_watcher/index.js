const { describe, it } = require('mocha')
const should = require('should')

const crypto = require('crypto')
const fs = require('fs')
const fse = require('fs-extra')
const glob = require('glob')
const path = require('path')
const EventEmitter = require('events')

const { ContextDir } = require('../../support/helpers/context_dir')
const TmpDir = require('../../support/helpers/TmpDir')

const { id } = require('../../../core/metadata')
const { defaultLogger } = require('../../../core/logger')
const { Ignore } = require('../../../core/ignore')
const Merge = require('../../../core/merge')
const Pouch = require('../../../core/pouch')
const Prep = require('../../../core/prep')
const Watcher = require('../../../core/local/watcher')

const PouchDB = require('pouchdb')
PouchDB.plugin(require('pouchdb-adapter-memory'))

Promise.promisifyAll(fs)

async function step (state, op) {
  // Slow down things to avoid issues with chokidar throttler
  await Promise.delay(10)

  switch (op.op) {
    case 'start':
      const events = new EventEmitter()
      const config = { dbPath: { name: state.name, adapter: 'memory' } }
      state.pouchdb = new Pouch(config)
      await state.pouchdb.addAllViewsAsync()
      const merge = new Merge(state.pouchdb)
      const ignore = new Ignore([])
      const prep = new Prep(merge, ignore, config)
      state.watcher = Watcher.build(state.dir.root, prep, state.pouchdb, events)
      state.watcher.start()
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
        await fs.move(state.dir.abspath(op.from), state.dir.abspath(op.to))
      } catch (err) {}
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

describe('Local watcher', function () {
  this.timeout(240000)
  this.slow(30000)

  const scenarios = glob.sync(path.join(__dirname, '*.json'))
  scenarios.forEach(scenario => {
    scenario = path.normalize(scenario)
    it(`works fine for ${path.basename(scenario)}`, async function () {
      const ops = await fse.readJson(scenario)
      if (ops.length > 0 && ops[0].op === 'pending') {
        return this.skip(ops[0].msg || 'pending')
      }

      let state = { name: scenario }
      state.dir = new ContextDir(await TmpDir.emptyForTestFile(scenario))
      defaultLogger.streams.length = 0
      defaultLogger.addStream({
        type: 'file',
        path: state.dir.root + '.log',
        level: 'debug'
      })
      for (let op of ops) {
        state = await step(state, op)
      }

      // Wait that the dust settles
      should.exists(state.watcher)
      should.exists(state.pouchdb)
      await Promise.delay(1000)
      await state.watcher.stop()

      // Pouchdb should have the same tree that the file system
      let expected = await state.dir.tree()
      expected = expected.map(item => item.replace(/\/$/, ''))
      expected = expected.map(item => path.normalize(id(item)))
      expected = expected.sort((a, b) => a.localeCompare(b))
      let actual = await state.pouchdb.treeAsync()
      actual = actual.filter(item => !item.startsWith('_design/'))
      actual = actual.sort((a, b) => a.localeCompare(b))
      should(actual).deepEqual(expected)
    })
  })
})
