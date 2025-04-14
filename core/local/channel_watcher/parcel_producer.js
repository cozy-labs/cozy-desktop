/**
 * @module core/local/channel_watcher/parcel_producer
 * @flow
 */

const path = require('path')

const parcel = require('@parcel/watcher')
const autoBind = require('auto-bind')
const Promise = require('bluebird')

const Channel = require('./channel')
const { INITIAL_SCAN_DONE } = require('./event')
const { logger } = require('../../utils/logger')
const { measureTime } = require('../../utils/perfs')

/*::
import type { Config } from '../../config'
import type { Ignore } from '../../ignore'
import type { ChannelEvent } from './event'
import type { Stats } from '../stater'
import type EventEmitter from 'events'
import type { Event as ParcelEvent } from '@parcel/watcher'

export type Scanner = (string, ?{ readdir?: *, stater?: * }) => Promise<void>
*/

const log = logger({
  component: 'ChannelWatcher/Producer'
})

const isIgnored = ({ path, kind }, ignore) =>
  ignore.isIgnored({
    relativePath: path,
    isFolder: kind === 'directory'
  })

const backend =
  process.platform === 'linux'
    ? 'inotify'
    : process.platform === 'win32'
    ? 'windows'
    : 'fs-events'

/**
 * This class is a producer: it watches the filesystem and the events are
 * created here.
 *
 * On Windows:
 *   the API used for FS notifications is ReadDirectoryChangesW. It is
 *   recursive and works without too many darts.
 *
 *   Another important thing to know is that we need to scan added directories: if
 *   the directory was restored from the trash or moved from outside the watched
 *   directory, ReadDirectoryChangesW won't send us events for the files and
 *   sub-directories.
 *
 * On Linux:
 *   the API used for FS notifications is inotify and is not recursive. It
 *   means that we have to add a watcher when we a new directory is added (and to
 *   remove a watcher when a watched directory is removed).
 */
class Producer {
  /*::
  channel: Channel
  config: Config
  ignore: Ignore
  events: EventEmitter
  watcher: *
  scan: Scanner
  initialScanDone: boolean
  */
  constructor(
    opts /*: { config: Config, ignore: Ignore, events: EventEmitter } */
  ) {
    this.channel = new Channel()
    this.config = opts.config
    this.ignore = opts.ignore
    this.events = opts.events
    this.watcher = null
    this.initialScanDone = false
    autoBind(this)
  }

  /**
   * @parcel/watcher watches directories recursively, even on Linux. It just
   * calls inotify on each sub-directory.
   *
   * This has some pros and cons:
   *
   * - Pro: we don't have to explicitely manage the inotify watchers on Linux
   * - Pro: move/rename detection is done by @parcel/watcher
   * - Con: the sync dir must be scanned twice on Linux, once by @parcel/watcher
   *   to put the inotify watchers, and once by Producer for the initial scan
   * - Con: when a new directory is detected, we must scan it twice on Linux,
   *   once by @parcel/watcher to put inotify watchers on sub-directories that
   *   can have been added faster that the event has bubbled, and once by the
   *   local watcher (because it can be a directory that has been moved from
   *   outside the synchronized directory, and @parcel/watcher doesn't emit
   *   events for its content in that case).
   */
  async start() {
    log.info('Starting producer...')

    await this.subscribe()

    this.events.emit('buffering-start')

    await this.scan('')

    this.channel.push([INITIAL_SCAN_DONE])
    this.initialScanDone = true
    log.info('Folder scan done')

    this.events.emit('buffering-end')
  }

  async resume() {
    log.info('Resuming producer...')

    await this.subscribe()
  }

  async suspend() {
    log.info('Suspending producer...')

    await this.unsubscribe()
  }

  async stop() {
    log.info('Stopping producer...')

    await this.unsubscribe()
  }

  async subscribe() {
    if (!this.watcher) {
      this.watcher = await parcel.subscribe(
        this.config.syncPath,
        async (err, events) => {
          // FIXME: use async queue to run processEvents calls in order
          await this.processEvents(events)
        },
        { backend }
      )
    }
    if (!this.watcher) throw new Error('Could not start @parcel/watcher')
  }

  async unsubscribe() {
    if (this.watcher) {
      await this.watcher.unsubscribe()
      // XXX: unsubscribe() resolves before it was actually finished
      await Promise.delay(1000)
      this.watcher = null
    }
  }

  async scan(relPath /*: string */) {
    const stopParcelScanMeasure = measureTime('Parcel#scan')
    const scanEvents = await parcel.scan(
      path.join(this.config.syncPath, relPath),
      { backend }
    )
    stopParcelScanMeasure()

    await this.processEvents(scanEvents, { fromScan: true })
  }

  async buildEvent(
    event /*: ParcelEvent */,
    { fromScan = false } /*: { fromScan: boolean } */
  ) /*: Promise<?ChannelEvent> */ {
    // Completely skip events for Desktop's temporary files
    if (event.path === this.config.syncPath) {
      return null
    }
    if (/(^|[/\\])\.system-tmp-(cozy-drive|twake-desktop)/.test(event.path)) {
      return null
    }

    const relativePath = path.relative(this.config.syncPath, event.path)
    const kind = event.kind
    const ino = event.fileId ? event.fileId : event.ino && Number(event.ino)

    if (isIgnored({ path: relativePath, kind }, this.ignore)) {
      return { action: 'ignored', kind, path: relativePath, ino }
    } else if (event.type === 'delete') {
      return { action: 'deleted', kind, path: relativePath, deletedIno: ino }
    } else if (event.type === 'update') {
      return { action: 'modified', kind, path: relativePath, ino }
    } else if (event.type === 'rename') {
      const relativeOldPath = event.oldPath
        ? path.relative(this.config.syncPath, event.oldPath)
        : ''
      return {
        action: 'renamed',
        kind,
        oldPath: relativeOldPath,
        path: relativePath,
        ino
      }
    } else if (this.initialScanDone && !fromScan) {
      return { action: 'created', kind, path: relativePath, ino }
    } else {
      return { action: 'scan', kind, path: relativePath, ino }
    }
  }

  async processEvents(
    events /*: ParcelEvent[] */,
    { fromScan = false } /*: { fromScan: boolean } */ = {}
  ) {
    const batch = await Promise.all(
      events.map(event => this.buildEvent(event, { fromScan }))
    ).filter(event => event != null && event.action !== 'ignored')

    if (batch.length > 0) {
      log.trace('process', { batch })
      this.channel.push(batch)
    }
  }
}

module.exports = Producer
