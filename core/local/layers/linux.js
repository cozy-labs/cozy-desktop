/* @flow */

const autoBind = require('auto-bind')
const { buildDir, buildFile } = require('../../metadata')
const fs = require('fs')
const fse = require('fs-extra')
const path = require('path')
const watcher = require('@atom/watcher')

/*::
import type { Metadata } from '../../metadata'
import type { AtomWatcherEvent, Layer, LayerEvent, LayerAddEvent, LayerUpdateEvent, LayerMoveEvent, LayerRemoveEvent } from './events'
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
    await this.watch('.')
    this.next.initial()
  }

  async watch (relativePath /*: string */) {
    try {
      if (!this.running || this.watchers.has(relativePath)) {
        return
      }
      const fullPath = path.join(this.syncPath, relativePath)
      const w = await watcher.watchPath(fullPath, { recursive: false }, this.process)
      if (!this.running || this.watchers.has(relativePath)) {
        w.dispose()
        return
      }
      this.watchers.set(relativePath, w)
      const batch /*: LayerEvent[] */ = []
      for (const entry of await fse.readdir(fullPath)) {
        try {
          const abspath = path.join(this.syncPath, relativePath, entry)
          batch.push(await this.buildAddEvent(abspath))
        } catch (err) {
          // TODO error handling
        }
      }
      // TODO ignore
      if (batch.length === 0) {
        return
      }
      this.next.process(batch)
      for (const event of batch) {
        if (event.doc.docType === 'folder') {
          await this.watch(event.doc.path)
        }
      }
    } catch (err) {
      // The directory may been removed since we wanted to watch it
    }
  }

  async process (events /*: AtomWatcherEvent[] */) {
    // TODO preserve order of batches
    // TODO logger
    // TODO ignore
    const batch /*: LayerEvent[] */ = []
    for (const event of events) {
      switch (event.action) {
        case 'created':
          const eAdd = await this.buildAddEvent(event.path)
          batch.push(eAdd)
          if (eAdd.doc.docType === 'folder') {
            this.watch(eAdd.doc.path).catch(err => { console.error(err) })
          }
          break
        case 'modified':
          batch.push(await this.buildUpdateEvent(event.path))
          break
        case 'deleted':
          const eDel = await this.buildRemoveEvent(event.path, event.kind)
          batch.push(eDel)
          const w = this.watchers.get(eDel.doc.path)
          if (w) {
            w.dispose()
            this.watchers.delete(eDel.doc.path)
          }
          break
        case 'renamed':
          batch.push(await this.buildMoveEvent(event.path, event.oldPath))
          break
        default:
          throw new Error(`Unknown atom/watcher action ${event.action}`)
      }
    }
    this.next.process(batch)
  }

  async buildAddEvent (abspath /*: string */) /*: Promise<LayerAddEvent> */ {
    const doc = await this.buildDocForAddOrUpdate(abspath)
    return { action: 'add', abspath, doc }
  }

  async buildUpdateEvent (abspath /*: string */) /*: Promise<LayerUpdateEvent> */ {
    const doc = await this.buildDocForAddOrUpdate(abspath)
    return { action: 'update', abspath, doc }
  }

  async buildDocForAddOrUpdate (abspath /*: string */) /*: Promise<Metadata> */ {
    let doc /*: ?Metadata */
    const fpath = this.relativePath(abspath)
    const stats = await fse.stat(abspath)
    if (stats != null && stats.isDirectory()) {
      doc = buildDir(fpath, stats)
    } else {
      doc = buildFile(fpath, stats, '')
    }
    return doc
  }

  async buildRemoveEvent (abspath /*: string */, kind /*: string */) /*: Promise<LayerRemoveEvent> */ {
    const fpath = this.relativePath(abspath)
    let doc /*: ?Metadata */
    if (kind === 'directory') {
      doc = buildDir(fpath, new fs.Stats())
    } else {
      doc = buildFile(fpath, new fs.Stats(), '')
    }
    return { action: 'delete', abspath, doc }
  }

  async buildMoveEvent (abspath /*: string */, oldpath /*: string */) /*: Promise<LayerMoveEvent> */ {
    let doc /*: ?Metadata */
    let src /*: ?Metadata */
    const fpath = this.relativePath(abspath)
    const stats = await fse.stat(abspath)
    if (stats != null && stats.isDirectory()) {
      doc = buildDir(fpath, stats)
      src = buildDir(oldpath, new fs.Stats())
    } else {
      doc = buildFile(fpath, stats, '')
      src = buildFile(oldpath, new fs.Stats(), '')
    }
    return { action: 'move', abspath, doc, src }
  }

  relativePath (abspath /*: string */) {
    return path.relative(this.syncPath, abspath)
  }

  stop () {
    this.running = false
    for (const [, w] of this.watchers) {
      w.dispose()
    }
    this.watchers = new Map()
  }
}
