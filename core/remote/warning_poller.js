/** Look for warnings on the Cozy.
 *
 * @module core/remote/warning_poller
 * @flow
 */

const { RemoteError } = require('./errors')
const delay = require('../utils/delay')
const logger = require('../utils/logger')

/*::
import type EventEmitter from 'events'
import type { RemoteCozy, Warning } from './cozy'
import type { Delay } from '../utils/delay'

type Mode = 'slow' | 'medium' | 'fast'
type Ticks = {next: Delay, rest: Delay[]}
*/

const log = logger({
  component: 'RemoteWarningPoller'
})

const MODE = {
  SLOW: 'slow',
  MEDIUM: 'medium',
  FAST: 'fast'
}

const DEFAULT_MODE = MODE.SLOW

function ticks(next /*: Delay */, ...rest /*: Delay[] */) /*: Ticks */ {
  return { next, rest }
}

const TICKS /*: { [Mode]: Ticks } */ = {
  [MODE.SLOW]: ticks(delay.days(1)),
  [MODE.MEDIUM]: ticks(delay.minutes(1))
}
TICKS[MODE.FAST] = ticks.apply(
  null,
  [5, 5, 5, 5, 5, 10, 10, 10, 20, 30, 40, 50, 60].map(delay.seconds)
)

const DEFAULT_TICKS = TICKS[DEFAULT_MODE]

function shiftTicks(ticks /*: Ticks */) /*: Ticks */ {
  if (ticks.rest.length === 0) return ticks
  const [next, ...rest] = ticks.rest
  return { next, rest }
}

class RemoteWarningPoller {
  /*::
  remoteCozy: RemoteCozy
  events: EventEmitter
  polling: ?Promise<*>
  timeout: *
  ticks: Ticks
  */

  constructor(remoteCozy /*: RemoteCozy */, events /*: EventEmitter */) {
    this.remoteCozy = remoteCozy
    this.events = events
    this.ticks = DEFAULT_TICKS
  }

  async poll() {
    if (this.polling) {
      log.warn('Skipping polling (already in progress)')
      this.scheduleNext(this.ticks)
      return
    }

    try {
      log.info('Looking for warnings...')
      this.polling = this.remoteCozy.warnings()
      const warnings /*: Warning[] */ = await this.polling

      log.info(`${warnings.length} warnings`)
      if (warnings.length > 0) log.trace({ warnings })

      for (const warning of warnings) {
        const err = RemoteError.fromWarning(warning)
        this.events.emit('user-action-required', err)
      }
    } catch (err) {
      log.warn({ err }, 'could not fetch remote warnings')
    } finally {
      this.polling = null
      this.scheduleNext(shiftTicks(this.ticks))
    }
  }

  async start() {
    await this.poll()
  }

  async stop() {
    clearTimeout(this.timeout)
    await this.polling
  }

  scheduleNext(ticks /*: Ticks */) {
    clearTimeout(this.timeout)
    this.ticks = ticks
    this.timeout = setTimeout(() => {
      this.poll()
    }, ticks.next)
    log.debug({ ticks }, `Next polling in ${ticks.next} milliseconds`)
  }

  switchMode(mode /*: Mode */) {
    log.info({ mode })
    const newTicks = TICKS[mode]
    if (newTicks.next < this.ticks.next) {
      this.scheduleNext(newTicks)
    } else {
      log.warn('Sticking up to current mode')
    }
  }
}

module.exports = {
  DEFAULT_TICKS,
  MODE,
  TICKS,
  RemoteWarningPoller,
  shiftTicks,
  ticks
}
