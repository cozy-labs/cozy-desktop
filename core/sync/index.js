/**
 * @module core/sync
 * @flow
 */

const autoBind = require('auto-bind')
const Promise = require('bluebird')

const { dirname } = require('path')
const _ = require('lodash')

const { IncompatibleDocError } = require('../incompatibilities/platform')
const metadata = require('../metadata')
const { HEARTBEAT: REMOTE_HEARTBEAT } = require('../remote/constants')
const remoteErrors = require('../remote/errors')
const { otherSide } = require('../side')
const logger = require('../utils/logger')
const measureTime = require('../utils/perfs')
const { LifeCycle } = require('../utils/lifecycle')
const syncErrors = require('./errors')

/*::
import type EventEmitter from 'events'
import type { Ignore } from '../ignore'
import type { Local } from '../local'
import type { Pouch } from '../pouch'
import type { Remote } from '../remote'
import type { RemoteError } from '../remote/errors'
import type { SavedMetadata } from '../metadata'
import type { SideName } from '../side'
import type { Writer } from '../writer'
import type { SyncError } from './errors'
*/

const log = logger({
  component: 'Sync'
})

const MAX_SYNC_ATTEMPTS = 3
const TRASHING_DELAY = 1000

/*::
export type MetadataChange = {
  changes: {rev: string}[],
  doc: SavedMetadata,
  id: string,
  seq: number
};
*/

const isMarkedForDeletion = (doc /*: SavedMetadata */) => {
  // During a transition period, we'll need to consider both documents with the
  // deletion marker and documents which were deleted but not yet synced before
  // the application was updated and are thus completely _deleted from PouchDB.
  return doc.deleted || doc._deleted
}

// Sync listens to PouchDB about the metadata changes, and calls local and
// remote sides to apply the changes on the filesystem and remote CouchDB
// respectively.
class Sync {
  /*::
  changes: any
  events: EventEmitter
  ignore: Ignore
  local: Local
  pouch: Pouch
  remote: Remote
  moveTo: ?string
  lifecycle: LifeCycle
  retryInterval: ?IntervalID
  */

  // FIXME: static TRASHING_DELAY = TRASHING_DELAY

  constructor(
    pouch /*: Pouch */,
    local /*: Local */,
    remote /*: Remote */,
    ignore /*: Ignore */,
    events /*: EventEmitter */
  ) {
    this.pouch = pouch
    this.local = local
    this.remote = remote
    this.ignore = ignore
    this.events = events
    this.local.other = this.remote
    this.remote.other = this.local
    this.lifecycle = new LifeCycle(log)

    // Used only when the synchronization of a change failed and blocks
    this.retryInterval = null

    autoBind(this)
  }

  // Start to synchronize the remote cozy with the local filesystem
  // First, start metadata synchronization in pouch, with the watchers
  // Then, when a stable state is reached, start applying changes from pouch
  async start() /*: Promise<void> */ {
    if (this.lifecycle.willStop()) {
      await this.lifecycle.stopped()
    } else {
      return
    }

    try {
      this.lifecycle.begin('start')
    } catch (err) {
      return
    }

    // Errors emitted while the remote watcher is starting (e.g. revoked OAuth
    // client) will not be thrown and thus not handled if this listener is not
    // attached before starting the watcher.
    // This results in the Sync starting without a remote watcher.
    this.remote.watcher.onFatal(err => {
      this.fatal(err)
    })
    this.remote.watcher.onError(err => {
      this.blockSyncFor({ err })
    })

    try {
      await this.local.start()
      await this.remote.start()
    } catch (err) {
      // The start phase needs to be ended before calling fatal() or we won't be
      // able to stop Sync.
      this.lifecycle.end('start')
      return this.fatal(err)
    }

    this.local.watcher.running.catch(err => {
      this.fatal(err)
    })

    this.lifecycle.end('start')

    try {
      while (!this.lifecycle.willStop()) {
        await this.lifecycle.ready()
        await this.sync()
      }
    } catch (err) {
      await this.fatal(err)
    }
  }

  async started() {
    await this.lifecycle.started()
  }

  // Manually force a full synchronization
  async forceSync() {
    await this.stop()
    await this.start()
  }

