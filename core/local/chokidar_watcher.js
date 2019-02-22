/* @flow */

const autoBind = require('auto-bind')
const Promise = require('bluebird')
const chokidar = require('chokidar')
const fse = require('fs-extra')
const _ = require('lodash')
const path = require('path')

const analysis = require('./analysis')
const checksumer = require('./checksumer')
const chokidarEvent = require('./chokidar_event')
const initialDiff = require('./chokidar_steps/initial_diff')
const LocalEventBuffer = require('./event_buffer')
const logger = require('../logger')
const metadata = require('../metadata')
const {sameDate, fromDate} = require('../timestamp')
const syncDir = require('./sync_dir')

/*::
import type { Metadata } from '../metadata'
import type Pouch from '../pouch'
import type Prep from '../prep'
import type { Checksumer } from './checksumer'
import type { ChokidarEvent } from './chokidar_event'
import type { InitialScan } from './chokidar_steps/initial_scan'
import type { LocalEvent } from './event'
import type { LocalChange } from './change'
import type EventEmitter from 'events'
*/

const log = logger({
  component: 'ChokidarWatcher'
})
log.chokidar = log.child({
  component: 'Chokidar'
})

const SIDE = 'local'

// This file contains the filesystem watcher that will trigger operations when
// a file or a folder is added/removed/changed locally.
// Operations will be added to the a common operation queue along with the
// remote operations triggered by the remoteEventWatcher.
module.exports = class LocalWatcher {
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

  constructor (syncPath /*: string */, prep /*: Prep */, pouch /*: Pouch */, events /*: EventEmitter */) {
    this.syncPath = syncPath
    this.prep = prep
    this.pouch = pouch
    this.events = events
    this.checksumer = checksumer.init()
    this.pendingChanges = []

    // XXX: this.onFlush must be bound before being passed to LocalEventBuffer
    autoBind(this)

     // TODO: Read from config
    const timeoutInMs = process.env.NODE_ENV === 'test' ? 1000 : 10000
    this.buffer = new LocalEventBuffer(timeoutInMs, async (rawEvents) => {
      try {
        await this.onFlush(rawEvents)
      } catch (err) {
        log.error({err}, 'onFlushError')
        this._runningReject && this._runningReject(err)
      }
    })
  }

  // Start chokidar, the filesystem watcher
  // https://github.com/paulmillr/chokidar
  start () {
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
      usePolling: (process.platform === 'win32'),
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

    const started = new Promise((resolve) => {
      for (let eventType of ['add', 'addDir', 'change', 'unlink', 'unlinkDir']) {
        this.watcher.on(eventType, (path /*: ?string */, stats /*: ?fse.Stats */) => {
          const isInitialScan = this.initialScan && !this.initialScan.flushed
          log.chokidar.debug({path, stats, isInitialScan}, eventType)
          const newEvent = chokidarEvent.build(eventType, path, stats)
          this.buffer.push(newEvent)
          this.events.emit('buffering-start')
        })
      }

      // To detect which files&folders have been removed since the last run of
      // cozy-desktop, we keep all the paths seen by chokidar during its
      // initial scan in @paths to compare them with pouchdb database.
      this.initialScan = {ids: [], emptyDirRetryCount: 3, resolve, flushed: false}

      this.watcher
        .on('ready', () => this.buffer.switchMode('timeout'))
        .on('raw', (event, path, details) => log.chokidar.debug({event, path, details}, 'raw'))
        .on('error', (err) => {
          if (err.message === 'watch ENOSPC') {
            log.error('Sorry, the kernel is out of inotify watches! ' +
              'See doc/usage/inotify.md for how to solve this issue.')
          } else {
            log.error({err})
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
  async onFlush (rawEvents /*: ChokidarEvent[] */) {
    log.debug(`Flushed ${rawEvents.length} events`)

    if (this.initialScan) this.initialScan.flushed = true
    this.events.emit('buffering-end')
    syncDir.ensureExistsSync(this)
    this.events.emit('local-start')

    const initialScan = this.initialScan
    const events = await initialDiff.step(rawEvents, this)
    if (!events) return

    log.trace('Prepare events...')
    const preparedEvents /*: LocalEvent[] */ = await this.prepareEvents(events, initialScan)
    log.trace('Done with events preparation.')

    const changes /*: LocalChange[] */ = analysis(preparedEvents, this.pendingChanges)

    // TODO: Don't even acquire lock changes list is empty
    // FIXME: Shouldn't we acquire the lock before preparing the events?
    const release = await this.pouch.lock(this)
    let target = -1
    try {
      await this.sendToPrep(changes)
      target = (await this.pouch.db.changes({limit: 1, descending: true})).last_seq
    } finally {
      this.events.emit('sync-target', target)
      release()
      this.events.emit('local-end')
    }
    if (initialScan != null) {
      initialScan.resolve()
      this.initialScan = null
    }
  }

  async oldMetadata (e /*: ChokidarEvent */) /*: Promise<?Metadata> */ {
    if (e.old) return e.old
    try {
      return await this.pouch.db.get(metadata.id(e.path))
    } catch (err) {
      if (err.status !== 404) log.error({path: e.path, err})
    }
    return null
  }

  async prepareEvents (events /*: ChokidarEvent[] */, initialScan /*: ?InitialScan */) /*: Promise<LocalEvent[]> */ {
    return Promise.map(events, async (e /*: ChokidarEvent */) /*: Promise<?LocalEvent> */ => {
      const abspath = path.join(this.syncPath, e.path)

      const e2 /*: Object */ = _.merge({
        old: await this.oldMetadata(e)
      }, e)

      if (e.type === 'add' || e.type === 'change') {
        if (initialScan && e2.old &&
          e2.path === e2.old.path &&
          sameDate(fromDate(e2.old.updated_at), fromDate(e2.stats.mtime))) {
          log.trace({path: e.path}, 'Do not compute checksum : mtime & path are unchanged')
          e2.md5sum = e2.old.md5sum
        } else {
          try {
            e2.md5sum = await this.checksum(e.path)
            log.trace({path: e.path, md5sum: e2.md5sum}, 'Checksum complete')
          } catch (err) {
            // FIXME: err.code === EISDIR => keep the event? (e.g. rm foo && mkdir foo)
            // Chokidar reports a change event when a file is replaced by a directory
            if (err.code.match(/ENOENT/)) {
              log.debug({path: e.path, ino: e.stats.ino}, 'Checksum failed: file does not exist anymore')
              e2.wip = true
            } else {
              log.error({path: e.path, err}, 'Checksum failed')
              return null
            }
          }
        }
      }

      if (e.type === 'addDir') {
        if (!await fse.exists(abspath)) {
          log.debug({path: e.path, ino: e.stats.ino}, 'Dir does not exist anymore')
          e2.wip = true
        }
      }

      return e2
    }, {concurrency: 50})
    .filter((e /*: ?LocalEvent */) => e != null)
  }

  // @TODO inline this.onXXX in this function
  // @TODO rename LocalChange types to prep.xxxxxx
  async sendToPrep (changes /*: LocalChange[] */) {
    const errors /*: Error[] */ = []
    for (let c of changes) {
      try {
        if (c.needRefetch) {
          // $FlowFixMe
          c.old = await this.pouch.db.get(metadata.id(c.old.path))
        }
        switch (c.type) {
          // TODO: Inline old LocalWatcher methods
          case 'DirDeletion':
            await this.onUnlinkDir(c.path)
            break
          case 'FileDeletion':
            await this.onUnlinkFile(c.path)
            break
          case 'DirAddition':
            await this.onAddDir(c.path, c.stats)
            break
          case 'FileUpdate':
            await this.onChange(c.path, c.stats, c.md5sum)
            break
          case 'FileAddition':
            await this.onAddFile(c.path, c.stats, c.md5sum)
            break
          case 'FileMove':
            await this.onMoveFile(c.path, c.stats, c.md5sum, c.old, c.overwrite)
            if (c.update) await this.onChange(c.update.path, c.update.stats, c.update.md5sum)
            break
          case 'DirMove':
            await this.onMoveFolder(c.path, c.stats, c.old, c.overwrite)
            break
          case 'Ignored':
            break
          default:
            throw new Error('wrong changes')
        }
      } catch (err) {
        log.error({path: c.path, err})
        errors.push(err)
      }
    }

    if (errors.length > 0) {
      throw new Error(`Could not apply all changes to Prep:\n- ${errors.map(e => e.stack).join('\n- ')}`)
    }
  }

  async stop (force /*: ?bool */) {
    if (this.watcher) {
      // XXX manually fire events for added file, because chokidar will cancel
      // them if they are still in the awaitWriteFinish period
      for (let relpath in this.watcher._pendingWrites) {
        try {
          const fullpath = path.join(this.watcher.options.cwd, relpath)
          const curStat = await fse.stat(fullpath)
          this.watcher.emit('add', relpath, curStat)
        } catch (err) {}
      }
      this.watcher.close()
      this.watcher = null
    }
    if (this._runningResolve) {
      this._runningResolve()
      this._runningResolve = null
    }
    this.buffer.switchMode('idle')
    if (force) return Promise.resolve()
    // Give some time for awaitWriteFinish events to be managed
    return new Promise((resolve) => {
      setTimeout(resolve, 1000)
    })
  }

  /* Helpers */
  async checksum (filePath /*: string */) /*: Promise<string> */ {
    const absPath = path.join(this.syncPath, filePath)
    return this.checksumer.push(absPath)
  }

  /* Changes */

  // New file detected
  onAddFile (filePath /*: string */, stats /*: fse.Stats */, md5sum /*: string */) {
    const logError = (err) => log.error({err, path: filePath})
    const doc = metadata.buildFile(filePath, stats, md5sum)
    log.info({path: filePath}, 'FileAddition')
    return this.prep.addFileAsync(SIDE, doc).catch(logError)
  }

  async onMoveFile (filePath /*: string */, stats /*: fse.Stats */, md5sum /*: string */, old /*: Metadata */, overwrite /*: ?Metadata */) {
    const logError = (err) => log.error({err, path: filePath})
    const doc = metadata.buildFile(filePath, stats, md5sum, old.remote)
    if (overwrite) doc.overwrite = overwrite
    log.info({path: filePath, oldpath: old.path}, 'FileMove')
    return this.prep.moveFileAsync(SIDE, doc, old).catch(logError)
  }

  onMoveFolder (folderPath /*: string */, stats /*: fse.Stats */, old /*: Metadata */, overwrite /*: ?boolean */) {
    const logError = (err) => log.error({err, path: folderPath})
    const doc = metadata.buildDir(folderPath, stats, old.remote)
    // $FlowFixMe we set doc.overwrite to true, it will be replaced by metadata in merge
    if (overwrite) doc.overwrite = overwrite
    log.info({path: folderPath, oldpath: old.path}, 'DirMove')
    return this.prep.moveFolderAsync(SIDE, doc, old).catch(logError)
  }

  // New directory detected
  onAddDir (folderPath /*: string */, stats /*: fse.Stats */) {
    const doc = metadata.buildDir(folderPath, stats)
    log.info({path: folderPath}, 'DirAddition')
    return this.prep.putFolderAsync(SIDE, doc).catch(err => log.error({err, path: folderPath}))
  }

  // File deletion detected
  //
  // It can be a file moved out. So, we wait a bit to see if a file with the
  // same checksum is added and, if not, we declare this file as deleted.
  onUnlinkFile (filePath /*: string */) {
    log.info({path: filePath}, 'FileDeletion')
    return this.prep.trashFileAsync(SIDE, {path: filePath}).catch(err => log.error({err, path: filePath}))
  }

  // Folder deletion detected
  //
  // We don't want to delete a folder before files inside it. So we wait a bit
  // after chokidar event to declare the folder as deleted.
  onUnlinkDir (folderPath /*: string */) {
    log.info({path: folderPath}, 'DirDeletion')
    return this.prep.trashFolderAsync(SIDE, {path: folderPath}).catch(err => log.error({err, path: folderPath}))
  }

  // File update detected
  onChange (filePath /*: string */, stats /*: fse.Stats */, md5sum /*: string */) {
    log.info({path: filePath}, 'FileUpdate')
    const doc = metadata.buildFile(filePath, stats, md5sum)
    return this.prep.updateFileAsync(SIDE, doc)
  }
}
