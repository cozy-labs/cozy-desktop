/* @flow */

import Promise from 'bluebird'
import EventEmitter from 'events'
import { dirname } from 'path'

import Ignore from './ignore'
import Local from './local'
import logger from './logger'
import { extractRevNumber, isUpToDate } from './metadata'
import Pouch from './pouch'
import Remote from './remote'
import { HEARTBEAT } from './remote/watcher'
import { PendingMap } from './utils/pending'

import type { SideName, Metadata } from './metadata'
import type { Side } from './side' // eslint-disable-line

const log = logger({
  component: 'Sync'
})

export const TRASHING_DELAY = 1000

type Change = {
  changes: {rev: string}[],
  doc: Metadata,
  id: string,
  seq: number
};

export type SyncMode =
  | "pull"
  | "push"
  | "full";

// Sync listens to PouchDB about the metadata changes, and calls local and
// remote sides to apply the changes on the filesystem and remote CouchDB
// respectively.
class Sync {
  changes: any
  events: EventEmitter
  ignore: Ignore
  local: Local
  pending: PendingMap
  pouch: Pouch
  remote: Remote
  stopped: ?boolean
  moveFrom: ?Metadata
  moveTo: ?string

  diskUsage: () => Promise<*>

  constructor (pouch: Pouch, local: Local, remote: Remote, ignore: Ignore, events: EventEmitter) {
    this.pouch = pouch
    this.local = local
    this.remote = remote
    this.ignore = ignore
    this.events = events
    // $FlowFixMe
    this.local.other = this.remote
    // $FlowFixMe
    this.remote.other = this.local
    this.pending = new PendingMap()
  }

  // Start to synchronize the remote cozy with the local filesystem
  // First, start metadata synchronization in pouch, with the watchers
  // Then, when a stable state is reached, start applying changes from pouch
  //
  // The mode can be:
  // - pull if only changes from the remote cozy are applied to the fs
  // - push if only changes from the fs are applied to the remote cozy
  // - full for the full synchronization of the both sides
  async start (mode: SyncMode): Promise<*> {
    this.stopped = false
    await this.pouch.addAllViewsAsync()
    if (mode !== 'pull') {
      await this.local.start()
    }
    let running = Promise.resolve()
    if (mode !== 'push') {
      const res = this.remote.start()
      running = res.running
      await res.started
    }
    await new Promise(async function (resolve, reject) {
      running.catch((err) => reject(err))
      try {
        while (true) {
          await this.sync()
        }
      } catch (err) {
        reject(err)
      }
    }.bind(this)).catch((err) => {
      this.stop()
      throw err
    })
  }

  // Stop the synchronization
  stop () {
    this.stopped = true
    if (this.changes) {
      this.changes.cancel()
      this.changes = null
    }
    return Promise.all([this.local.stop(), this.remote.stop()])
  }

  // TODO: remove waitForNewChanges to .start while(true)
  async sync (waitForNewChanges:boolean = true): Promise<*> {
    let seq = await this.pouch.getLocalSeqAsync()
    log.trace({seq}, 'Waiting for changes since seq')
    if (waitForNewChanges) await this.waitForNewChanges(seq)
    this.events.emit('sync-start')
    const release = await this.pouch.lock(this)
    try {
      let lastSeq = null
      while (true) {
        if (this.stopped) break
        seq = await this.pouch.getLocalSeqAsync()
        // TODO: if (seq === lastSeq) throw new Error('Infinite loop!')
        if (seq === lastSeq) log.warn({seq}, 'Seq was already synced!')
        else lastSeq = seq

        let change = await this.getNextChange(seq)
        if (change == null) break
        try {
          await this.apply(change)
          // XXX: apply should call setLocalSeqAsync
        } catch (err) {
          if (!this.stopped) throw err
        }
      }
    } finally {
      release()
      this.events.emit('sync-end')
    }
    log.debug('No more metadata changes for now')
  }

  // We filter with the byPath view to reject design documents
  //
  // Note: it is difficult to pick only one change at a time because pouch can
  // emit several docs in a row, and `limit: 1` seems to be not effective!
  async baseChangeOptions (seq: number) : Object {
    return {
      limit: 1,
      since: seq,
      filter: '_view',
      view: 'byPath',
      returnDocs: false
    }
  }

  async waitForNewChanges (seq: number) {
    const opts = await this.baseChangeOptions(seq)
    opts.live = true
    return new Promise((resolve, reject) => {
      this.changes = this.pouch.db.changes(opts)
        .on('change', () => {
          if (this.changes) {
            this.changes.cancel()
            this.changes = null
            resolve()
          }
        })
        .on('error', err => {
          if (this.changes) {
            this.changes = null
            reject(err)
          }
        })
    })
  }