  // Stop the synchronization
  async stop() /*: Promise<void> */ {
    // In case an interval timer was started, we clear it to make sure it won't
    // trigger actions after Sync was stopped.
    // This is especially useful in tests.
    clearInterval(this.retryInterval)

    if (this.lifecycle.willStart()) {
      await this.lifecycle.started()
    } else {
      return
    }

    try {
      this.lifecycle.begin('stop')
    } catch (err) {
      return
    }
    if (this.changes) {
      this.changes.cancel()
      this.changes = null
    }

    await Promise.all([this.local.stop(), this.remote.stop()])
    clearInterval(this.retryInterval)
    this.lifecycle.unblockFor('all')
    this.lifecycle.end('stop')
  }

  async stopped() {
    await this.lifecycle.stopped()
  }

  fatal(err /*: Error */) {
    log.error({ err, sentry: true }, `Sync fatal: ${err.message}`)
    this.events.emit('Sync:fatal', err)
    return this.stop()
  }

  async sync({
    manualRun = false
  } /*: { manualRun?: boolean } */ = {}) /*: Promise<*> */ {
    let seq = await this.pouch.getLocalSeq()

    if (!manualRun) {
      const change = await this.waitForNewChanges(seq)
      if (change == null) return
    }
    this.events.emit('sync-start')
    try {
      await this.syncBatch()
    } finally {
      this.events.emit('sync-end')
    }
  }

  // sync
  async syncBatch() /*: Promise<void> */ {
    let seq = null
    // eslint-disable-next-line no-constant-condition
    while (!this.lifecycle.willStop()) {
      await this.lifecycle.ready()

      // FIXME: Acquire lock for as many changes as possible to prevent next huge
      // remote/local batches to acquite it first
      const release = await this.pouch.lock(this)
      try {
        seq = await this.pouch.getLocalSeq()
        // TODO: Prevent infinite loop
        const change = await this.getNextChange(seq)
        if (change == null) {
          log.debug('No more metadata changes for now')
          break
        }

        this.events.emit('sync-current', change.seq)

        await this.apply(change)
      } catch (err) {
        if (!this.lifecycle.willStop()) throw err
      } finally {
        release()
      }
    }
  }

  // We filter with the byPath view to reject design documents
  //
  // Note: it is difficult to pick only one change at a time because pouch can
  // emit several docs in a row, and `limit: 1` seems to be not effective!
  async baseChangeOptions(seq /*: number */) /*: Object */ {
    return {
      limit: 1,
      since: seq,
      filter: '_view',
      view: 'byPath',
      returnDocs: false
    }
  }

  async waitForNewChanges(seq /*: number */) {
    log.trace({ seq }, 'Waiting for changes since seq')
    const opts = await this.baseChangeOptions(seq)
    opts.live = true
    return new Promise((resolve, reject) => {
      this.lifecycle.once('will-stop', resolve)
      this.changes = this.pouch.db
        .changes(opts)
        .on('change', data => {
          this.lifecycle.off('will-stop', resolve)
          if (this.changes) {
            this.changes.cancel()
            this.changes = null
            resolve(data)
          }
        })
        .on('error', err => {
          this.lifecycle.off('will-stop', resolve)
          if (this.changes) {
            this.changes.cancel()
            this.changes = null
            reject(err)
          }
        })
    })
  }

  async getNextChange(seq /*: number */) /*: Promise<?MetadataChange> */ {
    const stopMeasure = measureTime('Sync#getNextChange')
    const opts = await this.baseChangeOptions(seq)
    opts.include_docs = true
    const p = new Promise((resolve, reject) => {
      this.lifecycle.once('will-stop', resolve)
      this.changes = this.pouch.db
        .changes(opts)
        .on('change', data => {
          this.lifecycle.off('will-stop', resolve)
          resolve(data)
        })
        .on('error', err => {
          this.lifecycle.off('will-stop', resolve)
          reject(err)
        })
        .on('complete', data => {
          this.lifecycle.off('will-stop', resolve)
          if (data.results == null || data.results.length === 0) {
            resolve(null)
          }
        })
    })
    stopMeasure()
    return p
  }

