/* @flow */

const autoBind = require('auto-bind')
const { buildDir, buildFile } = require('../../metadata')
const fs = require('fs') // TODO use win fs.stat
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
// ReadDirectoryChangesW is the API used on windows for FS notifications. It is
// recursive and works without too many darts. Still, it doesn't detect the
// moves and atom/watcher can misunderstand renaming with just case swapping
// (Foo -> foo).
//
// When another important thing to know is that we need to scan added directory:
// if the directory was restored from the trash or moved from outside the
// watched directory, ReadDirectoryChangesW won't send us events for the files
// and sub-directories.
module.exports = class WinSource {
  /*::
  syncPath: string
  next: Layer
  running: boolean
  watcher: *
  */
  constructor (syncPath /*: string */, next /*: Layer */) {
    this.syncPath = syncPath
    this.next = next
    autoBind(this)
  }

  async start () {
    this.watcher = await watcher.watchPath(this.syncPath, { recursive: true }, this.process)
    await this.initialScan('.')
    this.next.initial()
  }

  async initialScan (relativePath /*: string */) {
    try {
      const fullPath = path.join(this.syncPath, relativePath)
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
          await this.initialScan(event.doc.path)
        }
      }
    } catch (err) {
      // The directory may been removed since we wanted to watch it
    }
  }

  async process (events /*: AtomWatcherEvent[] */) {
    // TODO logger
    // TODO ignore
    const batch /*: LayerEvent[] */ = []
    for (const event of events) {
      try {
        switch (event.action) {
          case 'created':
            // TODO scan added directory
            batch.push(await this.buildAddEvent(event.path))
            break
          case 'modified':
            batch.push(await this.buildUpdateEvent(event.path))
            break
          case 'deleted':
            batch.push(await this.buildRemoveEvent(event.path, event.kind))
            break
          case 'renamed':
            batch.push(await this.buildMoveEvent(event.path, event.oldPath))
            break
        }
      } catch (err) {
        // If fs.stat fails while building an event, we can ignore the event:
        // we will probably have a deleted event later.
      }
      throw new Error(`Unknown atom/watcher action ${event.action}`)
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
    if (this.watcher) {
      this.watcher.dispose()
      this.watcher = null
    }
  }
}
