/* @flow */
/* eslint no-fallthrough: ["error", { "commentPattern": "break omitted" }] */
/* eslint-env mocha */

const should = require('should')

const crypto = require('crypto')
const fs = require('fs')
const fse = require('fs-extra')
const glob = require('glob')
const path = require('path')
const EventEmitter = require('events')
const Promise = require('bluebird')

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
    case 'start':
      state.config = {
        dbPath: { name: state.name, adapter: 'memory' },
        syncPath: state.dir.root
      }
      state.pouchdb = new Pouch(state.config)
      await state.pouchdb.addAllViewsAsync()
      // break omitted intentionally
    case 'restart':
      const events = new EventEmitter()
      const merge = new Merge(state.pouchdb)
      // $FlowFixMe We just want to keep a trace of the conflicts
      merge.local = merge.remote = {
        renameConflictingDocAsync: (_, dst) => state.conflicts.push(dst)
      }
      const ignore = new Ignore([])
      const prep = new Prep(merge, ignore, state.config)
      state.watcher = Watcher.build(state.dir.root, prep, state.pouchdb, events, ignore)
      state.watcher.start()
      break
    case 'stop':
      await Promise.delay(1000)
      await state.watcher.stop()
      state.watcher = null
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
    case 'reference':
      // We have two strategies to keep the information that a file has a reference:
      // - on windows, we have a map with the fileIds
      //   (the permissions for the group are ignored)
      // - on linux&macOS, we use one bit of the permissions (g+w)
      //   (the inode numbers can be reused)
      let release
      try {
        const abspath = state.dir.abspath(op.path)
        let stats
        if (winfs) {
          stats = winfs.lstatSync(abspath)
        } else {
          stats = await fse.stat(abspath)
        }
        release = await state.pouchdb.lock('test')
        const doc = await state.pouchdb.byIdMaybeAsync(id(op.path))
        if (doc && !doc.sides.remote) {
          doc.sides.remote = doc.sides.local + 1
          doc.remote = stats.ino
          await state.pouchdb.put(doc)
          if (winfs) {
            byFileIds.set(stats.fileid, true)
          } else {
            fs.chmodSync(abspath, 0o777)
          }
        }
      } catch (err) {
      } finally {
        if (release) {
          release()
        }
      }
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

      let state /*: Object */ = { name: scenario, conflicts: [] }
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
      await Promise.delay(2000)
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

      // And no conflict should have happened
      should(state.conflicts).be.empty()

      // And the references should have been kept in pouchdb
      for (const relpath of expected) {
        let referenced = false
        let stats
        const abspath = state.dir.abspath(relpath)
        if (winfs) {
          stats = winfs.lstatSync(abspath)
          referenced = byFileIds.has(stats.fileid)
        } else {
          stats = await fse.stat(abspath)
          referenced = (stats.mode & fs.constants.S_IWGRP) !== 0
        }
        if (referenced) {
          const doc = await state.pouchdb.byIdMaybeAsync(id(relpath))
          should(doc.remote).be.equal(stats.ino)
        }
      }
    })
  })
})