  async getNextChange (seq: number) : Promise<?Change> {
    const opts = await this.baseChangeOptions(seq)
    opts.include_docs = true
    return new Promise((resolve, reject) => {
      this.pouch.db.changes(opts)
        .on('change', info => resolve(info))
        .on('error', err => reject(err))
        .on('complete', info => {
          if (info.results == null || info.results.length === 0) {
            resolve(null)
          }
        })
    })
  }

  // Apply a change to both local and remote
  // At least one side should say it has already this change
  // In some cases, both sides have the change
  async apply (change: Change): Promise<*> {
    let { doc, seq } = change
    const changeInfo = {path: doc.path, seq}
    log.debug(changeInfo, 'Applying change...')
    log.trace({change})

    if (this.ignore.isIgnored(doc)) {
      return this.pouch.setLocalSeqAsync(change.seq)
    }

    // FIXME: Acquire lock for as many changes as possible to prevent next huge
    // remote/local batches to acquite it first?
    try {
      let [side, sideName, rev] = this.selectSide(doc)

      if (!side) {
        return this.pouch.setLocalSeqAsync(change.seq)
      } else if (sideName === 'remote' && doc.trashed) {
        // File or folder was just deleted locally
        const byItself = await this.trashWithParentOrByItself(doc, side)
        if (!byItself) { return }
      } else if (doc.docType === 'file') {
        await this.fileChangedAsync(doc, side, rev)
      } else if (doc.docType === 'folder') {
        await this.folderChangedAsync(doc, side, rev)
      } else {
        throw new Error(`Unknown doctype: ${doc.docType}`)
      }

      log.trace(changeInfo, `Applied change on ${sideName} side`)
      await this.pouch.setLocalSeqAsync(change.seq)
      if (!change.doc._deleted) {
        await this.updateRevs(change.doc, sideName)
      }
    } catch (err) {
      await this.handleApplyError(change, err)
    }
  }

  // Select which side will apply the change
  // It returns the side, its name, and also the last rev applied by this side
  selectSide (doc: Metadata) {
    let localRev = doc.sides.local || 0
    let remoteRev = doc.sides.remote || 0
    if (localRev > remoteRev) {
      return [this.remote, 'remote', remoteRev]
    } else if (remoteRev > localRev) {
      return [this.local, 'local', localRev]
    } else {
      log.info({path: doc.path}, 'up to date')
      return []
    }
  }

  // Make the error explicit (offline, local disk full, quota exceeded, etc.)
  // and keep track of the number of retries
  async handleApplyError (change: Change, err: Error) {
    const {path} = change.doc
    log.error({path, err})
    if (err.code === 'ENOSPC') {
      throw new Error('No more disk space')
    } else if (err.status === 413) {
      throw new Error('Cozy is full')
    }
    try {
      await this.diskUsage()
    } catch (err) {
      if (err.status === 400) {
        log.error({err}, 'Client has been revoked')
        throw new Error('Client has been revoked')
      } else if (err.status === 403) {
        log.error({err}, 'Client has wrong permissions (lack disk-usage)')
        throw new Error('Client has wrong permissions (lack disk-usage)')
      } else {
        // The client is offline, wait that it can connect again to the server
        log.warn({path}, 'Client is offline')
        this.events.emit('offline')
        while (true) {
          try {
            await Promise.delay(60000)
            await this.diskUsage()
            this.events.emit('online')
            log.warn({path}, 'Client is online')
            return
          } catch (_) {}
        }
      }
    }
    await this.updateErrors(change)
  }

  // Increment the counter of errors for this document
  async updateErrors (change: Change): Promise<void> {
    let { doc } = change
    if (!doc.errors) doc.errors = 0
    doc.errors++
    // Don't try more than 3 times for the same operation
    if (doc.errors >= 3) {
      await this.pouch.setLocalSeqAsync(change.seq)
      return
    }
    try {
      // The sync error may be due to the remote cozy being overloaded.
      // So, it's better to wait a bit before trying the next operation.
      // TODO: Wait for some increasing delay before saving errors
      await this.pouch.db.put(doc)
    } catch (err) {
      // If the doc can't be saved, it's because of a new revision.
      // So, we can skip this revision
      log.info(`Ignored ${change.seq}`, err)
      await this.pouch.setLocalSeqAsync(change.seq)
    }
  }

