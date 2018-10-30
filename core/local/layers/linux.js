/* @flow */

const autoBind = require('auto-bind')
const fse = require('fs-extra')
const path = require('path')
const watcher = require('@atom/watcher')

/*::
import type { Layer } from './events'
*/

module.exports = class LinuxSource {
  /*::
  syncPath: string
  next: Layer
  running: boolean
  watchers: Map<string, *>
  */
  constructor (syncPath /*: string */, next /*: Layer */) {
    this.syncPath = syncPath
    this.next = next
    this.running = false
    this.watchers = new Map()
    autoBind(this)
  }

  async start () {
    this.running = true
    await this.watch(this.syncPath)
    this.next.initial()
  }

  async watch (relativePath /*: string */) {
    if (!this.running) {
      return
    }
    try {
      const fullPath = path.join(this.syncPath, relativePath)
      const w = await watcher.watchPath(fullPath, {}, this.process)
      this.watchers.set(relativePath, w)
      const dirs = []
      for (const entry of await fse.readdir(fullPath)) {
        try {
          const dir = path.join(relativePath, entry)
          const stat = await fse.stat(path.join(this.syncPath, dir))
          if (stat != null && stat.isDirectory()) {
            dirs.push(dir) // FIXME push stats
          }
        } catch (err) {}
      }
      if (dirs.length === 0) {
        return
      }
      this.next.process(dirs) // FIXME send events with stats
      for (const dir of dirs) {
        await this.watch(dir)
      }
    } catch (err) {
      // The directory may been removed since we wanted to watch it
    }
  }

  process (events /*: * */) {
    // TODO ignore
    // TODO this.watch for new dir
    // TODO remove watcher for deleted dir
    this.next.process(events) // FIXME send events
  }

  stop () {
    this.running = false
    for (const [, w] of this.watchers) {
      w.dispose()
    }
    this.watchers = new Map()
  }
}