  // Apply a change to both local and remote
  // At least one side should say it has already this change
  // In some cases, both sides have the change
  async apply(change /*: MetadataChange */) /*: Promise<void> */ {
    let { doc, seq } = change
    const { path } = doc
    log.debug({ path, seq, doc }, `Applying change ${seq}...`)

    if (metadata.shouldIgnore(doc, this.ignore)) {
      return this.pouch.setLocalSeq(change.seq)
    } else if (!metadata.wasSynced(doc) && isMarkedForDeletion(doc)) {
      await this.pouch.eraseDocument(doc)
      if (doc.docType === 'file') {
        this.events.emit('delete-file', _.clone(doc))
      }
      return this.pouch.setLocalSeq(change.seq)
    }

    const [side, sideName] = this.selectSide(doc)
    let stopMeasure = () => {}
    try {
      stopMeasure = measureTime('Sync#applyChange:' + sideName)

      if (!side) {
        log.info({ path }, 'up to date')
        return this.pouch.setLocalSeq(change.seq)
      } else if (sideName === 'remote' && doc.trashed) {
        // File or folder was just deleted locally
        const byItself = await this.trashWithParentOrByItself(doc, side)
        if (!byItself) {
          return
        }
      } else {
        await this.applyDoc(doc, side, sideName)
      }

      await this.pouch.setLocalSeq(change.seq)
      log.trace({ path, seq }, `Applied change on ${sideName} side`)

      // Clean up documents so that we don't mistakenly take action based on
      // previous changes and keep our Pouch documents as small as possible
      // and especially avoid deep nesting levels.
      if (doc.deleted) {
        await this.pouch.eraseDocument(doc)
        if (doc.docType === 'file') {
          this.events.emit('delete-file', _.clone(doc))
        }
      } else {
        delete doc.moveFrom
        delete doc.overwrite
        // We also update the sides in case the document is not erased
        await this.updateRevs(doc, sideName)
      }
    } catch (err) {
      // XXX: We process the error directly here because our tests call
      // `apply()` and some expect `updateErrors` to be called (e.g. when
      // applying a move with a failing content change).
      const syncErr = syncErrors.wrapError(err, sideName, change)
      if (
        [
          remoteErrors.INVALID_FOLDER_MOVE_CODE,
          remoteErrors.INVALID_METADATA_CODE,
          remoteErrors.MISSING_DOCUMENT_CODE,
          remoteErrors.UNKNOWN_INVALID_DATA_ERROR_CODE,
          remoteErrors.UNKNOWN_REMOTE_ERROR_CODE
        ].includes(syncErr.code)
      ) {
        log.error(
          { err: syncErr, change, path, sentry: true },
          `Sync error: ${syncErr.message}`
        )
      } else {
        log.warn(
          { err: syncErr, change, path },
          `Sync error: ${syncErr.message}`
        )
      }
      switch (syncErr.code) {
        case syncErrors.MISSING_PERMISSIONS_CODE:
        case syncErrors.NO_DISK_SPACE_CODE:
        case remoteErrors.INVALID_FOLDER_MOVE_CODE:
        case remoteErrors.INVALID_METADATA_CODE:
        case remoteErrors.INVALID_NAME_CODE:
        case remoteErrors.NEEDS_REMOTE_MERGE_CODE:
        case remoteErrors.NO_COZY_SPACE_CODE:
        case remoteErrors.PATH_TOO_DEEP_CODE:
        case remoteErrors.UNKNOWN_INVALID_DATA_ERROR_CODE:
        case remoteErrors.UNKNOWN_REMOTE_ERROR_CODE:
        case remoteErrors.UNREACHABLE_COZY_CODE:
        case remoteErrors.USER_ACTION_REQUIRED_CODE:
          // We will keep retrying to apply the change until it's fixed or the
          // user contacts our support.
          this.blockSyncFor({ err: syncErr, change })
          break
        case remoteErrors.CONFLICTING_NAME_CODE:
          /* When we fail to apply a change because of a name conflict on the
           * remote Cozy, it means we either:
           * 1. have another change to apply that will free the give name by
           *    moving the document or renaming it
           * 2. have not yet merged the remote change that took the name and
           *    would have generated a conflict copy
           * 3. have not merged the remote change that took the name and never
           *    will because we abandoned that change in the past
           *
           * We can solve 1. by marking our local change with an increased
           * error counter so it can be retried later, after we've applied the
           * other changes that would free the conflicting name.
           *
           * We can solve 2. by blocking the Sync process until we've fetched
           * and merged the new remote changes, thus generating a conflict
           * copy at the Merge level.
           *
           * We can only solve 3. by detecting that we've tried the solutions
           * to 1. and 2., still can't apply the given change and thus generate
           * a remote conflict at the Sync level instead of doing it at the
           * Merge level.
           */

          // We will retry to apply the change `MAX_SYNC_ATTEMPTS` times just
          // in case.
          if (!change.doc.errors || change.doc.errors < MAX_SYNC_ATTEMPTS) {
            // Solve 1. & 2.
            this.blockSyncFor({ err: syncErr, change })
          } else {
            log.error(
              { path, err: syncErr, change },
              'Document already exists on Cozy'
            )
            // Solve 3.
            await this.remote.resolveRemoteConflict(change.doc)
          }
          break
        case remoteErrors.MISSING_DOCUMENT_CODE:
          // Don't try more than MAX_SYNC_ATTEMPTS for the same operation
          if (!change.doc.errors || change.doc.errors < MAX_SYNC_ATTEMPTS) {
            this.blockSyncFor({ err: syncErr, change })
          } else {
            if (change.doc.deleted) {
              await this.skipChange(change, syncErr)
            } else if (sideName === 'remote') {
              delete change.doc.moveFrom
              delete change.doc.overwrite
              delete change.doc.remote

              if (metadata.isFile(change.doc)) {
                await this.remote.addFileAsync(change.doc)
              } else {
                await this.remote.addFolderAsync(change.doc)
              }
              await this.updateRevs(change.doc, 'remote')
            } else {
              await this.pouch.eraseDocument(change.doc)
              if (doc.docType === 'file') {
                this.events.emit('delete-file', _.clone(change.doc))
              }
            }
          }
          break
        case remoteErrors.MISSING_PARENT_CODE:
          /* When we fail to apply a change because its parent does not exist on
           * the remote Cozy, it means we either:
           * 1. have another change to apply that will create that parent
           * 2. have not yet merged the remote change that removed that parent
           * 3. have failed to sync the creation of the parent and will never
           *    succeed because we abandoned in the past
           * 4. have failed to merge its remote deletion and will never succeed
           *    because we abandoned in the past
           */
          if (!change.doc.errors || change.doc.errors < MAX_SYNC_ATTEMPTS) {
            // Solve 1. & 2.
            this.blockSyncFor({ err: syncErr, change })
          } else {
            log.error(
              { path, err: syncErr, change },
              'Parent directory is missing on Cozy'
            )
            const parent = await this.pouch.bySyncedPath(dirname(path))
            if (!parent) {
              // Solve 3.
              // This is a weird situation where we don't have a parent in
              // PouchDB. This should never be the case though.
              log.error(
                { path, err: syncErr, change, sentry: true },
                'Parent directory could not be found either on Cozy or PouchDB. Abandoning.'
              )
              this.skipChange(change, syncErr)
            } else if (parent.remote) {
              // We're in a fishy situation where we have a folder whose synced
              // path is the parent path of our document but its remote path is
              // not and the synchronization did not change this.
              // The database is corrupted and should be cleaned up.
              log.error(
                { path, err: syncErr, change, sentry: true },
                'Parent directory is desynchronized. Abandoning.'
              )
              this.skipChange(change, syncErr)
            } else {
              // Solve 3. or 4.
              await this.remote.addFolderAsync(parent)
            }
          }
          break
        case syncErrors.INCOMPATIBLE_DOC_CODE:
          await this.skipChange(change, syncErr)
          break
        default:
          // Don't try more than MAX_SYNC_ATTEMPTS for the same operation
          if (!change.doc.errors || change.doc.errors < MAX_SYNC_ATTEMPTS) {
            await this.updateErrors(change, syncErr)
          } else {
            await this.skipChange(change, syncErr)
          }
      }
    } finally {
      stopMeasure()
    }
  }

