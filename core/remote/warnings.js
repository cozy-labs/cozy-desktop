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
  detail: string,
  links: {
    self: string
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
      await this.cozy.fetchJSON('GET', '/settings/warnings')
      log.info(`No warnings`)
    } catch (err) {
      if (err.status === 402) {
        log.info(`Some warnings`)
        try {
          const parsed = JSON.parse(err.message)
          warnings = parsed.errors
          log.info(`${warnings.length} warnings`)
        } catch (err) {
          log.error({err}, 'Wrongly formatted warnings')
        }
      } else {
        log.warn({err}, '/settings/warnings API is not available.')
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

function includeJSONintoError (err: Error) {
  let err2 = err
  try {
    const parsed = JSON.parse(err.message)
    err2 = Object.assign(new Error('User action required'), parsed[0])
    err2.status = parseInt(err2.status)
  } catch (err) {
    log.error({err}, 'Wrongly formatted error')
  }
  return err2
}

module.exports = {
  Poller,
  POLLING_DELAY,
  includeJSONintoError
}
