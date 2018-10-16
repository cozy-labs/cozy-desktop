const { describe, it } = require('mocha')
const should = require('should')

const crypto = require('crypto')
const fse = require('fs-extra')
const glob = require('glob')
const path = require('path')

const { ContextDir } = require('../../support/helpers/context_dir')
const TmpDir = require('../../support/helpers/TmpDir')

const logger = require('../../../core/logger')
const Ignore = require('../../../core/ignore')
const Merge = require('../../../core/merge')
const Pouch = require('../../../core/pouch')
const Prep = require('../../../core/prep')
const Watcher = require('../../../core/local/watcher')

const PouchDB = require('pouchdb')
PouchDB.plugin(require('pouchdb-adapter-memory'))


const events = {
  emit: (msg) => {}
}

async function play(state, op) {
  switch (op.op) {
    case "start":
      const config = { dbPath: { name: state.name, adapter: 'memory' } }
      state.pouchdb = new Pouch(config)
      await state.pouchdb.addAllViewsAsync()
      const merge = new Merge(state.pouchdb)
      const ignore = new Ignore('')
      const prep = new Prep(merge, ignore, config)
      state.watcher = new Watcher(state.dir.root, prep, state.pouchdb, events)
      state.watcher.start()
      break
    case "sleep":
      await Promise.delay(op.duration)
      break
    case "mkdir":
      await state.dir.ensureDir(op.path)
      break
    case "create_file":
      content = await crypto.randomBytes(op.size || 16)
      await state.dir.outputFile(op.path, content)
      break
    case "mv":
      await state.dir.move(op.from, op.to)
      break
    default:
      throw new Error(`${op.op} is an unknown operation`)
  }
  return state
}


describe('Local watcher', () => {
  scenarios = glob.sync(path.join(__dirname, '*.json'))
  scenarios.forEach((scenario) => {
    it(`works fine for ${path.basename(scenario)}`, async () => {
      const ops = await fse.readJson(scenario)
      let state = { name: scenario }
      state.dir = new ContextDir(await TmpDir.emptyForTestFile(scenario))
      for (let op of ops) {
        try {
          state = await play(state, op)
        } catch (err) {
          console.log(err)
        }
      }
      should.exists(state.watcher)
      should.exists(state.pouchdb)

      // Wait that the dust settles
      await Promise.delay(1000)
      await state.watcher.stop()

      // We are testing 2 properties for the local watcher:
      // 1. at the end of the test, the pouchdb should reflect the file system
      let expected = await state.dir.tree()
      expected = expected.map(item => item.replace(/\/$/, ''))
      let actual = await state.pouchdb.treeAsync()
      actual = actual.filter(item => !item.startsWith('_design/'))
      should(actual).deepEqual(expected)

      // 2. during the test, it doesn't identify a move as rm+add

    })
  })
})