  async applyDoc(
    doc /*: SavedMetadata */,
    side /*: Writer */,
    sideName /*: SideName */
  ) /*: Promise<*> */ {
    const currentRev = metadata.side(doc, sideName)

    if (doc.incompatibilities && sideName === 'local' && doc.moveTo == null) {
      const was = doc.moveFrom
      if (was != null && was.incompatibilities == null) {
        // Move compatible -> incompatible
        if (was.childMove == null) {
          log.warn(
            {
              path: doc.path,
              oldpath: was.path,
              incompatibilities: doc.incompatibilities
            },
            `Trashing ${sideName} ${doc.docType} since new remote one is incompatible`
          )
          await side.trashAsync(was)
          if (was.docType === 'file') {
            this.events.emit('delete-file', _.clone(was))
          }
        } else {
          log.debug(
            { path: doc.path, incompatibilities: doc.incompatibilities },
            `incompatible ${doc.docType} should have been trashed with parent`
          )
        }
      } else {
        log.warn(
          { path: doc.path, incompatibilities: doc.incompatibilities },
          `Not syncing incompatible ${doc.docType}`
        )
        throw new IncompatibleDocError({ doc })
      }
    } else if (doc.docType !== 'file' && doc.docType !== 'folder') {
      throw new Error(`Unknown docType: ${doc.docType}`)
    } else if (isMarkedForDeletion(doc) && currentRev === 0) {
      // do nothing
    } else if (doc.moveTo != null) {
      log.debug(
        { path: doc.path },
        `Ignoring deleted ${doc.docType} metadata as move source`
      )
    } else if (doc.moveFrom != null) {
      const from = (doc.moveFrom /*: SavedMetadata */)
      log.debug(
        { path: doc.path },
        `Applying ${doc.docType} change with moveFrom`
      )

      if (from.incompatibilities && sideName === 'local') {
        await this.doAdd(side, doc)
      } else if (from.childMove) {
        await side.assignNewRemote(doc)
        if (doc.docType === 'file') {
          this.events.emit('transfer-move', _.clone(doc), _.clone(from))
        }
      } else {
        if (from.moveFrom && from.moveFrom.childMove) {
          await side.assignNewRemote(from)
        }
        await this.doMove(side, doc, from)
      }
      if (
        doc.docType === 'file' &&
        (!metadata.sameBinary(from, doc) ||
          (from.local.docType === 'file' &&
            from.remote.type === 'file' &&
            !metadata.sameBinary(from.local, from.remote)))
      ) {
        try {
          await side.overwriteFileAsync(doc, doc) // move & update
        } catch (err) {
          // the move succeeded, delete moveFrom and overwriteto avoid
          // re-applying these actions.
          delete doc.moveFrom
          delete doc.overwrite
          throw err
        }
      }
    } else if (isMarkedForDeletion(doc)) {
      log.debug({ path: doc.path }, `Applying ${doc.docType} deletion`)
      if (doc.docType === 'file') {
        await side.trashAsync(doc)
        this.events.emit('delete-file', _.clone(doc))
      } else {
        await side.deleteFolderAsync(doc)
      }
    } else if (currentRev === 0) {
      log.debug({ path: doc.path }, `Applying ${doc.docType} addition`)
      await this.doAdd(side, doc)
    } else {
      log.debug({ path: doc.path }, `Applying else for ${doc.docType} change`)
      let old
      try {
        old = (await this.pouch.getPreviousRev(
          doc._id,
          doc.sides.target - currentRev
        ) /*: ?SavedMetadata */)
      } catch (err) {
        await this.doOverwrite(side, doc)
      }

      if (old) {
        if (doc.docType === 'folder') {
          if (metadata.sameFolder(old, doc)) {
            log.debug({ path: doc.path }, 'Ignoring timestamp-only change')
          } else {
            await side.updateFolderAsync(doc)
          }
        } else if (metadata.sameBinary(old, doc)) {
          if (metadata.sameFile(old, doc)) {
            log.debug({ path: doc.path }, 'Ignoring timestamp-only change')
          } else {
            await side.updateFileMetadataAsync(doc)
          }
        } else {
          await side.overwriteFileAsync(doc, old)
          this.events.emit('transfer-started', _.clone(doc))
        }
      } // TODO else what do we do ?
    }
  }

