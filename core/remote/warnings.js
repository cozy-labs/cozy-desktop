/* @flow */

import type cozy from 'cozy-client-js'

const EventEmitter = require('events')
const logger = require('../logger')

const log = logger({
  component: 'RemoteWriter'
})

const POLLING_DELAY = 1000 * 60 * 60 * 24

export type Warning = {
  error: string,
  title: string,
  details: string,
  links: {
    action: string
  }
}

class Poller {
  cozy: cozy.Client
  events: EventEmitter
  interval: *
  currentPolling: ?Promise<*>

  constructor (cozy: cozy.Client, events: EventEmitter) {
    this.cozy = cozy
    this.events = events
  }

  async poll () {
    log.info('Looking for warnings...')
    let warnings: Warning[] = []
    try {
      this.currentPolling = this.cozy.fetchJSON('GET', '/settings/warnings')
      warnings = await this.currentPolling
      log.info(`Found ${warnings.length} warning(s)`)
    } catch (err) {
      if (err.status === 404) {
        log.warn('/settings/warnings API is not available on this cozy stack.')
        log.info('Assuming no warnings.')
      } else {
        log.error({err}, '/settings/warnings')
      }
    }
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
  Poller,
  POLLING_DELAY
}
