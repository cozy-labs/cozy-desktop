/* @flow */

const autoBind = require('auto-bind')
const fse = require('fs-extra') // Used for await
const path = require('path')
const Promise = require('bluebird')
const watcher = require('@atom/watcher')

const Buffer = require('./buffer')
const { INITIAL_SCAN_DONE } = require('./event')
const logger = require('../../logger')
const defaultStater = require('../stater')
const LocalEventBuffer = require('../event_buffer')

/*::
import type { AtomWatcherEvent, Batch } from './event'

export type Scanner = (string) => Promise<void>
*/

const log = logger({
  component: 'atom/Producer'
})

// This class is a producer: it watches the filesystem and the events are
// created here.
//
// On Windows:
//   the API used for FS notifications is ReadDirectoryChangesW. It is
//   recursive and works without too many darts. Still, it doesn't detect the
//   moves and atom/watcher can misunderstand renaming with just case swapping
//   (Foo -> foo).
//
//   Another important thing to know is that we need to scan added directories: if
//   the directory was restored from the trash or moved from outside the watched
//   directory, ReadDirectoryChangesW won't send us events for the files and
//   sub-directories.
//
// On Linux:
//   the API used for FS notifications is inotify and is not recursive. It
//   means that we have to add a watcher when we a new directory is added (and to
//   remove a watcher when a watched directory is removed).
//
//   Even if inotify has a IN_ISDIR hint, atom/watcher does not report it. So, we
//   have to call stat on the path to know if it's a file or a directory for add
//   and update events.
module.exports = class Producer {
  /*::
  buffer: Buffer
  syncPath: string
  watcher: *
  macOSBuffer: ?LocalEventBuffer<Batch>
  */
  constructor(opts /*: { syncPath : string } */) {
    this.buffer = new Buffer()
    this.syncPath = opts.syncPath
    this.watcher = null
    if (process.platform === 'darwin') {
      const timeoutInMs = process.env.NODE_ENV === 'test' ? 1000 : 10000
      this.macOSBuffer = new LocalEventBuffer(timeoutInMs, batches => {
        for (const batch of batches) {
          this.process(batch)
        }
      })
    }
    autoBind(this)
  }

  // Atom/watcher has a recursive option, even on Linux. It just calls inotify
  // on each sub-directory. Using this option has some pros and cons:
  //
  // - Pro: we don't have to explicitely manage the inotify watchers on Linux
  // - Pro: move/rename detection is made by atom/watcher on Linux
  // - Con: the sync dir must be scanned twice on Linux, once by atom/watcher
  //   to put the inotify watchers, and once by Producer for the initial scan
  // - Con: when a new directory is detected, we must scan it twice on Linux,
  //   once by atom-watcher to put inotify watchers on sub-directories that can
  //   have been added faster that the event has bubbled, and once by the local
  //   watcher (because it can be a directory that has been moved from outside
  //   the synchronized directory, and atom/watcher doesn't emit events in that
  //   case).
  //
  // As atom/watcher doesn't give use the inotify cookies, the move/rename
  // detection is probably the harder of the four tasks. So, we choosed to use
  // the recursive option.
  async start() {
    const macOSBuffer = this.macOSBuffer
    const onEventBatch = macOSBuffer
      ? macOSBuffer.push.bind(macOSBuffer)
      : this.process

    this.watcher = await watcher.watchPath(
      this.syncPath,
      { recursive: true },
      onEventBatch
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
    this.buffer.push([INITIAL_SCAN_DONE])
  }

  async scan(
    relPath /*: string */,
    {
      readdir = fse.readdir,
      stater = defaultStater
    } /*: { readdir: *, stater: * } */ = {}
  ) {
    const entries = []
    const fullPath = path.join(this.syncPath, relPath)
    for (const entry of await readdir(fullPath)) {
      try {
        const absPath = path.join(this.syncPath, relPath, entry)
        const stats = await stater.statMaybe(absPath)
        const incomplete = stats == null
        const scanEvent /*: AtomWatcherEvent */ = {
          action: 'scan',
          path: path.join(relPath, entry),
          kind: stats ? stater.kind(stats) : 'unknown'
        }
        if (stats) scanEvent.stats = stats
        if (incomplete) scanEvent.incomplete = incomplete
        entries.push(scanEvent)
      } catch (err) {
        log.error({ err, path: path.join(relPath, entry) })
      }
    }
    log.trace({ path: relPath, batch: entries }, 'scan')
    this.buffer.push(entries)

    for (const entry of entries) {
      if (entry.stats && stater.isDirectory(entry.stats)) {
        await this.scan(entry.path)
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
    this.buffer.push(batch)
  }

  stop() {
    log.trace('Stop')
    if (this.watcher) {
      this.watcher.dispose()
      this.watcher = null
    }
  }
}