  async doAdd(
    side /*: Writer */,
    doc /*: SavedMetadata */
  ) /*: Promise<void> */ {
    if (doc.docType === 'file') {
      await side.addFileAsync(doc)
      this.events.emit('transfer-started', _.clone(doc))
    } else {
      await side.addFolderAsync(doc)
    }
  }

  async doOverwrite(
    side /*: Writer */,
    doc /*: SavedMetadata */
  ) /*: Promise<void> */ {
    if (doc.docType === 'file') {
      // TODO: risky overwrite without If-Match
      await side.overwriteFileAsync(doc, null)
      this.events.emit('transfer-started', _.clone(doc))
    } else {
      await side.addFolderAsync(doc)
    }
  }

  async doMove(
    side /*: Writer */,
    doc /*: SavedMetadata */,
    old /*: SavedMetadata */
  ) /*: Promise<void> */ {
    await side.moveAsync(doc, old)
    if (doc.docType === 'file') {
      this.events.emit('transfer-move', _.clone(doc), _.clone(old))
    }
  }

  // Select which side will apply the change
  // It returns the side, its name, and also the last rev applied by this side
  selectSide(doc /*: SavedMetadata */) {
    switch (metadata.outOfDateSide(doc)) {
      case 'local':
        return [this.local, 'local']
      case 'remote':
        return [this.remote, 'remote']
      default:
        return []
    }
  }

