/* @flow */

const Promise = require('bluebird')
const _ = require('lodash')

const checksumer = require('./checksumer')
const logger = require('../logger')

const LinuxProducer = require('./steps/linux_producer')
const WinProducer = require('./steps/win_producer')
const addInfos = require('./steps/add_infos')
const filterIgnored = require('./steps/filter_ignored')
const winDetectMove = require('./steps/win_detect_move')
const scanFolder = require('./steps/scan_folder')
const awaitWriteFinish = require('./steps/await_write_finish')
const initialDiff = require('./steps/initial_diff')
const addChecksum = require('./steps/add_checksum')
const incompleteFixer = require('./steps/incomplete_fixer')
const dispatch = require('./steps/dispatch')

/*::
import type Pouch from '../pouch'
import type Prep from '../prep'
import type EventEmitter from 'events'
import type { Ignore } from '../ignore'
import type { Checksumer } from './checksumer'
import type {
  Producer,
  Scanner
} from './steps/producer'

type AtomWatcherOptions = {
  syncPath: string,
  prep: Prep,
  pouch: Pouch,
  events: EventEmitter,
  ignore: Ignore
}
*/

const log = logger({
  component: 'AtomWatcher'
})

/** Returns the step only when the given platform matches the current one.
 *
 * Makes it easy to include a step only for some platform.
 */
const only = (platform, step) => platform === process.platform && step

/** The steps for the current platform. */
const steps =
  _.compact([
    addInfos,
    filterIgnored,
    only('win32', winDetectMove),
    scanFolder,
    awaitWriteFinish,
    initialDiff,
    addChecksum,
    incompleteFixer
  ])

/** The producer for the current platform. */
const producer = opts => {
  if (process.platform === 'linux') {
    return new LinuxProducer(opts)
  } else if (process.platform === 'win32') {
    return new WinProducer(opts)
  } else {
    throw new Error('The experimental watcher is not available on this platform')
  }
}

module.exports = class AtomWatcher {
  /*::
  syncPath: string
  prep: Prep
  pouch: Pouch
  events: EventEmitter
  ignore: Ignore
  checksumer: Checksumer
  producer: Producer
  scan: Scanner
  running: Promise<void>
  _runningResolve: ?Function
  _runningReject: ?Function
  */

  constructor ({syncPath, prep, pouch, events, ignore} /*: AtomWatcherOptions */) {
    this.syncPath = syncPath
    this.prep = prep
    this.pouch = pouch
    this.events = events
    this.ignore = ignore
    this.checksumer = checksumer.init()
    this.producer = producer({syncPath})
    this.scan = this.producer.scan
    // Here, we build a chain of steps. Each step can be seen as an actor that
    // communicates with the next one via a buffer. The first step is called
    // the producer: even if the chain is ready at the end of this constructor,
    // the producer won't start pushing batches of events until it is started.
    let buffer = steps.reduce((buf, step) => step.loop(buf, this), this.producer.buffer)
    dispatch.loop(buffer, this)
  }

  start () {
    log.debug('starting...')
    this.running = new Promise((resolve, reject) => {
      this._runningResolve = resolve
      this._runningReject = reject
    })
    this.events.emit('local-start')
    this.producer.start()
    const scanDone = new Promise((resolve) => {
      this.events.on('initial-scan-done', resolve)
    })
    scanDone.then(async () => {
      let target = -1
      try {
        target = (await this.pouch.db.changes({limit: 1, descending: true})).last_seq
      } catch (err) { /* ignore err */ }
      this.events.emit('sync-target', target)
      this.events.emit('local-end')
    })
    return scanDone
  }

  async stop (force /*: ? bool */) /*: Promise<*> */ {
    log.debug('stopping...')
    if (this._runningResolve) {
      this._runningResolve()
      this._runningResolve = null
    }
    this.producer.stop()
  }
}
