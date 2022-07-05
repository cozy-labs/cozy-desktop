/**
 * This is the {@link module:core/local/watcher|local watcher} implementation
 * based on the {@link https://github.com/atom/watcher|@atom/watcher} library.
 *
 * The watcher is built as a chain of steps. Each step can be seen as an actor
 * that communicates with the next one via a Channel. The first step is called
 * the producer: even if the chain is ready at the end of this constructor,
 * the producer won't start pushing batches of events until it is started.
 *
 * ## Windows
 *
 * [![Windows watcher workflow](../../doc/developer/win_watcher.png)](../../doc/developer/win_watcher.png)
 *
 * ## GNU/Linux
 *
 * [![GNU/Linux watcher workflow](../../doc/developer/linux_watcher.png)](../../doc/developer/linux_watcher.png)
 *
 * @module core/local/channel_watcher
 * @flow
 */

const Promise = require('bluebird')
const _ = require('lodash')

const checksumer = require('./../checksumer')
const Producer = require('./producer')
const addInfos = require('./add_infos')
const filterIgnored = require('./filter_ignored')
const fireLocatStartEvent = require('./fire_local_start_event')
const winDetectMove = require('./win_detect_move')
const winIdenticalRenaming = require('./win_identical_renaming')
const scanFolder = require('./scan_folder')
const awaitWriteFinish = require('./await_write_finish')
const initialDiff = require('./initial_diff')
const addChecksum = require('./add_checksum')
const incompleteFixer = require('./incomplete_fixer')
const overwrite = require('./overwrite')
const dispatch = require('./dispatch')
const logger = require('../../utils/logger')

/*::
import type { Config } from '../../config'
import type { Pouch } from '../../pouch'
import type Prep from '../../prep'
import type EventEmitter from 'events'
import type { Ignore } from '../../ignore'
import type { Checksumer } from '../checksumer'
import type { ChannelEventsDispatcher } from './dispatch'
import type { Scanner } from './producer'

type ChannelWatcherOptions = {
  config: Config,
  onChannelEvents?: ChannelEventsDispatcher,
  prep: Prep,
  pouch: Pouch,
  events: EventEmitter,
  ignore: Ignore
}
*/

const log = logger({
  component: 'ChannelWatcher'
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
  fireLocatStartEvent,
  only('win32', winIdenticalRenaming),
  only('win32', winDetectMove),
  scanFolder,
  awaitWriteFinish,
  initialDiff,
  addChecksum,
  incompleteFixer,
  overwrite,
  dispatch
])

/** The producer for the current platform. */
const producer = opts => {
  if (['linux', 'win32'].includes(process.platform)) {
    return new Producer(opts)
  } else {
    throw new Error('The channel watcher is not available on this platform')
  }
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

class ChannelWatcher {
  /*::
  config: Config
  pouch: Pouch
  events: EventEmitter
  checksumer: Checksumer
  producer: Producer
  state: Object
  running: Promise<void>
  _runningResolve: ?Function
  _runningReject: ?Function
  */

  constructor(opts /*: ChannelWatcherOptions */) {
    this.config = opts.config
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
    // Here, we build the chain of steps.
    steps.reduce(
      (chan, step) => step.loop(chan, stepOptions),
      this.producer.channel
    )
  }

  async start() {
    log.debug('starting...')

    await stepsInitialState(this.state, this)
    const scanDone = new Promise(resolve => {
      this.events.on('initial-scan-done', resolve)
    })
    await this.producer.start()
    await scanDone

    this.running = new Promise((resolve, reject) => {
      this._runningResolve = resolve
      // XXX: This rejecter is never used. How can the watcher fail? How to
      // catch those errors and feed them to this rejecter?
      this._runningReject = reject
    })
  }

  async stop() /*: Promise<*> */ {
    log.debug('stopping...')

    this.producer.stop()

    if (this._runningResolve) {
      this._runningResolve()
      this._runningResolve = null
    }
  }
}

module.exports = {
  ChannelWatcher,
  stepsInitialState
}
