/* @flow */

const autoBind = require('auto-bind')
const Buffer = require('./buffer')
const fse = require('fs-extra') // Used for await
const path = require('path')
const Promise = require('bluebird')
const watcher = require('@atom/watcher')

const logger = require('../../logger')
const log = logger({
  component: 'WinProducer'
})

let winfs
if (process.platform === 'win32') {
  // $FlowFixMe
  winfs = require('@gyselroth/windows-fsstat')
}

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
    log.info(`Now watching ${this.syncPath}`)
    await this.scan('.')
    log.trace('Scan done')
    // The initial scan can miss some files or directories that have been
    // moved. Wait a bit to ensure that the corresponding renamed events have
    // been emited.
    await Promise.delay(1000)
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
        const stats = winfs.lstatSync(absPath)
        entries.push({
          action: 'scan',
          path: path.join(relPath, entry),
          stats,
          kind: stats.directory ? 'directory' : 'file'
        })
      } catch (err) {
        // TODO error handling
      }
    }
    if (entries.length === 0) {
      return
    }
    log.debug({entries}, 'scan')
    this.buffer.push(entries)
    for (const entry of entries) {
      if (entry.stats && entry.stats.directory) {
        await this.scan(entry.path)
      }
    }
  }

  process (batch /*: Array<*> */) {
    log.info({batch}, 'process')
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

  stop () {
    log.trace('Stop')
    if (this.watcher) {
      this.watcher.dispose()
      this.watcher = null
    }
  }
}
