/**
 * This is the {@link module:core/local/watcher|local watcher} implementation
 * based on the {@link https://github.com/paulmillr/chokidar|chokidar} library.
 *
 * It's a library that uses nodejs' watch powered by inotify/fsevents (with a
 * fallback on polling).
 *
 * ## Steps
 *
 * 1. {@link module:core/local/chokidar/initial_scan|initial_scan}
 * 2. {@link module:core/local/chokidar/prepare_events|prepare_events}
 * 3. {@link module:core/local/chokidar/analysis|analysis} (macro step)
 * 4. {@link module:core/local/chokidar/send_to_prep|send_to_prep}
 *
 * @module core/local/chokidar/watcher
 * @flow
 */

const autoBind = require('auto-bind')
const Promise = require('bluebird')
const chokidar = require('chokidar')
const path = require('path')

const analysis = require('./analysis')
const checksumer = require('../checksumer')
const chokidarEvent = require('./event')
const LocalEventBuffer = require('./event_buffer')
const initialScan = require('./initial_scan')
const normalizePaths = require('./normalize_paths')
const prepareEvents = require('./prepare_events')
const sendToPrep = require('./send_to_prep')
const stater = require('../stater')
const syncDir = require('../sync_dir')
const logger = require('../../utils/logger')

/*::
import type { Pouch } from '../../pouch'
import type Prep from '../../prep'
import type { Checksumer } from '../checksumer'
import type { ChokidarEvent } from './event'
import type { InitialScan } from './initial_scan'
import type { LocalEvent } from './local_event'
import type { LocalChange } from './local_change'
import type EventEmitter from 'events'
import fs from 'fs'
*/

const log = logger({
  component: 'ChokidarWatcher'
})
log.chokidar = log.child({
  component: 'Chokidar'
})

/**
 * This file contains the filesystem watcher that will trigger operations when
 * a file or a folder is added/removed/changed locally.
 * Operations will be added to the a common operation queue along with the
 * remote operations triggered by the remoteEventWatcher.
 */
class LocalWatcher {
  /*::
  syncPath: string
  prep: Prep
  pouch: Pouch
  events: EventEmitter
  initialScan: ?InitialScan
  checksumer: Checksumer
  watcher: any // chokidar
  buffer: LocalEventBuffer<ChokidarEvent>
  pendingChanges: LocalChange[]
  running: Promise<void>
  _runningResolve: ?Function
  _runningReject: ?Function
  */

  constructor(
    syncPath /*: string */,
    prep /*: Prep */,
    pouch /*: Pouch */,
    events /*: EventEmitter */
  ) {
    this.syncPath = syncPath
    this.prep = prep
    this.pouch = pouch
    this.events = events
    this.checksumer = checksumer.init()
    this.pendingChanges = []

    // XXX: this.onFlush must be bound before being passed to LocalEventBuffer
    autoBind(this)

    // TODO: Read from config
    const timeoutInMs = process.env.NODE_ENV === 'test' ? 2000 : 10000
    this.buffer = new LocalEventBuffer(timeoutInMs, async rawEvents => {
      try {
        await this.onFlush(rawEvents)
      } catch (err) {
        log.error({ err, sentry: true }, 'fatal chokidar watcher error')
        this._runningReject && this._runningReject(err)
      }
    })
  }

