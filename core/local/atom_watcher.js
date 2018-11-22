/* @flow */

const Promise = require('bluebird')

const checksumer = require('./checksumer')
const logger = require('../logger')

const LinuxProducer = require('./steps/linux_producer')
const AddInfos = require('./steps/add_infos')
const FilterIgnored = require('./steps/filter_ignored')
const InitialDiff = require('./steps/initial_diff')
const AddChecksum = require('./steps/add_checksum')
const Dispatch = require('./steps/dispatch')

const WinSource = require('./layers/win')
const ChecksumLayer = require('./layers/checksum')
const Dispatcher = require('./layers/dispatcher')

/*::
import type Pouch from '../pouch'
import type Prep from '../prep'
import type EventEmitter from 'events'
import type { Ignore } from '../ignore'
import type { Checksumer } from './checksumer'
import type { Runner } from './steps/linux_producer'
*/

const log = logger({
  component: 'AtomWatcher'
})

module.exports = class AtomWatcher {
  /*::
  syncPath: string
  prep: Prep
  pouch: Pouch
  events: EventEmitter
  ignore: Ignore
  checksumer: Checksumer
  runner: Runner
  running: Promise<void>
  _runningResolve: ?Function
  _runningReject: ?Function
  */

  constructor (syncPath /*: string */, prep /*: Prep */, pouch /*: Pouch */, events /*: EventEmitter */, ignore /*: Ignore */) {
    this.syncPath = syncPath
    this.prep = prep
    this.pouch = pouch
    this.events = events
    this.ignore = ignore
    this.checksumer = checksumer.init()

    if (process.platform === 'linux') {
      this.runner = new LinuxProducer(this)
      const linux = this.runner.buffer
      const infos = AddInfos(linux, this)
      const ignore = FilterIgnored(infos, this)
      const initialDiff = InitialDiff(ignore, this)
      const checksum = AddChecksum(initialDiff, this)
      Dispatch(checksum, this)
    } else if (process.platform === 'win32') {
      // TODO add a layer to detect moves
      // TODO do we need a debounce layer (a port of awaitWriteFinish of chokidar)?
      const dispatcher = new Dispatcher(prep, pouch, events)
      const checksumer = new ChecksumLayer(dispatcher, this.checksumer)
      this.runner = new WinSource(syncPath, checksumer)
    } else {
      throw new Error('The experimental watcher is not available on this platform')
    }
  }

  start () {
    log.debug('starting...')
    this.running = new Promise((resolve, reject) => {
      this._runningResolve = resolve
      this._runningReject = reject
    })
    this.runner.start()
    return new Promise((resolve) => {
      this.events.on('initial-scan-done', resolve)
    })
  }

  async stop (force /*: ? bool */) /*: Promise<*> */ {
    if (this._runningResolve) {
      this._runningResolve()
      this._runningResolve = null
    }
    this.runner.stop()
  }
}
