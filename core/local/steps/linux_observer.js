/* @flow */

const autoBind = require('auto-bind')
const { buildDir, buildFile } = require('../../metadata')
const fs = require('fs')
const fse = require('fs-extra') // Used for await
const path = require('path')
const watcher = require('@atom/watcher')

/*::
export interface Runner {
  start(): Promise<*>,
  stop(): *,
}
*/

module.exports = class LinuxObserver /*:: implements Runner */ {
  /*::
  syncPath: string
  running: boolean
  watchers: Map<string, *>
  */
  constructor (opts /*: { syncPath : string } */) {
    this.syncPath = opts.syncPath
    this.running = false
    this.watchers = new Map()
    autoBind(this)
  }

  async start () {
    this.running = true
    await this.scan('.')
    // TODO initial-scan-done
  }

  async scan (relPath /*: string */) {
    const entries = []
    const fullPath = path.join(this.syncPath, relPath)
    for (const entry of await fse.readdir(fullPath)) {
      try {
        const absPath = path.join(this.syncPath, relPath, entry)
        const stats = await fse.stat(absPath)
        entries.push({ action: "scan", path: relPath, stats })
      } catch (err) {
        // TODO error handling
      }
    }
    if (entries.length === 0) {
      return
    }
    // TODO emits entries
    for (const entry of entries) {
      if (entry.stats.isDirectory()) {
        await this.scan(entry.path)
      }
    }
  }

  async watch (relPath /*: string */) {
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
    // TODO
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
