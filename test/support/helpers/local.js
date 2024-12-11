/* @flow */

const path = require('path')

const autoBind = require('auto-bind')
const Promise = require('bluebird')
const fse = require('fs-extra')
const _ = require('lodash')
const rimraf = require('rimraf')

const conflictHelpers = require('./conflict')
const { ContextDir } = require('./context_dir')
const { Local } = require('../../../core/local')
const channelWatcher = require('../../../core/local/channel_watcher')
const dispatch = require('../../../core/local/channel_watcher/dispatch')
const {
  INITIAL_SCAN_DONE
} = require('../../../core/local/channel_watcher/event')
const { TMP_DIR_NAME } = require('../../../core/local/constants')

const rimrafAsync = Promise.promisify(rimraf)

/*::
import type { Ignore } from '../../../core/ignore'
import type { LocalOptions } from '../../../core/local'
import type { ChokidarEvent } from '../../../core/local/chokidar/event'
import type { ChannelBatch } from '../../../core/local/channel_watcher/event'
*/

const simulationCompleteEvent = {
  action: 'test-simulation-complete',
  kind: 'magic',
  path: ''
}

class LocalTestHelpers {
  /*::
  ignore: Ignore
  side: Local
  syncDir: ContextDir
  trashDir: ContextDir
  _resolveSimulation: ?() => void
  */

  constructor(opts /*: $Shape<LocalOptions> */) {
    const localOptions /*: LocalOptions */ = Object.assign(
      ({
        onChannelEvents: this.dispatchChannelEvents.bind(this),
        sendToTrash: this.sendToTrash.bind(this)
      } /*: Object */),
      opts
    )
    this.ignore = opts.ignore
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

  isIgnored(
    relativePath /*: string */,
    isFolder /*: boolean */
  ) /*: boolean */ {
    return this.ignore.isIgnored({ relativePath, isFolder })
  }

  async clean() {
    for (const pattern of ['*', '.*']) {
      await rimrafAsync(path.join(this.syncPath, pattern))
    }
  }

  async sendToTrash(src /*: string */) /*: Promise<void> */ {
    const dst = path.join(this.trashPath, path.basename(src))
    await fse.rename(src, dst)
  }

  async setupTrash() {
    await fse.emptyDir(this.trashPath)
    this.trashDir = new ContextDir(this.trashPath)
  }

  async trash({ withIno = false } /*: { withIno?: boolean } */ = {}) {
    return withIno
      ? await this.trashDir.treeWithIno()
      : await this.trashDir.tree()
  }

  async tree({
    ellipsize = true,
    withIno = false
  } /*: { ellipsize?: boolean, withIno?: boolean } */ = {}) {
    let trashContents
    try {
      trashContents = await this.trash({ withIno })
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
      throw new Error(
        'You must call and await helpers.local.setupTrash() (e.g. in a ' +
          'beforeEach block) before calling helpers.local.tree() in a test'
      )
    }

    const syncDirContent = withIno
      ? await this.syncDir.treeWithIno()
      : await this.syncDir.tree()

    const ellipsizeDate = ellipsize ? conflictHelpers.ellipsizeDate : _.identity

    return withIno
      ? trashContents
          .map(({ ino, fileid, path: relPath }) => ({
            ino,
            fileid,
            path: path.posix.join('/Trash', relPath)
          }))
          .concat(syncDirContent)
          .map(({ ino, fileid, path: relPath }) => ({
            ino,
            fileid,
            path: ellipsizeDate(relPath)
          }))
          .filter(({ path }) => !path.match(TMP_DIR_NAME))
          .sort((a, b) => {
            if (a.path < b.path) return -1
            if (a.path > b.path) return 1
            return 0
          })
      : trashContents
          .map(relPath => path.posix.join('/Trash', relPath))
          .concat(syncDirContent)
          .map(ellipsizeDate)
          .filter(relpath => !relpath.match(TMP_DIR_NAME))
          .sort()
  }

  async scan() {
    await this.side.watcher.start()
    await this.side.watcher.stop()
  }

  async treeWithoutTrash({
    withIno = false
  } /*: { withIno?: boolean } */ = {}) {
    return withIno
      ? (await this.tree({ withIno })).filter(
          p => !p.path.startsWith('/Trash/')
        )
      : (await this.tree()).filter(p => !p.startsWith('/Trash/'))
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

  isSimulationEnd(batch /*: ChannelBatch */) {
    const { _resolveSimulation } = this
    return _resolveSimulation && _.includes(batch, simulationCompleteEvent)
  }

  stopSimulation() {
    const { _resolveSimulation } = this
    _resolveSimulation && _resolveSimulation()
    delete this._resolveSimulation
  }

  dispatchChannelEvents(batch /*: ChannelBatch */) {
    const watcher = this._ensureChannelWatcher()
    const stepOptions = Object.assign(
      ({
        config: watcher.config,
        checksumer: watcher.checksumer,
        scan: watcher.producer.scan,
        state: watcher.state
      } /*: Object */),
      this.side
    )
    const dispatched = dispatch.step(stepOptions)(batch)

    if (this.isSimulationEnd(batch)) {
      this.stopSimulation()
    }

    return dispatched
  }

  /** Usage:
   *
   * - `#simulateChannelWatcherStart()`
   * - Fill in the test Pouch / sync dir
   * - `#simulateChannelEvents()`
   */
  async simulateChannelEvents(batches /*: ChannelBatch[] */) {
    const watcher = this._ensureChannelWatcher()
    for (const batch of batches.concat([[simulationCompleteEvent]])) {
      // $FlowFixMe
      watcher.producer.channel.push(batch)
    }
    await this.startSimulation()
  }

  async simulateChannelWatcherStart() {
    const watcher = this._ensureChannelWatcher()
    await channelWatcher.stepsInitialState(watcher.state, watcher)
    const scanDone = new Promise(resolve => {
      watcher.events.on('initial-scan-done', resolve)
    })
    await watcher.producer.scan('.')
    watcher.producer.channel.push([INITIAL_SCAN_DONE])
    await scanDone
  }

  _ensureChannelWatcher() /*: channelWatcher.ChannelWatcher */ {
    const { watcher } = this.side
    if (watcher instanceof channelWatcher.ChannelWatcher) {
      return watcher
    } else {
      throw new Error(
        'Can only use ChannelWatcher test helpers with ChannelWatcher'
      )
    }
  }

  async readFile(path /*: string */) /*: Promise<string> */ {
    return this.syncDir.readFile(path)
  }
}

module.exports = {
  LocalTestHelpers
}
