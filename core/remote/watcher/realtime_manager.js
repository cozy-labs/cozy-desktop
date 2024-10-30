/**
 * @module core/remote/watcher/realtime_manager
 * @flow
 */

const http = require('http')
const https = require('https')
const _ = require('lodash')
const autoBind = require('auto-bind')
const { RealtimePlugin } = require('cozy-realtime')

const { logger } = require('../../utils/logger')
const { MILLISECONDS, SECONDS } = require('../../utils/time')
const { FILES_DOCTYPE } = require('../constants')
const remoteErrors = require('../errors')

/*::
import type { CozyClient } from 'cozy-client'
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
  realtime: CozyRealtime
  eventHandler: (any) => any
  reconnectTimeout: ?TimeoutID
  options: RealtimeManagerOptions
  realtimeLogsAdded: boolean
  */

  constructor({
    events: {
      debounceTime = 200 * MILLISECONDS,
      maxWaitTime = 5 * SECONDS
    } = {},
    reconnectionDelay = 10 * SECONDS
  } /*: RealtimeManagerOptions */ = {}) {
    this.options = { events: { debounceTime, maxWaitTime }, reconnectionDelay }

    autoBind(this)
  }

  setup(
    {
      client,
      eventHandler
    } /*: { client: CozyClient, eventHandler: (any) => any } */
  ) {
    if (this.realtime != null) {
      return
    }

    try {
      client.registerPlugin(RealtimePlugin, {
        createWebSocket: (url, doctype) =>
          new global.WebSocket(url, doctype, {
            agent: url.startsWith('wss:') ? https.globalAgent : http.globalAgent
          }),
        logger: logger({ component: 'RemoteWatcher:CozyRealtime' })
      })

      this.realtime = client.plugins.realtime.realtime
      // Add logs to `disconnected` event as `cozy-realtime` doesn't log anything
      // when emitting this event.
      this.realtime.on('disconnected', () =>
        log.info('realtime websocket disconnected')
      )
      this.realtime.on('error', this.onError)

      this.setEventHandler(eventHandler)
    } catch (err) {
      log.error('failed to setup RealtimeManager', { err, sentry: true })
    }
  }

  async start() {
    log.info('Starting realtime manager...')

    if (this.realtime == null) {
      log.warn(
        'could not start RealtimeManager without realtime. Have you called setup?'
      )
      return
    }

    log.debug('Subscribing to realtime events...')
    this.realtime.subscribe('created', FILES_DOCTYPE, this.onCreated)
    this.realtime.subscribe('updated', FILES_DOCTYPE, this.onUpdated)
    this.realtime.subscribe('deleted', FILES_DOCTYPE, this.onDeleted)
    log.debug('Subscribed to realtime events')

    try {
      await this.realtime.waitForSocketReady()
    } catch (err) {
      this.onError(err)

      const delay = this.options.reconnectionDelay
      log.trace(`Will retry starting realtime in ${delay} ms`)
      this.reconnectTimeout = setTimeout(this.start, delay)

      return
    }

    log.debug('Realtime manager started')
  }

  async stop() {
    log.info('Stopping realtime manager...')

    clearTimeout(this.reconnectTimeout)

    if (this.realtime == null) {
      log.warn(
        'could not stop RealtimeManager without realtime. Have you called setup?'
      )
      return
    }

    log.debug('Unsubscribing from realtime events...')
    this.realtime.unsubscribe('created', FILES_DOCTYPE, this.onCreated)
    this.realtime.unsubscribe('updated', FILES_DOCTYPE, this.onUpdated)
    this.realtime.unsubscribe('deleted', FILES_DOCTYPE, this.onDeleted)
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
    log.debug('received event', { path: doc.path, event })
    return this.eventHandler()
  }

  onError(err /*: Error */) {
    if (err) {
      const wrapped = remoteErrors.wrapError(err)
      log.error('error', { err: wrapped })
    }
  }
}

module.exports = {
  RealtimeManager
}
