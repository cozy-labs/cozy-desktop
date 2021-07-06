/**
 * @module core/local/atom/producer
 * @flow
 */

const autoBind = require('auto-bind')
const fse = require('fs-extra') // Used for await
const path = require('path')
const Promise = require('bluebird')
const watcher = require('@atom/watcher')

const Channel = require('./channel')
const { INITIAL_SCAN_DONE } = require('./event')
const defaultStater = require('../stater')
const logger = require('../../utils/logger')

/*::
import type { Config } from '../../config'
import type { Ignore } from '../../ignore'
import type { AtomEvent } from './event'
import type EventEmitter from 'events'

export type Scanner = (string, ?{ readdir?: *, stater?: * }) => Promise<void>
*/

const log = logger({
  component: 'atom/Producer'
})

const isIgnored = ({ path, kind }, ignore) =>
  ignore.isIgnored({
    relativePath: path,
    isFolder: kind === 'directory'
  })

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
  syncPath: string
  ignore: Ignore
  events: EventEmitter
  watcher: *
  scan: Scanner
  */
  constructor(
    opts /*: { config: Config, ignore: Ignore, events: EventEmitter } */
  ) {
    this.channel = new Channel()
    this.syncPath = opts.config.syncPath
    this.ignore = opts.ignore
    this.events = opts.events
    this.watcher = null
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
    this.events.emit('buffering-start')
    this.watcher = await watcher.watchPath(
      this.syncPath,
      { recursive: true },
      this.process
    )
    log.info(`Now watching ${this.syncPath}`)
    if (process.platform === 'linux') {
      // TODO to be checked, but we might need to give some time to
      // atom/watcher to finish putting its inotify watches on sub-directories.
      await Promise.delay(1000)
    }
    await this.scan('.')
    log.trace('Scan done')
    // The initial scan can miss some files or directories that have been
    // moved. Wait a bit to ensure that the corresponding renamed events have
    // been emited.
    await Promise.delay(1000)
    this.channel.push([INITIAL_SCAN_DONE])
    this.events.emit('buffering-end')
  }

  async scan(
    relPath /*: string */,
    {
      readdir = fse.readdir,
      stater = defaultStater
    } /*: { readdir?: *, stater?: * } */ = {}
  ) /*: Promise<void> */ {
    const entries = []
    const fullPath = path.join(this.syncPath, relPath)

    for (const entry of await readdir(fullPath)) {
      try {
        const absPath = path.join(this.syncPath, relPath, entry)
        const stats = await stater.statMaybe(absPath)
        const incomplete = stats == null
        const scanEvent /*: AtomEvent */ = {
          action: 'scan',
          path: path.join(relPath, entry),
          kind: stats ? stater.kind(stats) : 'unknown'
        }
        if (stats) scanEvent.stats = stats
        if (incomplete) scanEvent.incomplete = incomplete
        if (!isIgnored(scanEvent, this.ignore)) {
          entries.push(scanEvent)
        } else {
          log.debug({ event: scanEvent }, 'Ignored via .cozyignore')
        }
      } catch (err) {
        log.error(
          { err, path: path.join(relPath, entry) },
          'could not get doc info'
        )
      }
    }
    log.trace({ path: relPath, batch: entries }, 'scan')
    this.channel.push(entries)

    for (const entry of entries) {
      if (entry.stats && stater.isDirectory(entry.stats)) {
        try {
          await this.scan(entry.path)
        } catch (err) {
          log.error({ err, path: entry.path }, 'could not scan dir')
        }
      }
    }
  }

  process(batch /*: Array<*> */) {
    log.trace({ batch }, 'process')
    // Atom/watcher emits events with an absolute path, but it's more
    // convenient for us to use a relative path.
    for (const event of batch) {
      event.path = path.relative(this.syncPath, event.path)
      if (event.oldPath) {
        event.oldPath = path.relative(this.syncPath, event.oldPath)
      }
    }
    this.channel.push(batch)
  }

  stop() {
    log.trace('Stop')
    if (this.watcher) {
      this.watcher.dispose()
      this.watcher = null
    }
  }
}

module.exports = Producer
