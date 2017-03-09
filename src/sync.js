/* @flow weak */

import async from 'async'
import EventEmitter from 'events'

import Ignore from './ignore'
import Local from './local'
import logger from './logger'
import { extractRevNumber } from './metadata'
import Pouch from './pouch'
import Remote from './remote'
import { REVOKED } from './remote/watcher'
import { PendingMap } from './utils/pending'

import type { Metadata } from './metadata'
import type { Side } from './side' // eslint-disable-line

const log = logger({
  prefix: 'Synchronize   ',
  date: true
})

export const TRASHING_DELAY = 1000

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
  moveFrom: any
  moveTo: ?string

  constructor (pouch, local, remote, ignore, events) {
    this.pouch = pouch
    this.local = local
    this.remote = remote
    this.ignore = ignore
    this.events = events
    this.local.other = this.remote
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
  start (mode) {
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
  sync (callback) {
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
  pop (callback) {
    this.pouch.getLocalSeq((err, seq) => {
      if (err) {
        callback(err)
        return
      }
      let opts = {
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
          log.debug('No more metadata changes for now')
          log.lineBreak()
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
  apply (change, callback) {
    let { doc } = change
    log.debug(`${doc.path}: Applying change ${change.seq}...`)

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
  selectSide (doc) {
    let localRev = doc.sides.local || 0
    let remoteRev = doc.sides.remote || 0
    if (localRev > remoteRev) {
      return [this.remote, 'remote', remoteRev]
    } else if (remoteRev > localRev) {
      return [this.local, 'local', localRev]
    } else {
      log.debug(`${doc.path}: Nothing to do`)
      return []
    }
  }

  // Keep track of the sequence number, save side rev, and log errors
  applied (change, side, callback) {
    return err => {
      if (err) { log.error(err) }
      if (err && err.code === 'ENOSPC') {
        callback(new Error('The disk space on your computer is full!'))
      } else if (err && err.message === REVOKED) {
        callback(err)
      } else if (err) {
        if (!change.doc.errors) { change.doc.errors = 0 }
        this.isCozyFull((err, full) => {
          if (err) {
            // TODO: v3: Ping remote on error?
            callback(err)
            /*
            this.remote.couch.ping(available => {
              if (available) {
                this.updateErrors(change, callback)
              } else {
                this.remote.couch.whenAvailable(callback)
              }
            })
            */
          } else if (full) {
            callback(new Error(
              'Your Cozy is full! ' +
              'You can delete some files to be able' +
              'to add new ones or upgrade your storage plan.'
            ))
          } else {
            this.updateErrors(change, callback)
          }
        })
      } else {
        log.debug(`${change.doc.path}: Applied change ${change.seq}`)
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

  // Says is the Cozy has no more free disk space
  isCozyFull (callback) {
    // TODO: v3: Reimplement Sync#isCozyFull()
    callback(false)
    /*
    this.getDiskSpace(function (err, res) {
      if (err) {
        callback(err)
      } else {
        callback(null, ['', '0'].includes(res.diskSpace.freeDiskSpace))
      }
    })
    */
  }

  // Increment the counter of errors for this document
  updateErrors (change, callback) {
    let { doc } = change
    doc.errors++
    // Don't try more than 10 times for the same operation
    if (doc.errors >= 10) {
      this.pouch.setLocalSeq(change.seq, callback)
      return
    }
    this.pouch.db.put(doc, err => {
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
  updateRevs (doc, side, callback) {
    let rev = extractRevNumber(doc) + 1
    for (let s of ['local', 'remote']) {
      doc.sides[s] = rev
    }
    delete doc.errors
    this.pouch.db.put(doc, err => {
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
            this.pouch.db.put(doc, function (err) {
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
  fileChanged (doc, side: Side, rev, callback) {
    let from
    switch (true) {
      case doc._deleted && (rev === 0):
        callback()
        break
      case this.moveFrom != null:
        from = this.moveFrom
        this.moveFrom = null
        if (from.moveTo === doc._id) {
          side.moveFile(doc, from, err => {
            if (err) { this.moveFrom = from }
            callback(err)
          })
        } else {
          log.error('Invalid move')
          log.error(from)
          log.error(doc)
          side.addFile(doc, function (err) {
            if (err) { log.error(err) }
            side.destroy(from, function (err) {
              if (err) { log.error(err) }
              callback(new Error('Invalid move'))
            })
          })
        }
        break
      case doc.moveTo != null:
        this.moveFrom = doc
        callback()
        break
      case doc._deleted:
        this.trashLaterWithParentOrByItself(doc, side)
        callback()
        break
      case rev === 0:
        side.addFile(doc, callback)
        break
      default:
        this.pouch.getPreviousRev(doc._id, rev, function (err, old) {
          if (err) {
            side.overwriteFile(doc, old, callback)
          } else if (old.checksum === doc.checksum) {
            side.updateFileMetadata(doc, old, callback)
          } else if (old.remote && !old.checksum) {
            // Photos uploaded by cozy-mobile have no checksum,
            // but it's useless to reupload the binary
            side.updateFileMetadata(doc, old, callback)
          } else {
            side.overwriteFile(doc, old, callback)
          }
        })
    }
  }

  // Same as fileChanged, but for folder
  folderChanged (doc, side: Side, rev, callback) {
    let from
    switch (true) {
      case doc._deleted && (rev === 0):
        callback()
        break
      case this.moveFrom != null:
        from = this.moveFrom
        this.moveFrom = null
        if (from.moveTo === doc._id) {
          side.moveFolder(doc, from, err => {
            if (err) { this.moveFrom = from }
            callback(err)
          })
        } else {
          // Since a move requires 2 PouchDB writes, in rare cases the source
          // and the destination may not match anymore (race condition).
          // As a fallback, we try to add the folder that should exist, and to
          // trash the one that shouldn't.
          log.error('Invalid move')
          log.error(from)
          log.error(doc)
          side.addFolder(doc, function (err) {
            if (err) { log.error(err) }
            side.trash(from, function (err) {
              if (err) { log.error(err) }
              callback(new Error('Invalid move'))
            })
          })
        }
        break
      case doc.moveTo != null:
        this.moveFrom = doc
        callback()
        break
      case doc._deleted:
        this.trashLaterWithParentOrByItself(doc, side)
        callback()
        break
      case rev === 0:
        side.addFolder(doc, callback)
        break
      default:
        this.pouch.getPreviousRev(doc._id, rev, (_, old) => side.updateFolder(doc, old, callback))
    }
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
          log.debug(`${doc.path}: will be trashed with parent directory`)
        } else {
          log.debug(`${doc.path}: should be trashed by itself`)
          side.trash(doc, log.errorIfAny)
        }
      }
    })

    timeout = setTimeout(() => {
      this.pending.executeIfAny(doc.path)
    }, TRASHING_DELAY)
  }
}

export default Sync
