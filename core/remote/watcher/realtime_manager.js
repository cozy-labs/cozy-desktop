/**
 * @module core/remote/watcher/realtime_manager
 * @flow
 */

const _ = require('lodash')
const autoBind = require('auto-bind')

const logger = require('../../utils/logger')
const { MILLISECONDS, SECONDS } = require('../../utils/time')
const { FILES_DOCTYPE } = require('../constants')
const remoteErrors = require('../errors')

/*::
import type { CozyRealtime } from 'cozy-realtime'

import type { RemoteCozy } from '../cozy'
import type { CouchDBDoc } from '../document'

export type RealtimeEvent = 'created' | 'updated' | 'deleted'
export type RealtimeManagerOptions = {
  events: {
    debounceTime: number,
    maxWaitTime: number,
  },
  reconnectionDelay: number,
}
*/

const log = logger({
  component: 'RemoteWatcher:RealtimeManager'
})

class RealtimeManager {
  /*::
  remoteCozy: RemoteCozy
  eventHandler: (any) => any
  reconnectTimeout: ?TimeoutID
  options: RealtimeManagerOptions
  realtimeLogsAdded: boolean
  */

  constructor(
    remoteCozy /*: RemoteCozy */,
    eventHandler /*: (any) => any */,
    {
      events: {
        debounceTime = 200 * MILLISECONDS,
        maxWaitTime = 5 * SECONDS
      } = {},
      reconnectionDelay = 10 * SECONDS
    } /*: RealtimeManagerOptions */ = {}
  ) {
    this.remoteCozy = remoteCozy
    this.options = { events: { debounceTime, maxWaitTime }, reconnectionDelay }
    this.setEventHandler(eventHandler)

    this.reconnectTimeout = null
    this.realtimeLogsAdded = false

    autoBind(this)
  }

  async start() {
    log.debug('Subscribing to realtime events...')
    try {
      const realtime = await this.remoteCozy.realtime()

      if (this.shouldAddRealtimeLogs()) this.addRealtimeLogs(realtime)

      await Promise.all([
        realtime.subscribe('created', FILES_DOCTYPE, this.onCreated),
        realtime.subscribe('updated', FILES_DOCTYPE, this.onUpdated),
        realtime.subscribe('deleted', FILES_DOCTYPE, this.onDeleted)
      ])
      log.debug('Subscribed to realtime events')
    } catch (err) {
      this.onError(err)
    }
  }

  async stop() {
    clearTimeout(this.reconnectTimeout)

    log.debug('Unsubscribing from realtime events...')
    const realtime = await this.remoteCozy.realtime()
    await Promise.all([
      realtime.unsubscribe('created', FILES_DOCTYPE, this.onCreated),
      realtime.unsubscribe('updated', FILES_DOCTYPE, this.onUpdated),
      realtime.unsubscribe('deleted', FILES_DOCTYPE, this.onDeleted)
    ])
    log.debug('Unsubscribed from realtime events')
  }

  setEventHandler(handler /*: () => any */) {
    this.eventHandler = _.debounce(handler, this.options.events.debounceTime, {
      leading: true,
      trailing: true,
      maxWait: this.options.events.maxWaitTime
    })
  }

  onCreated(doc /*: CouchDBDoc */) {
    return this.onEvent('created', doc)
  }

  onUpdated(doc /*: CouchDBDoc */) {
    return this.onEvent('updated', doc)
  }

  onDeleted(doc /*: CouchDBDoc */) {
    return this.onEvent('deleted', doc)
  }

  onEvent(event /*: RealtimeEvent */, doc /*: CouchDBDoc */) {
    log.debug({ path: doc.path, event }, 'received event')
    return this.eventHandler()
  }

  onError(err /*: Error */) {
    const wrapped = remoteErrors.wrapError(err)
    log.error({ err: wrapped }, 'error')

    switch (wrapped.code) {
      case remoteErrors.UNREACHABLE_COZY_CODE:
      case remoteErrors.UNKNOWN_REMOTE_ERROR_CODE:
      case remoteErrors.REMOTE_MAINTENANCE_ERROR_CODE:
      case remoteErrors.USER_ACTION_REQUIRED_CODE:
        this.reconnectTimeout = setTimeout(
          this.start,
          this.options.reconnectionDelay
        )
        break
      default:
        throw wrapped
    }
  }

  shouldAddRealtimeLogs() {
    return !this.realtimeLogsAdded
  }

  addRealtimeLogs(cozyRealtime /*: CozyRealtime */) {
    cozyRealtime.on('ready', () => log.debug('realtime websocket ready'))
    cozyRealtime.on('start', () => log.debug('realtime websocket started'))
    cozyRealtime.on('disconnected', () =>
      log.debug('realtime websocket disconnected')
    )
    cozyRealtime.on('close', () => log.debug('realtime websocket closed'))
    cozyRealtime.on('error', err =>
      log.debug({ err }, 'realtime websocket error')
    )

    this.realtimeLogsAdded = true
  }
}

module.exports = {
  RealtimeManager
}
