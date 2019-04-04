/* @flow */

const Promise = require('bluebird')
const _ = require('lodash')

const checksumer = require('./checksumer')
const logger = require('../logger')

const Producer = require('./steps/producer')
const addInfos = require('./steps/add_infos')
const filterIgnored = require('./steps/filter_ignored')
const winDetectMove = require('./steps/win_detect_move')
const winIdenticalRenaming = require('./steps/win_identical_renaming')
const scanFolder = require('./steps/scan_folder')
const awaitWriteFinish = require('./steps/await_write_finish')
const initialDiff = require('./steps/initial_diff')
const addChecksum = require('./steps/add_checksum')
const incompleteFixer = require('./steps/incomplete_fixer')
const overwritingMove = require('./steps/overwriting_move')
const dispatch = require('./steps/dispatch')

/*::
import type Pouch from '../pouch'
import type Prep from '../prep'
import type EventEmitter from 'events'
import type { Ignore } from '../ignore'
import type { Checksumer } from './checksumer'
import type { AtomEventsDispatcher } from './steps/dispatch'
import type { Scanner } from './steps/producer'

type AtomWatcherOptions = {
  syncPath: string,
  onAtomEvents?: AtomEventsDispatcher,
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
const steps = _.compact([
  addInfos,
  filterIgnored,
  only('win32', winIdenticalRenaming),
  only('win32', winDetectMove),
  scanFolder,
  awaitWriteFinish,
  initialDiff,
  addChecksum,
  incompleteFixer,
  overwritingMove
])

/** The producer for the current platform. */
const producer = opts => {
  return new Producer(opts)
}

const stepsInitialState = (
  state /*: Object */,
  opts /*: * */
) /*: Promise<Object> */ =>
  Promise.reduce(
    steps,
    async (prevState, step) =>
      step.initialState
        ? _.assign(prevState, await step.initialState(opts))
        : prevState,
    state
  )

class AtomWatcher {
  /*::
  pouch: Pouch
  events: EventEmitter
  checksumer: Checksumer
  producer: Producer
  state: Object
  running: Promise<void>
  _runningResolve: ?Function
  _runningReject: ?Function
  */

  constructor(opts /*: AtomWatcherOptions */) {
    this.pouch = opts.pouch
    this.events = opts.events
    this.checksumer = checksumer.init()
    this.producer = producer(opts)
    this.state = {}

    const stepOptions = Object.assign(
      ({
        checksumer: this.checksumer,
        scan: this.producer.scan,
        state: this.state
      } /*: Object */),
      opts
    )
    // Here, we build a chain of steps. Each step can be seen as an actor that
    // communicates with the next one via a buffer. The first step is called
    // the producer: even if the chain is ready at the end of this constructor,
    // the producer won't start pushing batches of events until it is started.
    let buffer = steps.reduce(
      (buf, step) => step.loop(buf, stepOptions),
      this.producer.buffer
    )
    dispatch.loop(buffer, stepOptions)
  }

  async start() {
    log.debug('starting...')
    this.running = new Promise((resolve, reject) => {
      this._runningResolve = resolve
      this._runningReject = reject
    })
    this.events.emit('local-start')
    await stepsInitialState(this.state, this)
    this.producer.start()
    const scanDone = new Promise(resolve => {
      this.events.on('initial-scan-done', resolve)
    })
    scanDone.then(async () => {
      let target = -1
      try {
        target = (await this.pouch.db.changes({ limit: 1, descending: true }))
          .last_seq
      } catch (err) {
        log.warn({ err })
        /* ignore err */
      }
      this.events.emit('sync-target', target)
      this.events.emit('local-end')
    })
    return scanDone
  }

  async stop() /*: Promise<*> */ {
    log.debug('stopping...')
    if (this._runningResolve) {
      this._runningResolve()
      this._runningResolve = null
    }
    this.producer.stop()
  }
}

module.exports = {
  AtomWatcher,
  stepsInitialState
}
