/* @flow */

import type { Warning } from './warning'

const EventEmitter = require('events')
const RemoteCozy = require('./cozy')
const logger = require('../logger')

const log = logger({
  component: 'RemoteWarningPoller'
})

const POLLING_DELAY = 1000 * 60 * 60 * 24

class RemoteWarningPoller {
  remoteCozy: RemoteCozy
  events: EventEmitter
  interval: *
  currentPolling: ?Promise<*>

  constructor (remoteCozy: RemoteCozy, events: EventEmitter) {
    this.remoteCozy = remoteCozy
    this.events = events
  }

  async poll () {
    log.info('Looking for warnings...')
    const warnings: Warning[] = await this.remoteCozy.warnings()

    log.info(`${warnings.length} warnings`)
    if (warnings.length > 0) {
      this.events.emit('remoteWarnings', warnings)
      log.trace({warnings})
    }
    this.currentPolling = null
  }

  async start () {
    this.poll()
    this.interval = setInterval(this.poll, POLLING_DELAY)
    await this.currentPolling
  }

  async stop () {
    clearInterval(this.interval)
    await this.currentPolling
  }
}

module.exports = {
  POLLING_DELAY,
  RemoteWarningPoller
}