  /** Start chokidar, the filesystem watcher
   *
   * @see https://github.com/paulmillr/chokidar
   */
  start() {
    console.log({ time: new Date() }, 'starting')
    log.debug('Starting...')

    this.watcher = chokidar.watch('.', {
      // Let paths in events be relative to this base path
      cwd: this.syncPath,
      // Ignore our own .system-tmp-cozy-drive directory
      ignored: /(^|[\/\\])\.system-tmp-cozy-drive/, // eslint-disable-line no-useless-escape
      // Don't follow symlinks
      followSymlinks: false,
      // The stats object is used in methods below
      alwaysStat: true,
      // Watching on Windows seems to lock dirs with subdirs, preventing them
      // from being renamed/moved/deleted.
      usePolling: process.platform === 'win32',
      // Filter out artifacts from editors with atomic writes
      atomic: true,
      // Poll newly created files to detect when the write is finished
      awaitWriteFinish: {
        pollInterval: 200,
        stabilityThreshold: 1000
      },
      // With node 0.10 on linux, only polling is available
      interval: 1000,
      binaryInterval: 2000
    })

    const started = new Promise(resolve => {
      for (let eventType of [
        'add',
        'addDir',
        'change',
        'unlink',
        'unlinkDir'
      ]) {
        this.watcher.on(eventType, (
          path /*: ?string */,
          stats /*: ?fs.Stats */
        ) => {
          const isInitialScan = this.initialScan && !this.initialScan.flushed
          log.chokidar.debug({ path, stats, isInitialScan }, eventType)
          const newEvent = chokidarEvent.build(eventType, path, stats)
          if (newEvent.type !== eventType) {
            log.info(
              { eventType, event: newEvent },
              'fixed wrong fsevents event type'
            )
          }
          this.buffer.push(newEvent)
          this.events.emit('buffering-start')
        })
      }

      // To detect which files&folders have been removed since the last run of
      // cozy-desktop, we keep all the paths seen by chokidar during its
      // initial scan in @paths to compare them with pouchdb database.
      this.initialScan = {
        paths: [],
        emptyDirRetryCount: 3,
        resolve: () => {
          console.log({ time: new Date() }, 'started')
          resolve()
        },
        flushed: false
      }

      this.watcher
        .on('ready', () => this.buffer.switchMode('timeout'))
        .on('raw', (event, path, details) =>
          log.chokidar.debug({ event, path, details }, 'raw')
        )
        .on('error', err => {
          if (err.message === 'watch ENOSPC') {
            log.error(
              { err, sentry: true },
              'Sorry, the kernel is out of inotify watches! ' +
                'See doc/usage/inotify.md for how to solve this issue.'
            )
          } else {
            log.error({ err, sentry: true }, 'could not start chokidar watcher')
          }
        })

      log.info(`Now watching ${this.syncPath}`)
    })

    this.running = new Promise((resolve, reject) => {
      this._runningResolve = resolve
      this._runningReject = reject
    })
    return started
  }

  // TODO: Start checksuming as soon as an add/change event is buffered
  // TODO: Put flushed event batches in a queue
  async onFlush(rawEvents /*: ChokidarEvent[] */) {
    log.debug(`Flushed ${rawEvents.length} events`)

    if (this.initialScan) this.initialScan.flushed = true
    this.events.emit('buffering-end')
    console.log({ time: new Date() }, 'buffering-end')
    syncDir.ensureExistsSync(this)
    this.events.emit('local-start')

    const events = await initialScan.step(rawEvents, this)
    if (!events) return

    log.trace('Prepare events...')
    const preparedEvents /*: LocalEvent[] */ = await prepareEvents.step(
      events,
      this
    )
    this.events.emit('prepare-end')
    console.log({ time: new Date() }, 'prepare-end')
    log.trace('Done with events preparation.')

    const changes /*: LocalChange[] */ = analysis(preparedEvents, this)

    const normalizedChanges /*: LocalChange[] */ = await normalizePaths.step(
      changes,
      this
    )

    // TODO: Don't even acquire lock changes list is empty
    // FIXME: Shouldn't we acquire the lock before preparing the events?
    console.log({ time: new Date() }, 'acquiring lock')
    const release = await this.pouch.lock(this)
    let target = -1
    try {
      await sendToPrep.step(normalizedChanges, this)
      target = (await this.pouch.db.changes({ limit: 1, descending: true }))
        .last_seq
    } finally {
      this.events.emit('sync-target', target)
      release()
      console.log({ time: new Date() }, 'local-end')
      this.events.emit('local-end')
    }
    if (this.initialScan != null) {
      this.initialScan.resolve()
      this.initialScan = null
    }
  }

  async stop(force /*: ?bool */) {
    console.log({ time: new Date() }, 'stopping')
    log.debug('Stopping watcher...')
    if (this.watcher) {
      // XXX manually fire events for added file, because chokidar will cancel
      // them if they are still in the awaitWriteFinish period
      for (let relpath in this.watcher._pendingWrites) {
        try {
          const fullpath = path.join(this.watcher.options.cwd, relpath)
          const curStat = await stater.stat(fullpath)
          this.watcher.emit('add', relpath, curStat)
        } catch (err) {
          log.warn({ err }, 'Could not fire remaining add events')
        }
      }
      await this.watcher.close()
      this.watcher = null
    }
    if (this._runningResolve) {
      this._runningResolve()
      this._runningResolve = null
    }
    this.buffer.switchMode('idle')
    if (force) return Promise.resolve()
    // Give some time for awaitWriteFinish events to be managed
    return new Promise(resolve => {
      setTimeout(() => {
        console.log({ time: new Date() }, 'stopped')
        resolve()
      }, 1000)
    })
  }

  /* Helpers */
  async checksum(filePath /*: string */) /*: Promise<string> */ {
    const absPath = path.join(this.syncPath, filePath)
    return this.checksumer.push(absPath)
  }
}

module.exports = LocalWatcher