  blockSyncFor(
    cause
    /*: {| err: RemoteError |} | {| err: SyncError, change: MetadataChange |} */
  ) {
    log.debug(cause, 'blocking sync for error')

    const { err } = cause

    this.lifecycle.blockFor(err.code)

    const retryDelay = syncErrors.retryDelay(err)

    const retry = async () => {
      this.events.off('user-action-done', retry)
      this.events.off('user-action-inprogress', waitBeforeRetry)
      this.events.off('user-action-skipped', skip)

      log.debug(cause, 'retrying after blocking error')

      if (err.code === remoteErrors.UNREACHABLE_COZY_CODE) {
        // We could simply fetch the remote changes but it could take time
        // before we're done fetching them and we want to notify the GUI we're
        // back online as soon as possible.
        if (await this.remote.ping()) {
          this.events.emit('online')
        } else {
          this.events.emit('offline')
          // $FlowFixMe intervals have a refresh() method starting with Node v10
          if (this.retryInterval) this.retryInterval.refresh()
          // We're still offline so no need to try fetching changes or
          // synchronizing.
          return
        }
      }

      clearInterval(this.retryInterval)

      if (cause.change) {
        // We increment the record's errors counter to keep track of the
        // retries and above all, save any changes made to the record by
        // `applyDoc()` and such (e.g. when applying a file move with update,
        // if the update fails, we want to remove the `moveFrom` attribute to
        // avoid re-applying the move which was already applied).
        await this.updateErrors(cause.change, cause.err)
      }

      // Await to make sure we've fetched potential remote changes
      if (!this.remote.watcher.running) {
        await this.remote.watcher.start()
      }

      this.lifecycle.unblockFor(err.code)
    }

    const waitBeforeRetry = () => {
      // The user is currently doing the required action so we postpone the next
      // retry up to `retryDelay` to give the user enough time to complete the
      // action.
      // $FlowFixMe intervals have a refresh() method starting with Node v10
      if (this.retryInterval) this.retryInterval.refresh()
    }

    const skip = async () => {
      this.events.off('user-action-done', retry)
      this.events.off('user-action-inprogress', waitBeforeRetry)
      this.events.off('user-action-skipped', skip)

      log.debug(cause, 'user skipped required action')

      clearInterval(this.retryInterval)

      if (cause.change) {
        await this.skipChange(cause.change, cause.err)
      }

      if (!this.remote.watcher.running) {
        await this.remote.watcher.start()
      }

      this.lifecycle.unblockFor(err.code)
    }

    // We'll automatically retry to sync the change after a delay
    this.retryInterval = setInterval(retry, retryDelay)

    //this.events.once('user-action-inprogress', retry)
    this.events.once('user-action-done', retry)
    this.events.once('user-action-inprogress', waitBeforeRetry)
    this.events.once('user-action-skipped', skip)

    // In case the error comes from the RemoteWatcher and not a change
    // application, we stop the watcher to avoid more errors.
    // It will be started again with the next retry or if the user action is
    // skipped.
    if (err instanceof remoteErrors.RemoteError) {
      this.remote.watcher.stop()
    }

    switch (err.code) {
      case remoteErrors.UNREACHABLE_COZY_CODE:
        this.events.emit('offline')
        break
      case remoteErrors.CONFLICTING_NAME_CODE:
      case remoteErrors.INVALID_FOLDER_MOVE_CODE:
      case remoteErrors.MISSING_DOCUMENT_CODE:
      case remoteErrors.MISSING_PARENT_CODE:
        // Hide the error from the user as we should be able to solve it
        break
      default:
        this.events.emit(
          'user-action-required',
          err,
          cause.change && cause.change.seq
        )
    }
  }

