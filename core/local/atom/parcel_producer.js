/**
 * @module core/local/atom/producer
 * @flow
 */

const autoBind = require('auto-bind')
const fse = require('fs-extra') // Used for await
const path = require('path')
const Promise = require('bluebird')
const parcel = require('@parcel/watcher')

const Channel = require('./channel')
const { INITIAL_SCAN_DONE } = require('./event')
const defaultStater = require('../stater')
const logger = require('../../utils/logger')

/*::
import type { Config } from '../../config'
import type { Ignore } from '../../ignore'
import type { AtomEvent } from './event'
import type { Stats } from '../stater'
import type EventEmitter from 'events'

export type Scanner = (string, ?{ readdir?: *, stater?: * }) => Promise<void>
export type ParcelEvent = {
  path: string,
  oldPath?: string,
  ino: string,
  fileId?: string,
  type: 'create'|'update'|'delete'|'rename',
  kind: 'directory'|'file'
}
*/

const log = logger({
  component: 'atom/ParcelProducer'
})

const isIgnored = ({ path, kind }, ignore) =>
  ignore.isIgnored({
    relativePath: path,
    isFolder: kind === 'directory'
  })

const backend =
  process.platform === 'linux'
    ? 'inotify'
    : process.platform === 'windows'
    ? 'windows'
    : 'fs-events'

/**
 * This class is a producer: it watches the filesystem and the events are
 * created here.
 *
 * On Windows:
 *   the API used for FS notifications is ReadDirectoryChangesW. It is
 *   recursive and works without too many darts. Still, it doesn't detect the
 *   moves and atom/watcher can misunderstand renaming with just case swapping
 *   (Foo -> foo).
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
 *
 *   Even if inotify has a IN_ISDIR hint, atom/watcher does not report it. So, we
 *   have to call stat on the path to know if it's a file or a directory for add
 *   and update events.
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
   * Atom/watcher has a recursive option, even on Linux. It just calls inotify
   * on each sub-directory. Using this option has some pros and cons:
   *
   * - Pro: we don't have to explicitely manage the inotify watchers on Linux
   * - Pro: move/rename detection is made by atom/watcher on Linux
   * - Con: the sync dir must be scanned twice on Linux, once by atom/watcher
   *   to put the inotify watchers, and once by Producer for the initial scan
   * - Con: when a new directory is detected, we must scan it twice on Linux,
   *   once by atom-watcher to put inotify watchers on sub-directories that can
   *   have been added faster that the event has bubbled, and once by the local
   *   watcher (because it can be a directory that has been moved from outside
   *   the synchronized directory, and atom/watcher doesn't emit events in that
   *   case).
   *
   * As atom/watcher doesn't give use the inotify cookies, the move/rename
   * detection is probably the harder of the four tasks. So, we choosed to use
   * the recursive option.
   */
  async start() {
    this.watcher = await parcel.subscribe(
      this.config.syncPath,
      async (err, events) => {
        // FIXME: use async queue to process events in order
        await this.processEvents(events)
      },
      { backend }
    )
    if (!this.watcher) throw new Error('Could not start @parcel/watcher')

    this.events.emit('buffering-start')

    //console.log('getEventsSince')
    //const initialEvents = await parcel.getEventsSince(
    //  this.config.syncPath,
    //  this.config.snapshotPath
    //)
    //await this.processEvents(initialEvents)
    await this.scan('')
    //console.log('initialEvents processed')

    const doneProcessing = new Promise(resolve => {
      this.events.on('initial-scan-done', resolve)
    })
    this.channel.push([INITIAL_SCAN_DONE])

    this.initialScanDone = true
    log.trace('Scan done')

    await doneProcessing
    this.events.emit('buffering-end')
  }

  async writeSnapshot() {
    await parcel.writeSnapshot(this.config.syncPath, this.config.snapshotPath)
  }

  async scan(relPath /*: string */) {
    const scanEvents = await parcel.scan(
      path.join(this.config.syncPath, relPath),
      { backend }
    )
    await this.processEvents(scanEvents, { fromScan: true })
  }

  //async scan(
  //  relPath /*: string */,
  //  {
  //    readdir = fse.readdir,
  //    stater = defaultStater
  //  } /*: { readdir?: *, stater?: * } */ = {}
  //) /*: Promise<void> */ {
  //  const entries = []
  //  const fullPath = path.join(this.config.syncPath, relPath)

  //  for (const entry of await readdir(fullPath)) {
  //    try {
  //      const absPath = path.join(this.config.syncPath, relPath, entry)
  //      const stats = await stater.statMaybe(absPath)
  //      const incomplete = stats == null
  //      const scanEvent /*: AtomEvent */ = {
  //        action: 'scan',
  //        path: path.join(relPath, entry),
  //        kind: stats ? stater.kind(stats) : 'unknown'
  //      }
  //      if (stats) scanEvent.stats = stats
  //      if (incomplete) scanEvent.incomplete = incomplete
  //      if (!isIgnored(scanEvent, this.ignore)) {
  //        entries.push(scanEvent)
  //      } else {
  //        log.debug({ event: scanEvent }, 'Ignored via .cozyignore')
  //      }
  //    } catch (err) {
  //      log.error(
  //        { err, path: path.join(relPath, entry) },
  //        'could not get doc info'
  //      )
  //    }
  //  }
  //  log.trace({ path: relPath, batch: entries }, 'scan')
  //  this.channel.push(entries)

  //  for (const entry of entries) {
  //    if (entry.stats && stater.isDirectory(entry.stats)) {
  //      try {
  //        await this.scan(entry.path)
  //      } catch (err) {
  //        log.error({ err, path: entry.path }, 'could not scan dir')
  //      }
  //    }
  //  }
  //}

  async buildEvent(
    event /*: ParcelEvent */,
    { fromScan = false } /*: { fromScan: boolean } */
  ) /*: Promise<?AtomEvent> */ {
    // Completely skip events for Desktop's temporary files
    if (event.path === this.config.syncPath) {
      return null
    }
    if (/(^|[/\\])\.system-tmp-cozy-drive/.test(event.path)) {
      return null
    }

    const relativePath = path.relative(this.config.syncPath, event.path)
    //console.log({ path: event.path, relativePath })

    //let stats
    //try {
    //  stats =
    //    event.type !== 'delete' ? await defaultStater.stat(event.path) : null
    //} catch (err) {
    //  console.log('stat error', { err })
    //  return { action: 'ignored', kind: null, path: relativePath, stats: null }
    //}

    //const kind =
    //  stats != null
    //    ? defaultStater.isDirectory(stats)
    //      ? 'directory'
    //      : 'file'
    //    : event.kind
    const kind = event.kind
    const ino = event.fileId ? event.fileId : event.ino && Number(event.ino)
    //console.log({ kind, path: relativePath, ino })

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
    //console.log({ events }, 'process events')
    const batch = await Promise.all(
      events.map(event => this.buildEvent(event, { fromScan }))
    ).filter(event => event != null)

    if (batch.length > 0) {
      //console.log({
      //  batch: batch.map(a => ({
      //    ...a,
      //    ino: a.stats && a.stats.ino
      //  }))
      //})
      log.trace({ batch }, 'process')
      this.channel.push(batch)
    }
  }

  async stop() {
    log.trace('Stop')
    if (this.watcher) {
      await this.watcher.unsubscribe()
      // XXX: unsubscribe() resolves before it was actually finished
      await Promise.delay(1000)
      this.watcher = null
    }
  }
}

module.exports = Producer
