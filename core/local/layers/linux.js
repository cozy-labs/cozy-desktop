/* @flow */

const autoBind = require('auto-bind')
const { buildDir, buildFile } = require('../../metadata')
const fse = require('fs-extra')
const path = require('path')
const watcher = require('@atom/watcher')

/*::
import type { Layer } from './events'
*/

// This class is a source, not a typical layer: it has no method initial or
// process that a predecessor layer can call. It watches the filesystem and the
// events are created here.
//
// On Linux, the API to watch the file system (inotify) is not recursive. It
// means that we have to add a watcher when we a new directory is added (and to
// remove a watcher when a watched directory is removed).
//
// Ignoring some files/folders could have been done in a separated layer, but
// it is more efficient to do here, as we can avoid to setup inotify watchers
// for ignored folders.
//
// Even if inotify has a IN_ISDIR hint, atom/watcher does not report it. So, we
// have to call stat on the path to know if it's a file or a directory for add
// and update events.
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
    try {
      const fullPath = path.join(this.syncPath, relativePath)
      const w = await watcher.watchPath(fullPath, {}, this.process)
      if (!this.running) {
        w.dispose()
        return
      }
      this.watchers.set(relativePath, w)
      const batch = []
      for (const entry of await fse.readdir(fullPath)) {
        try {
          const event = { action: 'add', doc: {}, docType: '' }
          const fpath = path.join(relativePath, entry)
          const stats = await fse.stat(path.join(this.syncPath, fpath))
          if (stats != null && stats.isDirectory()) {
            event.doc = buildDir(fpath, stats)
            event.docType = 'folder'
          } else {
            event.doc = buildFile(fpath, stats, '')
            event.docType = 'file'
          }
          batch.push(event)
        } catch (err) {
          // TODO error handling
        }
      }
      // TODO ignore
      if (batch.length === 0) {
        return
      }
      this.next.process(batch) // FIXME send events with stats
      for (const event of batch) {
        if (event.docType === 'folder') {
          await this.watch(event.doc.path)
        }
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