  // Increment the counter of errors for this document
  async updateErrors(
    change /*: MetadataChange */,
    err /*: SyncError */
  ) /*: Promise<void> */ {
    let { doc } = change
    if (!doc.errors) doc.errors = 0
    doc.errors++

    // Make sure isUpToDate(sourceSideName, doc) is still true
    const sourceSideName = otherSide(err.sideName)
    metadata.markSide(sourceSideName, doc, doc)

    try {
      await this.pouch.db.put(doc)
    } catch (err) {
      // If the doc can't be saved, it's because of a new revision.
      // So, we can skip this revision
      log.info(`Ignored ${change.seq}`, err)
      await this.pouch.setLocalSeq(change.seq)
    }
  }

  async skipChange(
    change /*: MetadataChange */,
    err /*: SyncError */
  ) /*: Promise<void> */ {
    const { doc } = change
    const { errors = 0 } = doc
    log.error(
      {
        err,
        path: doc.path,
        oldpath: _.get(doc, 'moveFrom.path'),
        sentry: true
      },
      `Failed to sync ${errors + 1} times. Giving up.`
    )
    return await this.pouch.setLocalSeq(change.seq)
  }

  // Update rev numbers for both local and remote sides
  async updateRevs(
    doc /*: SavedMetadata */,
    side /*: SideName */
  ) /*: Promise<*> */ {
    metadata.markAsUpToDate(doc)
    try {
      await this.pouch.put(doc)
    } catch (err) {
      // Conflicts can happen here, for example if the cozy-stack has generated
      // a thumbnail before apply has finished. In that case, we try to
      // reconciliate the documents.
      if (err && err.status === 409) {
        const unsynced /*: SavedMetadata */ = await this.pouch.bySyncedPath(
          doc.path
        )
        const other = otherSide(side)
        await this.pouch.put({
          ...unsynced,
          sides: {
            target: unsynced.sides.target + 1, // increase target because of new merge
            [side]: doc.sides.target,
            [other]: unsynced.sides[other] + 1 // increase side to mark change as applied
          }
        })
      } else {
        log.error(
          { path: doc.path, err, sentry: true },
          'Race condition on updateRevs'
        )
      }
    }
  }

  // Trash a file or folder. If a folder was deleted on local, we try to trash
  // only this folder on the remote, not every files and folders inside it, to
  // preserve the tree in the trash.
  async trashWithParentOrByItself(
    doc /*: SavedMetadata */,
    side /*: Writer */
  ) /*: Promise<boolean> */ {
    const parentPath = dirname(doc.path)
    if (parentPath !== '.') {
      let parent /*: SavedMetadata */ = await this.pouch.bySyncedPath(
        parentPath
      )

      if (!parent.trashed) {
        await Promise.delay(TRASHING_DELAY)
        parent = await this.pouch.bySyncedPath(parentPath)
      }

      if (parent.trashed && !metadata.isUpToDate('remote', parent)) {
        log.info(`${doc.path}: will be trashed with parent directory`)
        await this.trashWithParentOrByItself(parent, side)
        // Wait long enough that the remote has fetched one changes feed
        // TODO find a way to trigger the changes feed instead of waiting for it
        await Promise.delay(REMOTE_HEARTBEAT)
        return false
      }
    }

    log.info(`${doc.path}: should be trashed by itself`)
    await side.trashAsync(doc)
    if (doc.docType === 'file') {
      this.events.emit('delete-file', _.clone(doc))
    }
    return true
  }
}

module.exports = Sync
