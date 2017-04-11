/* @flow */

import async from 'async'
import Promise from 'bluebird'
import EventEmitter from 'events'

import Ignore from './ignore'
import Local from './local'
import logger from './logger'
import { extractRevNumber, inRemoteTrash } from './metadata'
import Pouch from './pouch'
import Remote from './remote'
import { REVOKED } from './remote/watcher'
import { PendingMap } from './utils/pending'

import type { Metadata } from './metadata'
import type { Side, SideName } from './side' // eslint-disable-line
import type { Callback } from './utils/func'

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
  start (mode: SyncMode) {
    this.stopped = false
    let promise = new Promise((resolve, reject) => {
      this.pouch.addAllViews((err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
    if (mode !== 'pull') {
      promise = promise.then(this.local.start)
    }
    let running = Promise.resolve()
    if (mode !== 'push') {
      promise = promise.then(() => {
        let res = this.remote.start()
        running = res.running
        return res.started
      })
    }
    return promise.then(() => {
      return new Promise((resolve, reject) => {
        running.catch((err) => reject(err))
        async.forever(this.sync, err => reject(err))
      }).catch((err) => {
        this.stop()
        return Promise.reject(err)
      })
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

  // Start taking changes from pouch and applying them
  sync (callback: Callback) {
    this.pop((err, change) => {
      if (this.stopped) { return }
      if (err) {
        log.error(err)
        callback(err)
      } else {
        this.apply(change, (err) => {
          if (this.stopped) { err = null }
          callback(err)
        })
      }
    })
  }

  // Take the next change from pouch
  // We filter with the byPath view to reject design documents
  //
  // Note: it is difficult to pick only one change at a time because pouch can
  // emit several docs in a row, and `limit: 1` seems to be not effective!
  pop (callback: Callback) {
    this.pouch.getLocalSeq((err, seq) => {
      if (err) {
        callback(err)
        return
      }
      let opts: Object = {
        limit: 1,
        since: seq,
        include_docs: true,
        filter: '_view',
        view: 'byPath'
      }
      this.pouch.db.changes(opts)
        .on('change', info => callback(null, info))
        .on('error', err => callback(err))
        .on('complete', info => {
          if (info.results && info.results.length) { return }
          this.events.emit('up-to-date')
          log.debug({event: 'end'}, 'No more metadata changes for now')
          opts.live = true
          opts.returnDocs = false
          this.changes = this.pouch.db.changes(opts)
            .on('change', info => {
              if (this.changes) {
                this.changes.cancel()
                this.changes = null
                callback(null, info)
              }
            })
            .on('error', err => {
              if (this.changes) {
                this.changes = null
                callback(err, null)
              }
            })
        })
    })
  }

  // Apply a change to both local and remote
  // At least one side should say it has already this change
  // In some cases, both sides have the change
  apply (change: Change, callback: Callback) {
    let { doc } = change
    log.info({change})

    if (this.ignore.isIgnored(doc)) {
      this.pouch.setLocalSeq(change.seq, _ => callback())
      return
    }

    let [side, sideName, rev] = this.selectSide(doc)
    let done = this.applied(change, sideName, callback)

    switch (true) {
      case side == null:
        this.pouch.setLocalSeq(change.seq, callback)
        break
      case (sideName === 'remote' && doc.toBeTrashed && !inRemoteTrash(doc)):
        // File or folder was just deleted locally
        // TODO: Retry on failure instead of going unsynced
        this.trashLaterWithParentOrByItself(doc, side)
        done()
        break
      case doc.docType === 'file':
        this.fileChanged(doc, side, rev, done)
        break
      case doc.docType === 'folder':
        this.folderChanged(doc, side, rev, done)
        break
      default:
        callback(new Error(`Unknown doctype: ${doc.docType}`))
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
      log.info({doc}, 'up to date')
      return []
    }
  }

  // Keep track of the sequence number, save side rev, and log errors
  applied (change: Change, side: SideName, callback: Callback) {
    return (err: ?Error) => {
      if (err) { log.error(err) }
      if (err && err.code === 'ENOSPC') {
        callback(new Error('The disk space on your computer is full!'))
      } else if (err && err.status === 400 && err.message.match(/revoked|Invalid JWT/)) {
        callback(new Error(REVOKED))
      } else if (err && err.status === 413) {
        callback(new Error('Your Cozy is full! ' +
          'You can delete some files to be able' +
          'to add new ones or upgrade your storage plan.'
        ))
      } else if (err) {
        if (!change.doc.errors) { change.doc.errors = 0 }
        // TODO: v3: Ping remote on error?
        /*
        this.remote.couch.ping(available => {
          if (available) {
            this.updateErrors(change, callback)
          } else {
            this.remote.couch.whenAvailable(callback)
          }
        })
        */
        this.updateErrors(change, callback)
      } else {
        log.info(`${change.doc.path}: Applied change ${change.seq} on ${side} side`)
        this.pouch.setLocalSeq(change.seq, err => {
          if (err) { log.error(err) }
          if (change.doc._deleted) {
            callback(err)
          } else {
            this.updateRevs(change.doc, side, callback)
          }
        })
      }
    }
  }

  // Increment the counter of errors for this document
  updateErrors (change: Change, callback: Callback) {
    let { doc } = change
    doc.errors++
    // Don't try more than 10 times for the same operation
    if (doc.errors >= 10) {
      this.pouch.setLocalSeq(change.seq, callback)
      return
    }
    this.pouch.put(doc, err => {
      // If the doc can't be saved, it's because of a new revision.
      // So, we can skip this revision
      if (err) {
        log.info(`Ignored ${change.seq}`, err)
        this.pouch.setLocalSeq(change.seq, callback)
        return
      }
      // The sync error may be due to the remote cozy being overloaded.
      // So, it's better to wait a bit before trying the next operation.
      setTimeout(callback, 3000)
    })
  }

  // Update rev numbers for both local and remote sides
  updateRevs (doc: Metadata, side: SideName, callback: Callback) {
    let rev = extractRevNumber(doc) + 1
    for (let s of ['local', 'remote']) {
      doc.sides[s] = rev
    }
    delete doc.errors
    this.pouch.put(doc, err => {
      // Conflicts can happen here, for example if the data-system has
      // generated a thumbnail before apply has finished. In that case, we
      // try to reconciliate the documents.
      if (err && err.status === 409) {
        this.pouch.db.get(doc._id, (err, doc) => {
          if (err) {
            log.warn('Race condition', err)
            callback()
          } else {
            doc.sides[side] = rev
            this.pouch.put(doc, function (err) {
              if (err) { log.warn('Race condition', err) }
              callback()
            })
          }
        })
      } else {
        if (err) { log.warn('Race condition', err) }
        callback()
      }
    })
  }

  // If a file has been changed, we had to check what operation it is.
  // For a move, the first call will just keep a reference to the document,
  // and only at the second call, the move operation will be executed.
  async fileChangedAsync (doc: Metadata, side: Side, rev: number): Promise<void> {
    let from
    switch (true) {
      case doc._deleted && (rev === 0):
        return
      case this.moveFrom != null:
        // $FlowFixMe
        from = (this.moveFrom: Metadata)
        this.moveFrom = null
        if (from.moveTo === doc._id) {
          try {
            await side.moveFileAsync(doc, from)
          } catch (err) {
            this.moveFrom = from
            throw err
          }
        } else {
          log.error('Invalid move')
          log.error(from)
          log.error(doc)
          try {
            await side.addFileAsync(doc)
          } catch (err) {
            log.error(err)
          }
          try {
            await side.destroyAsync(from)
          } catch (err) {
            log.error(err)
            throw new Error('Invalid move')
          }
        }
        break
      case doc.moveTo != null:
        this.moveFrom = doc
        return
      case doc._deleted:
        return side.destroyAsync(doc)
      case rev === 0:
        return side.addFileAsync(doc)
      default:
        let old
        try {
          old = await this.pouch.getPreviousRevAsync(doc._id, rev)
        } catch (err) {
          return side.overwriteFileAsync(doc, null)
        }

        if (old.md5sum === doc.md5sum) {
          return side.updateFileMetadataAsync(doc, old)
        } else if (old.remote && !old.md5sum) {
          // Photos uploaded by cozy-mobile have no checksum,
          // but it's useless to reupload the binary
          return side.updateFileMetadataAsync(doc, old)
        } else {
          return side.overwriteFileAsync(doc, old)
        }
    }
  }

  fileChanged (doc: Metadata, side: Side, rev: number, callback: Callback) {
    this.fileChangedAsync(doc, side, rev).asCallback(callback)
  }

  // Same as fileChanged, but for folder
  async folderChangedAsync (doc: Metadata, side: Side, rev: number) {
    let from
    switch (true) {
      case doc._deleted && (rev === 0):
        return
      case this.moveFrom != null:
        // $FlowFixMe
        from = (this.moveFrom: Metadata)
        this.moveFrom = null
        if (from.moveTo === doc._id) {
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
          log.error('Invalid move')
          log.error(from)
          log.error(doc)
          try {
            await side.addFolderAsync(doc)
          } catch (err) {
            log.error(err)
          }
          try {
            await side.trashAsync(from)
          } catch (err) {
            log.error(err)
            throw new Error('Invalid move')
          }
        }
        break
      case doc.moveTo != null:
        this.moveFrom = doc
        return
      case doc._deleted:
        return side.destroyAsync(doc)
      case rev === 0:
        return side.addFolderAsync(doc)
      default:
        let old
        try {
          old = await this.pouch.getPreviousRevAsync(doc._id, rev)
        } catch (_) {
          return side.updateFolderAsync(doc, null)
        }
        return side.updateFolderAsync(doc, old)
    }
  }

  folderChanged (doc: Metadata, side: Side, rev: number, callback: Callback) {
    // $FlowFixMe
    this.folderChangedAsync(doc, side, rev).asCallback(callback)
  }

  // Wait for possibly trashed parent directory. Do nothing if any.
  // Otherwise trash the file or directory matching the given metadata on the
  // given side.
  //
  // In order to wait for upcoming events, we need not to block them, so
  // this method doesn't take a callback and returns immediately.
  trashLaterWithParentOrByItself (doc: Metadata, side: Side) {
    // TODO: Extract delayed execution logic to utils/pending
    let timeout

    this.pending.add(doc.path, {
      stopChecking: () => {
        clearTimeout(timeout)
      },

      execute: () => {
        this.pending.clear(doc.path)

        if (this.pending.hasParentPath(doc.path)) {
          log.info(`${doc.path}: will be trashed with parent directory`)
        } else {
          log.info(`${doc.path}: should be trashed by itself`)
          side.trashAsync(doc).catch(log.error)
        }
      }
    })

    timeout = setTimeout(() => {
      this.pending.executeIfAny(doc.path)
    }, TRASHING_DELAY)
  }
}

export default Sync
