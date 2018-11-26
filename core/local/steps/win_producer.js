/* @flow */

const autoBind = require('auto-bind')
const Buffer = require('./buffer')
const fse = require('fs-extra') // Used for await
const path = require('path')
const watcher = require('@atom/watcher')

/*::
import type { Runner } from './runner'
*/

// This class is a producer: it watches the filesystem and the events are
// created here.
//
// ReadDirectoryChangesW is the API used on windows for FS notifications. It is
// recursive and works without too many darts. Still, it doesn't detect the
// moves and atom/watcher can misunderstand renaming with just case swapping
// (Foo -> foo).
//
// Another important thing to know is that we need to scan added directory: if
// the directory was restored from the trash or moved from outside the watched
// directory, ReadDirectoryChangesW won't send us events for the files and
// sub-directories.
module.exports = class WinProducer /*:: implements Runner */ {
  /*::
  buffer: Buffer
  syncPath: string
  watcher: *
  watchers: Map<string, *>
  */
  constructor (opts /*: { syncPath : string } */) {
    this.buffer = new Buffer()
    this.syncPath = opts.syncPath
    this.watcher = null
    autoBind(this)
  }

  async start () {
    this.watcher = await watcher.watchPath(this.syncPath, { recursive: true }, this.process)
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