  // Update rev numbers for both local and remote sides
  async updateRevs (doc: Metadata, side: SideName): Promise<*> {
    let rev = extractRevNumber(doc) + 1
    for (let s of ['local', 'remote']) {
      doc.sides[s] = rev
    }
    delete doc.errors
    try {
      await this.pouch.put(doc)
    } catch (err) {
      // Conflicts can happen here, for example if the cozy-stack has generated
      // a thumbnail before apply has finished. In that case, we try to
      // reconciliate the documents.
      if (err && err.status === 409) {
        doc = await this.pouch.db.get(doc._id)
        doc.sides[side] = rev
        await this.pouch.put(doc)
      } else {
        log.warn({path: doc.path, err}, 'Race condition')
      }
    }
  }

  // If a file has been changed, we had to check what operation it is.
  // For a move, the first call will just keep a reference to the document,
  // and only at the second call, the move operation will be executed.
  async fileChangedAsync (doc: Metadata, side: Side, rev: number): Promise<void> {
    let from
    switch (true) {
      case doc._deleted && (rev === 0):
        return
      case doc.moveTo != null:
        this.moveFrom = doc
        return
      case this.moveFrom != null:
        // $FlowFixMe
        from = (this.moveFrom: Metadata)
        this.moveFrom = null
        if (from.moveTo === doc._id && from.md5sum === doc.md5sum) {
          if (from.childMove) {
            await side.assignNewRev(doc)
            return
          }
          try {
            await side.moveFileAsync(doc, from)
          } catch (err) {
            this.moveFrom = from
            throw err
          }
        } else {
          log.warn({path: doc.path}, 'Invalid move')
          log.trace({from, doc})
          try {
            await side.trashAsync(from)
          } catch (err) {
            log.error({err, path: doc.path})
          }
          await side.addFileAsync(doc)
        }
        break
      case doc._deleted:
        try {
          await side.trashAsync(doc)
        } catch (err) {
          throw err
        }
        break
      case rev === 0:
        await side.addFileAsync(doc)
        break
      default:
        let old
        try {
          old = await this.pouch.getPreviousRevAsync(doc._id, rev)
        } catch (_) {
          await side.overwriteFileAsync(doc, null)
          return
        }

        if (old.md5sum === doc.md5sum) {
          await side.updateFileMetadataAsync(doc, old)
        } else {
          await side.overwriteFileAsync(doc, old)
        }
    }
  }

  // Same as fileChanged, but for folder
  async folderChangedAsync (doc: Metadata, side: Side, rev: number): Promise<void> {
    let from
    switch (true) {
      case doc._deleted && (rev === 0):
        return
      case this.moveFrom != null:
        // $FlowFixMe
        from = (this.moveFrom: Metadata)
        this.moveFrom = null
        if (from.moveTo === doc._id) {
          if (from.childMove) {
            await side.assignNewRev(doc)
            return
          }
          try {
            await side.moveFolderAsync(doc, from)
          } catch (err) {
            this.moveFrom = from
            throw err
          }
        } else {
          // Since a move requires 2 PouchDB writes, in rare cases the source
          // and the destination may not match anymore (race condition).
          // As a fallback, we try to add the folder that should exist, and to
          // trash the one that shouldn't.
          log.error({path: doc.path}, 'Invalid move')
          log.trace({from, doc})
          try {
            await side.trashAsync(from)
          } catch (err) {
            log.error({err})
          }
          await side.addFolderAsync(doc)
        }
        break
      case doc.moveTo != null:
        this.moveFrom = doc
        return
      case doc._deleted:
        await side.deleteFolderAsync(doc)
        return
      case rev === 0:
        await side.addFolderAsync(doc)
        return
      default:
        let old
        try {
          old = await this.pouch.getPreviousRevAsync(doc._id, rev)
        } catch (_) {
          await side.addFolderAsync(doc)
          return
        }
        await side.updateFolderAsync(doc, old)
    }
  }

  // Trash a file or folder. If a folder was deleted on local, we try to trash
  // only this folder on the remote, not every files and folders inside it, to
  // preserve the tree in the trash.
  async trashWithParentOrByItself (doc: Metadata, side: Side): Promise<boolean> {
    let parentId = dirname(doc._id)
    if (parentId !== '.') {
      let parent = await this.pouch.db.get(parentId)

      if (!parent.trashed) {
        await Promise.delay(TRASHING_DELAY)
        parent = await this.pouch.db.get(parentId)
      }

      if (parent.trashed && !isUpToDate('remote', parent)) {
        log.info(`${doc.path}: will be trashed with parent directory`)
        await this.trashWithParentOrByItself(parent, side)
        // Wait long enough that the remote has fetched one changes feed
        // TODO find a way to trigger the changes feed instead of waiting for it
        await Promise.delay(HEARTBEAT)
        return false
      }
    }

    log.info(`${doc.path}: should be trashed by itself`)
    await side.trashAsync(doc)
    return true
  }
}

export default Sync
