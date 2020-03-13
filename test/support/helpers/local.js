/* @flow */

const autoBind = require('auto-bind')
const Promise = require('bluebird')
const fse = require('fs-extra')
const _ = require('lodash')
const path = require('path')
const rimraf = require('rimraf')

const conflictHelpers = require('./conflict')
const { ContextDir } = require('./context_dir')

const Local = require('../../../core/local')
const atomWatcher = require('../../../core/local/atom/watcher')
const { TMP_DIR_NAME } = require('../../../core/local/constants')
const dispatch = require('../../../core/local/atom/dispatch')
const { INITIAL_SCAN_DONE } = require('../../../core/local/atom/event')

const rimrafAsync = Promise.promisify(rimraf)

/*::
import type { LocalOptions } from '../../../core/local'
import type { ChokidarEvent } from '../../../core/local/chokidar/event'
import type { AtomBatch } from '../../../core/local/atom/event'
*/

const simulationCompleteBatch = [
  {
    action: 'test-simulation-complete',
    kind: 'magic',
    path: ''
  }
]

class LocalTestHelpers {
  /*::
  side: Local
  syncDir: ContextDir
  trashDir: ContextDir
  _resolveSimulation: ?() => void
  */

  constructor(opts /*: LocalOptions */) {
    const localOptions /*: LocalOptions */ = Object.assign(
      ({
        onAtomEvents: this.dispatchAtomEvents.bind(this)
      } /*: Object */),
      opts
    )
    this.side = new Local(localOptions)
    this.syncDir = new ContextDir(this.side.syncPath)
    autoBind(this)
  }

  get syncPath() /*: string */ {
    return path.normalize(this.side.syncPath)
  }

  get trashPath() /*: string */ {
    return path.join(this.side.tmpPath, '.test-trash')
  }

  async clean() {
    for (const pattern of ['*', '.*']) {
      await rimrafAsync(path.join(this.syncPath, pattern))
    }
  }

  async trashFunc(paths /*: string[] */) /*: Promise<void> */ {
    for (const src of paths) {
      const dst = path.join(this.trashPath, path.basename(src))
      try {
        await fse.rename(src, dst)
      } catch (err) {
        throw err
      }
    }
  }

  async setupTrash() {
    await fse.emptyDir(this.trashPath)
    this.trashDir = new ContextDir(this.trashPath)
    this.side._trash = this.trashFunc
  }

  async tree(
    opts /*: {ellipsize: boolean} */ = { ellipsize: true }
  ) /*: Promise<string[]> */ {
    let trashContents
    try {
      trashContents = await this.trashDir.tree()
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
      throw new Error(
        'You must call and await helpers.local.setupTrash() (e.g. in a ' +
          'beforeEach block) before calling helpers.local.tree() in a test'
      )
    }
    const ellipsizeDate = opts.ellipsize
      ? conflictHelpers.ellipsizeDate
      : _.identity
    return trashContents
      .map(relPath => path.posix.join('/Trash', relPath))
      .concat(await this.syncDir.tree())
      .map(ellipsizeDate)
      .filter(relpath => !relpath.match(TMP_DIR_NAME))
      .sort()
  }

  async scan() {
    await this.side.watcher.start()
    await this.side.watcher.stop()
  }

  async treeWithoutTrash() {
    return (await this.tree()).filter(p => !p.startsWith('/Trash/'))
  }

  async simulateEvents(events /*: ChokidarEvent[] */) {
    // $FlowFixMe
    return this.side.watcher.onFlush(events)
  }

  startSimulation() {
    return new Promise(resolve => {
      this._resolveSimulation = resolve
    })
  }

  isSimulationEnd(batch /*: AtomBatch */) {
    const { _resolveSimulation } = this
    return _resolveSimulation && _.isEqual(batch, simulationCompleteBatch)
  }

  stopSimulation() {
    const { _resolveSimulation } = this
    _resolveSimulation && _resolveSimulation()
    delete this._resolveSimulation
  }

  dispatchAtomEvents(batch /*: AtomBatch */) {
    if (this.isSimulationEnd(batch)) {
      this.stopSimulation()
      return []
    } else {
      const watcher = this._ensureAtomWatcher()
      const stepOptions = Object.assign(
        ({
          checksumer: watcher.checksumer,
          scan: watcher.producer.scan,
          state: watcher.state
        } /*: Object */),
        this.side
      )
      return dispatch.step(stepOptions)(batch)
    }
  }

  /** Usage:
   *
   * - `#simulateAtomStart()`
   * - Fill in the test Pouch / sync dir
   * - `#simulateAtomEvents()`
   */
  async simulateAtomEvents(batches /*: AtomBatch[] */) {
    const watcher = this._ensureAtomWatcher()
    for (const batch of batches.concat([simulationCompleteBatch])) {
      // $FlowFixMe
      watcher.producer.channel.push(batch)
    }
    await this.startSimulation()
  }

  async simulateAtomStart() {
    const watcher = this._ensureAtomWatcher()
    await atomWatcher.stepsInitialState(watcher.state, watcher)
    await watcher.producer.scan('.')
    watcher.producer.channel.push([INITIAL_SCAN_DONE])
  }

  _ensureAtomWatcher() /*: atomWatcher.AtomWatcher */ {
    const { watcher } = this.side
    if (watcher instanceof atomWatcher.AtomWatcher) {
      return watcher
    } else {
      throw new Error('Can only use AtomWatcher test helpers with AtomWatcher')
    }
  }

  async readFile(path /*: string */) /*: Promise<string> */ {
    return this.syncDir.readFile(path)
  }
}

module.exports = {
  LocalTestHelpers
}
