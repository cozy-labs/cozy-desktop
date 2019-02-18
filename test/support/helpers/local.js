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
const { TMP_DIR_NAME } = require('../../../core/local/constants')
const dispatch = require('../../../core/local/steps/dispatch')

const rimrafAsync = Promise.promisify(rimraf)

/*::
import type { LocalOptions } from '../../../core/local'
import type { ChokidarEvent } from '../../../core/local/chokidar_event'
import type { Batch } from '../../../core/local/steps/event'
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

  constructor (opts /*: LocalOptions */) {
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

  get syncPath () /*: string */ {
    return path.normalize(this.side.syncPath)
  }

  get trashPath () /*: string */ {
    return path.join(this.side.tmpPath, '.test-trash')
  }

  async clean () {
    for (const pattern of ['*', '.*']) {
      await rimrafAsync(path.join(this.syncPath, pattern))
    }
  }

  async trashFunc (paths /*: string[] */) /*: Promise<void> */ {
    for (const src of paths) {
      const dst = path.join(this.trashPath, path.basename(src))
      try {
        await fse.rename(src, dst)
      } catch (err) {
        throw err
      }
    }
  }

  async setupTrash () {
    await fse.emptyDir(this.trashPath)
    this.trashDir = new ContextDir(this.trashPath)
    this.side._trash = this.trashFunc
  }

  async tree (opts /*: {ellipsize: boolean} */ = {ellipsize: true}) /*: Promise<string[]> */ {
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
    const ellipsizeDate = opts.ellipsize ? conflictHelpers.ellipsizeDate : _.identity
    return trashContents
      .map(relPath => path.posix.join('/Trash', relPath))
      .concat(await this.syncDir.tree())
      .map(ellipsizeDate)
      .filter(relpath => !relpath.match(TMP_DIR_NAME))
      .sort()
  }

  async scan () {
    await this.side.watcher.start()
    await this.side.watcher.stop()
  }

  async treeWithoutTrash () {
    return (await this.tree())
      .filter(p => !p.startsWith('/Trash/'))
  }

  async simulateEvents (events /*: ChokidarEvent[] */) {
    // $FlowFixMe
    return this.side.watcher.onFlush(events)
  }

  async startSimulation () {
    return new Promise((resolve, reject) => {
      this._resolveSimulation = resolve
      this.side.watcher.start()
    })
  }

  isSimulationEnd (batch /*: Batch */) {
    const { _resolveSimulation } = this
    return _resolveSimulation && _.isEqual(batch, simulationCompleteBatch)
  }

  async stopSimulation () {
    this._resolveSimulation && this._resolveSimulation()
    delete this._resolveSimulation
    this.side.watcher.stop()
  }

  dispatchAtomEvents (batch /*: Batch */) {
    if (this.isSimulationEnd(batch)) {
      this.stopSimulation()
      return []
    } else {
      return dispatch.step(this.side)(batch)
    }
  }

  simulateAtomEvents (batches /*: Batch[] */) {
    for (const batch of batches.concat([simulationCompleteBatch])) {
      // $FlowFixMe
      this.side.watcher.producer.buffer.push(batch)
    }
    return this.startSimulation()
  }

  async readFile (path /*: string */) /*: Promise<string> */ {
    return this.syncDir.readFile(path)
  }
}

module.exports = {
  LocalTestHelpers
}
