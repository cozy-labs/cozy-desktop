/* @flow */

const autoBind = require('auto-bind')
const Buffer = require('./buffer')
const fse = require('fs-extra') // Used for await
const path = require('path')
const watcher = require('@atom/watcher')

/*::
export interface Runner {
  start(): Promise<*>,
  stop(): *,
}
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
  running: boolean
  watchers: Map<string, *>
  */
  constructor (opts /*: { syncPath : string } */) {
    this.buffer = new Buffer()
    this.syncPath = opts.syncPath
    this.running = false
    this.watchers = new Map()
    autoBind(this)
  }

  async start () {
    this.running = true
    await this.scan('.')
    const scanDone = { action: 'initial-scan-done', kind: 'unknown', path: '.' }
    this.buffer.push([scanDone])
  }

  async scan (relPath /*: string */) {
    await this.add(relPath)
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

  async add (relPath /*: string */) {
    try {
      if (!this.running || this.watchers.has(relPath)) {
        return
      }
      const fullPath = path.join(this.syncPath, relPath)
      const w = await watcher.watchPath(fullPath, { recursive: false }, this.process)
      if (!this.running || this.watchers.has(relPath)) {
        w.dispose()
        return
      }
      this.watchers.set(relPath, w)
    } catch (err) {
      // The directory may been removed since we wanted to watch it
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

  relativePath (absPath /*: string */) {
    return path.relative(this.syncPath, absPath)
  }

  stop () {
    this.running = false
    for (const [, w] of this.watchers) {
      w.dispose()
    }
    this.watchers = new Map()
  }
}
