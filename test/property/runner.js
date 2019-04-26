/* @flow */
/* eslint no-fallthrough: ["error", { "commentPattern": "break omitted" }] */

const crypto = require('crypto')
const fs = require('fs')
const fse = require('fs-extra')
const EventEmitter = require('events')
const Promise = require('bluebird')

const { id } = require('../../core/metadata')
const { Ignore } = require('../../core/ignore')
const Merge = require('../../core/merge')
const Pouch = require('../../core/pouch')
const Prep = require('../../core/prep')
const Watcher = require('../../core/local/watcher')

const PouchDB = require('pouchdb')
PouchDB.plugin(require('pouchdb-adapter-memory'))

let winfs
if (process.platform === 'win32') {
  // $FlowFixMe
  winfs = require('@gyselroth/windows-fsstat')
}

async function step(state /*: Object */, op /*: Object */) {
  // Slow down things to avoid issues with chokidar throttler
  await Promise.delay(10)

  switch (op.op) {
    case 'start_watcher':
      state.winfs = winfs
      state.byFileIds = new Map()
      state.config = {
        dbPath: { name: state.name, adapter: 'memory' },
        syncPath: state.dir.root
      }
      state.pouchdb = new Pouch(state.config)
      await state.pouchdb.addAllViewsAsync()
    // break omitted intentionally
    case 'restart_watcher':
      const events = new EventEmitter()
      const merge = new Merge(state.pouchdb)
      // $FlowFixMe We just want to keep a trace of the conflicts
      merge.local = merge.remote = {
        renameConflictingDocAsync: (_, dst) => state.conflicts.push(dst)
      }
      const ignore = new Ignore([])
      const prep = new Prep(merge, ignore, state.config)
      state.watcher = Watcher.build({
        config: state.config,
        prep,
        pouch: state.pouchdb,
        events,
        ignore
      })
      state.watcher.start()
      break
    case 'stop_watcher':
      await Promise.delay(1000)
      await state.watcher.stop()
      state.watcher = null
      break
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
        setTimeout(async function() {
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
          fs.rename(
            state.dir.abspath(op.from),
            state.dir.abspath(op.to),
            resolve
          )
        ).then(err => {
          if (!err && op.to.match(/^\.\.\/outside/)) {
            // Remove the reference for files/dirs moved outside
            const abspath = state.dir.abspath(op.to)
            if (winfs) {
              const stats = winfs.lstatSync(abspath)
              state.byFileIds.delete(stats.fileid)
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
            state.byFileIds.set(stats.fileid, true)
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

async function run(state /*: Object */, ops /*: Object[] */) {
  for (let op of ops) {
    state = await step(state, op)
  }
}

module.exports = { step, run }
