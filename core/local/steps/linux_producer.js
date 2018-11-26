/* @flow */

const autoBind = require('auto-bind')
const Buffer = require('./buffer')
const fse = require('fs-extra') // Used for await
const path = require('path')
const Promise = require('bluebird')
const watcher = require('@atom/watcher')

/*::
import type { Runner } from './runner'
*/

// This class is a producer: it watches the filesystem and the events are
// created here.
//
// On Linux, the API to watch the file system (inotify) is not recursive. It
// means that we have to add a watcher when we a new directory is added (and to
// remove a watcher when a watched directory is removed).
//
// Even if inotify has a IN_ISDIR hint, atom/watcher does not report it. So, we
// have to call stat on the path to know if it's a file or a directory for add
// and update events.
module.exports = class LinuxProducer /*:: implements Runner */ {
  /*::
  buffer: Buffer
  syncPath: string
  watcher: *
  */
  constructor (opts /*: { syncPath : string } */) {
    this.buffer = new Buffer()
    this.syncPath = opts.syncPath
    this.watcher = null
    autoBind(this)
  }

  // Atom/watcher has a recursive option, even on Linux. It just calls inotify
  // on each sub-directory. Using this option has some pros and cons:
  //
  // - Pro: we don't have to explicitely manage the inotify watchers
  // - Pro: move/rename detection is made by atom/watcher
  // - Con: the sync dir must be scanned twice, one by atom/watcher to put the
  //   inotify watches, and the other by LinuxProducer for the initial scan
  // - Con: when a new directory is detected, we must scan it twice, one time
  //   by atom-watcher to put inotify watches on sub-directories that can have
  //   been added faster that the event has bubbled, and one time by the local
  //   watcher (because it can be a directory that has been moved from outside
  //   the synchronized directory, and atom/watcher doesn't emit events in that
  //   case).
  //
  // As atom/watcher doesn't give use the inotify cookies, the move/rename
  // detection is probably the harder of the four tasks. So, we choosed to use
  // the recursive option.
  async start () {
    this.watcher = await watcher.watchPath(this.syncPath, { recursive: true }, this.process)
    // TODO to be checked, but I think we need to give some time to
    // atom/watcher to finish putting its inotify watches on sub-directories.
    await Promise.delay(1000)
    await this.scan('.')
    const scanDone = { action: 'initial-scan-done', kind: 'unknown', path: '.' }
    this.buffer.push([scanDone])
  }

  async scan (relPath /*: string */) {
    const entries = []
    const fullPath = path.join(this.syncPath, relPath)
    for (const entry of await fse.readdir(fullPath)) {
      try {
        // TODO ignore
        const absPath = path.join(this.syncPath, relPath, entry)
        const stats = await fse.stat(absPath)
        entries.push({
          action: 'scan',
          path: path.join(relPath, entry),
          stats,
          kind: 'unknown'
        })
      } catch (err) {
        // TODO error handling
      }
    }
    if (entries.length === 0) {
      return
    }
    this.buffer.push(entries)
    for (const entry of entries) {
      if (entry.stats && entry.stats.isDirectory()) {
        await this.scan(entry.path)
      }
    }
  }

  process (batch /*: Array<*> */) {
    // Atom/watcher emits events with an absolute path, but it's more
    // convenient for us to use a relative path.
    for (const event of batch) {
      event.path = path.relative(this.syncPath, event.path)
    }
    this.buffer.push(batch)
  }

  stop () {
    if (this.watcher) {
      this.watcher.dispose()
      this.watcher = null
    }
  }
}
