/**
 * @module core/sync
 * @flow
 */

const autoBind = require('auto-bind')
const Promise = require('bluebird')

const { dirname, sep } = require('path')
const _ = require('lodash')

const { IncompatibleDocError } = require('../incompatibilities/platform')
const metadata = require('../metadata')
const remoteDocument = require('../remote/document')
const remoteErrors = require('../remote/errors')
const remoteConstants = require('../remote/constants')
const { otherSide } = require('../side')
const logger = require('../utils/logger')
const measureTime = require('../utils/perfs')
const { LifeCycle } = require('../utils/lifecycle')
const syncErrors = require('./errors')
const { DependencyGraph } = require('./dependency_graph')

/*::
import type EventEmitter from 'events'
import type { Ignore } from '../ignore'
import type { Local } from '../local'
import type { Pouch } from '../pouch'
import type { Remote } from '../remote'
import type { RemoteError } from '../remote/errors'
import type { SavedMetadata, MetadataLocalInfo, MetadataRemoteInfo } from '../metadata'
import type { SideName } from '../side'
import type { Writer } from '../writer'
import type { SyncError } from './errors'
import type { UserActionCommand } from '../syncstate'

export type PouchDBFeedData = {
  changes: {rev: string}[],
  doc: SavedMetadata,
  id: string,
  seq: number
};
export type SyncOperation =
  {| type: 'SKIP'|'NULL' |} |
  {|
    type: 'ADD'|'EDIT'|'DEL'|'MOVE',
    side: SideName
  |}
export type Change = PouchDBFeedData & { operation: SyncOperation };
*/

const log = logger({
  component: 'Sync'
})

const MAX_SYNC_RETRIES = 3

const isMarkedForDeletion = (doc /*: SavedMetadata */) => {
  // During a transition period, we'll need to consider both documents with the
  // deletion marker and documents which were deleted but not yet synced before
  // the application was updated and are thus completely _deleted from PouchDB.
  return doc.trashed || doc._deleted
}

const shouldAttemptRetry = (change /*: PouchDBFeedData */) => {
  // Don't retry more than MAX_SYNC_RETRIES for the same operation unless we're
  // running a test during which we don't want to wait for a retry.
  return (
    !process.env.SYNC_SHOULD_NOT_RETRY &&
    (!change.doc.errors || change.doc.errors < MAX_SYNC_RETRIES)
  )
}

// Returns the given side metadata of the given PouchDB record.
// It is meant to get the outdated side metadata of the record to compare it
// against the new metadata and decide which actions to take.
const outdatedMetadata = (
  doc /*: SavedMetadata */,
  sideName /*: SideName */
) /*: ?MetadataLocalInfo|?MetadataRemoteInfo */ =>
  sideName === 'remote'
    ? (doc.remote /*: MetadataRemoteInfo*/)
    : (doc.local /*: MetadataLocalInfo*/)

// Find out which operation should be propagated based on hints saved in the
// changed PouchDB record.
// The operation will be used to build the changes dependency tree.
const detectOperation = async (
  change /*: PouchDBFeedData */,
  sync /*: Sync */
) /*: Promise<SyncOperation> */ => {
  const outdatedSide = sync.selectSide(change)
  if (!outdatedSide) {
    return { type: 'SKIP' }
  }

  const { doc } = change

  if (metadata.shouldIgnore(doc, sync.ignore)) {
    return { type: 'SKIP' }
  } else if (!metadata.wasSynced(doc) && isMarkedForDeletion(doc)) {
    return { type: 'SKIP' }
  } else if (doc.moveFrom != null) {
    const from = (doc.moveFrom /*: SavedMetadata */)

    if (from.incompatibilities && outdatedSide.name === 'local') {
      return { type: 'ADD', side: outdatedSide.name }
    } else {
      return { type: 'MOVE', side: outdatedSide.name } // XXX: can be move with update but we don't care for now
    }
  } else if (isMarkedForDeletion(doc)) {
    return { type: 'DEL', side: outdatedSide.name }
  } else if (!metadata.wasSynced(doc)) {
    return { type: 'ADD', side: outdatedSide.name }
  } else {
    try {
      const outdated = outdatedMetadata(doc, outdatedSide.name)
      if (outdated) {
        if (
          outdatedSide.name === 'local' &&
          metadata.equivalentLocal(outdated, doc)
        ) {
          return { type: 'NULL' }
        } else if (
          outdatedSide.name === 'remote' &&
          metadata.equivalentRemote(outdated, doc)
        ) {
          return { type: 'NULL' }
        } else {
          // We take as granted that doc and old have the same doc type (i.e.
          // file or folder).
          return { type: 'EDIT', side: outdatedSide.name }
        }
      } else {
        return { type: 'ADD', side: outdatedSide.name }
      }
    } catch (err) {
      return { type: 'EDIT', side: outdatedSide.name }
    }
  }
}

// Compare 2 Changes to determine which one should be propagated first.
// It is the kind of function that could be passed to `Array.sort()`. It should
// return:
// - a negative value when the first Change argument should be propagated
//   before the second Change argument
// - a positive value when the second Change should be propagated before the
//   first one
// - 0 when the order of the Changes should be kept
const compareChanges = (
  { operation: opA, doc: docA } /*: Change */,
  { operation: opB, doc: docB } /*: Change */
) => {
  // Operations on different sides don't have dependencies for now. This will
  // probably be revisited in the future.
  // SKIP and NULL operations don't have a side since we only update the PouchDB
  // record and thus don't have dependencies.
  if (opA.side != null && opB.side != null && opA.side === opB.side) {
    if (opA.type === opB.type) {
      // Handle same operation parent change before child changes
      if (docB.path.startsWith(docA.path + sep)) return -1
      else if (docA.path.startsWith(docB.path + sep)) return 1
    }

    if (opA.type === 'DEL' && opB.type === 'MOVE' && docB.moveFrom != null) {
      // Handle parent deletion after child move outside of parent
      if (
        docB.moveFrom.path.startsWith(docA.path + sep) &&
        !docB.path.startsWith(docA.path + sep)
      ) {
        return 1
      }
    }
    if (opB.type === 'DEL' && opA.type === 'MOVE' && docA.moveFrom != null) {
      // Handle parent deletion after child move outside of parent
      if (
        docA.moveFrom.path.startsWith(docB.path + sep) &&
        !docA.path.startsWith(docB.path + sep)
      )
        return -1
    }
    if (opA.type === 'ADD' && opB.type === 'MOVE') {
      // Handle child addtion after parent move
      if (docA.path.startsWith(docB.path + sep)) return 1
      // Handle move to dir after dir addition
      if (docB.path.startsWith(docA.path + sep)) return -1
    }
    if (opB.type === 'ADD' && opA.type === 'MOVE') {
      // Handle child addtion after parent move
      if (docB.path.startsWith(docA.path + sep)) return -1
      // Handle move to dir after dir addition
      if (docA.path.startsWith(docB.path + sep)) return 1
    }
  }

  return 0
}

// Save the given changes' PouchDB records without making any modifications to
// them so their associated sequence number in PouchDB's changesfeed is
// increased.
const rescheduleChanges = async (
  changes /*: Change[] */,
  { pouch } /*: Sync */
) /*: Promise<void> */ => {
  log.info('rescheduling changes with low sequence numbers')
  await pouch.bulkDocs(changes.map(c => c.doc))
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
  lifecycle: LifeCycle
  retryInterval: ?IntervalID
  currentChangesToApply: Change[]
  */

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
    this.currentChangesToApply = []

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

    this.events.once('power-suspend', this.suspend)

    // Errors emitted while the watchers are starting (e.g. revoked OAuth
    // client) will not be thrown and thus not handled if these listeners are
    // not attached before starting the watchers.
    // This results in the Sync starting without both watchers.
    this.remote.watcher.onError(err => {
      this.blockSyncFor({ err })
    })
    this.remote.watcher.onFatal(err => {
      this.fatal(err)
    })
    this.local.watcher.onFatal(err => {
      this.fatal(err)
    })

    try {
      await this.local.start()
      await this.remote.start()
    } catch (err) {
      return this.fatal(err)
    }

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

  suspend() {
    log.info('suspending synchronization')

    this.events.once('power-resume', this.resume)

    try {
      this.lifecycle.begin('stop')
    } catch (err) {
      return
    }
    if (this.changes) {
      this.changes.cancel()
      this.changes = null
    }

    this.local.stop()
    this.remote.stop()
    clearInterval(this.retryInterval)
    this.retryInterval = null
    this.lifecycle.unblockFor('all')
    this.lifecycle.end('stop')
  }

  async resume() {
    log.info('resuming synchronization')
    await this.start()
  }

  // Stop the synchronization
  async stop() /*: Promise<void> */ {
    // In case an interval timer was started, we clear it to make sure it won't
    // trigger actions after Sync was stopped.
    // This is especially useful in tests.
    clearInterval(this.retryInterval)

    this.events.off('power-resume', this.resume)
    this.events.off('power-suspend', this.suspend)

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
    this.retryInterval = null
    this.lifecycle.unblockFor('all')
    this.lifecycle.end('stop')
  }

  async stopped() {
    await this.lifecycle.stopped()
  }

  fatal(err /*: Error */) {
    log.error({ err, sentry: true }, `Sync fatal: ${err.message}`)

    if (this.lifecycle.willStart()) {
      // The start phase needs to be ended before calling stop() or we won't be
      // able to stop Sync as it waits for Sync to be fully started but this
      // might never happen since we got a fatal error.
      this.lifecycle.end('start')
    }

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
    let change /*: Change */ = {}
    while (!this.lifecycle.willStop()) {
      await this.lifecycle.ready()

      const release = await this.pouch.lock(this)
      try {
        const seq = await this.pouch.getLocalSeq()
        const changes = await this.getNextChanges(seq)
        if (changes.length === 0) {
          log.debug('No more metadata changes for now')
          break
        }

        this.currentChangesToApply = new DependencyGraph(changes, {
          compare: compareChanges
        }).toArray()

        // If a change is dependent on another change that was merged later (and
        // thus has a greater sequence number), we reschedule the dependent one
        // as it would otherwise be skipped once its dependency is applied and
        // the feed's sequence number is increased to the dependency's sequence
        // number.
        //
        // We also reschedule all following changes to grossly keep the order in
        // which "independent" changes were made.
        const reschedulingStart = this.currentChangesToApply.findIndex(
          // Find decreasing sequence
          (change, index, changes) => {
            return index > 0 ? change.seq < changes[index - 1].seq : false
          }
        )
        if (reschedulingStart > 0) {
          const changesToReschedule =
            this.currentChangesToApply.splice(reschedulingStart)
          await rescheduleChanges(changesToReschedule, this)
        }

        // We can now apply all changes that were not rescheduled
        for (const changeToApply of this.currentChangesToApply) {
          // We need to set the value of `change` so it can be reused in the
          // `catch` block.
          change = changeToApply
          await this.apply(change)
        }
      } catch (err) {
        if (this.lifecycle.willStop()) return
        if (!(err instanceof syncErrors.SyncError)) throw err

        const {
          sideName,
          doc: { path }
        } = err

        if (
          [
            remoteErrors.INVALID_FOLDER_MOVE_CODE,
            remoteErrors.INVALID_METADATA_CODE,
            remoteErrors.MISSING_DOCUMENT_CODE,
            remoteErrors.UNKNOWN_INVALID_DATA_ERROR_CODE,
            remoteErrors.UNKNOWN_REMOTE_ERROR_CODE
          ].includes(err.code)
        ) {
          log.error(
            { err, change, path, sentry: true },
            `Sync error: ${err.message}`
          )
        } else {
          log.warn({ err, change, path }, `Sync error: ${err.message}`)
        }
        switch (err.code) {
          case remoteErrors.COZY_NOT_FOUND_CODE:
            this.fatal(err)
            break
          case syncErrors.EXCLUDED_DIR_CODE:
          case syncErrors.INCOMPATIBLE_DOC_CODE:
          case syncErrors.MISSING_PERMISSIONS_CODE:
          case syncErrors.NO_DISK_SPACE_CODE:
          case remoteErrors.CONFLICTING_NAME_CODE:
          case remoteErrors.FILE_TOO_LARGE_CODE:
          case remoteErrors.INVALID_FOLDER_MOVE_CODE:
          case remoteErrors.INVALID_METADATA_CODE:
          case remoteErrors.INVALID_NAME_CODE:
          case remoteErrors.NEEDS_REMOTE_MERGE_CODE:
          case remoteErrors.NO_COZY_SPACE_CODE:
          case remoteErrors.PATH_TOO_DEEP_CODE:
          case remoteErrors.REMOTE_MAINTENANCE_ERROR_CODE:
          case remoteErrors.UNKNOWN_INVALID_DATA_ERROR_CODE:
          case remoteErrors.UNKNOWN_REMOTE_ERROR_CODE:
          case remoteErrors.UNREACHABLE_COZY_CODE:
          case remoteErrors.USER_ACTION_REQUIRED_CODE:
            // We will keep retrying to apply the change until it's fixed or the
            // user contacts our support.
            // See `default` case for other blocking errors for which we'll stop
            // retrying after 3 failed attempts.
            this.blockSyncFor({ err, change })
            break
          case remoteErrors.DOCUMENT_IN_TRASH_CODE:
            delete change.doc.moveFrom
            delete change.doc.overwrite

            // Go ahead and mark remote document as trashed
            change.doc.remote = remoteDocument.trashedDoc(change.doc.remote)

            await this.updateRevs(change.doc, sideName)
            break
          case remoteErrors.MISSING_DOCUMENT_CODE:
            if (shouldAttemptRetry(change)) {
              this.blockSyncFor({ err, change })
            } else {
              if (isMarkedForDeletion(change.doc)) {
                await this.skipChange(change, err)
              } else if (sideName === 'remote') {
                delete change.doc.moveFrom
                delete change.doc.overwrite
                delete change.doc.remote

                await this.doAdd(this.remote, change.doc)
                await this.updateRevs(change.doc, 'remote')
              } else {
                await this.pouch.eraseDocument(change.doc)
                if (change.doc.docType === metadata.FILE) {
                  this.events.emit('delete-file', change.doc)
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
            if (shouldAttemptRetry(change)) {
              // Solve 1. & 2.
              this.blockSyncFor({ err, change })
            } else {
              log.error(
                { path, err, change },
                'Parent directory is missing on Cozy'
              )
              const parent = await this.pouch.bySyncedPath(dirname(path))
              if (!parent) {
                // Solve 3.
                // This is a weird situation where we don't have a parent in
                // PouchDB. This should never be the case though.
                log.error(
                  { path, err, change, sentry: true },
                  'Parent directory could not be found either on Cozy or PouchDB. Abandoning.'
                )
                await this.skipChange(change, err)
              } else if (parent.remote) {
                // We're in a fishy situation where we have a folder whose synced
                // path is the parent path of our document but its remote path is
                // not and the synchronization did not change this.
                // The database is corrupted and should be cleaned up.
                log.error(
                  { path, err, change, sentry: true },
                  'Parent directory is desynchronized. Abandoning.'
                )
                await this.skipChange(change, err)
              } else {
                // Solve 3. or 4.
                await this.remote.addFolderAsync(parent)
              }
            }
            break
          default:
            if (shouldAttemptRetry(change)) {
              this.blockSyncFor({ err, change })
            } else {
              await this.skipChange(change, err)
            }
        }
      } finally {
        release()
      }
    }
  }

  // We filter with the byPath view to reject design documents
  //
  // Note: it is difficult to pick only one change at a time because pouch can
  // emit several docs in a row, and `limit: 1` seems to be not effective!
  baseChangeOptions(seq /*: number */) /*: Object */ {
    return {
      limit: 1,
      since: seq,
      filter: '_view',
      view: 'byPath',
      return_docs: false
    }
  }

  // Wait until a change is emitted by PouchDB into its changesfeed (i.e. we've
  // merged some change on a document).
  async waitForNewChanges(seq /*: number */) {
    log.trace({ seq }, 'Waiting for changes since seq')
    const opts = this.baseChangeOptions(seq)
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

  async getNextChanges(seq /*: number */) /*: Promise<Change[]> */ {
    const stopMeasure = measureTime('Sync#getNextChanges')
    const opts = {
      ...this.baseChangeOptions(seq),
      include_docs: true,
      limit: null
    }
    const p = new Promise((resolve, reject) => {
      const changes = []
      const asyncOps = []
      const noChanges = () => {
        resolve([])
      }

      this.lifecycle.once('will-stop', noChanges)
      this.changes = this.pouch.db
        .changes(opts)
        .on('change', async data => {
          this.lifecycle.off('will-stop', noChanges)
          if (
            changes.length === 0 &&
            metadata.shouldIgnore(data.doc, this.ignore)
          ) {
            asyncOps.push(this.pouch.setLocalSeq(data.seq))
          } else if (
            changes.length === 0 &&
            metadata.isUpToDate('local', data.doc) &&
            metadata.isUpToDate('remote', data.doc)
          ) {
            log.info({ path: data.doc.path }, 'up to date')
            asyncOps.push(this.pouch.setLocalSeq(data.seq))
          } else {
            asyncOps.push(
              detectOperation(data, this).then(op => {
                data.operation = op
                changes.push(data)
                return
              })
            )
          }
        })
        .on('error', err => {
          this.lifecycle.off('will-stop', noChanges)
          reject(err)
        })
        .on('complete', async data => {
          this.lifecycle.off('will-stop', noChanges)
          if (data.results == null || data.results.length === 0) {
            await Promise.all(asyncOps)
            resolve(changes)
          }
        })
    })
    stopMeasure()
    return p
  }

  // Wait for a change in PouchDB's changesfeed after the given sequence and
  // with the expected synced path.
  //
  // We should be careful to not hold a lock while we wait for this change and
  // that it will indeed be merged at some point or we will end up waiting
  // forever.
  async waitForNewChangeOn(seq /*: number */, expectedPath /*: string */) {
    log.debug({ path: expectedPath }, 'Waiting for new change to be merged')

    return new Promise((resolve, reject) => {
      const opts = {
        live: true,
        limit: 1,
        since: seq,
        filter: '_view',
        view: 'byPath',
        return_docs: false,
        include_docs: true
      }
      const feedObserver = this.pouch.db
        .changes(opts)
        .on('change', ({ doc }) => {
          if (doc.path === expectedPath) {
            log.debug({ path: expectedPath }, 'New change merged')
            feedObserver.cancel()
            resolve()
          }
        })
        .on('error', err => {
          feedObserver.cancel()
          reject(err)
        })

      setTimeout(() => {
        log.debug(
          { path: expectedPath },
          'No changes merged in 5 minutes. Moving on'
        )
        feedObserver.cancel()
        resolve()
      }, 5 * 60 * 1000)
    })
  }

  // Apply a change to both local and remote
  // At least one side should say it has already this change
  // In some cases, both sides have the change
  async apply(change /*: Change */) /*: Promise<void> */ {
    let stopMeasure = () => {}
    try {
      this.events.emit('sync-current', change.seq)

      let { doc, seq } = change
      const { path } = doc
      log.debug({ path, seq, doc }, `Applying change ${seq}...`)

      if (metadata.shouldIgnore(doc, this.ignore)) {
        return this.pouch.setLocalSeq(seq)
      } else if (!metadata.wasSynced(doc) && isMarkedForDeletion(doc)) {
        await this.pouch.eraseDocument(doc)
        if (doc.docType === metadata.FILE) {
          this.events.emit('delete-file', doc)
        }
        return this.pouch.setLocalSeq(seq)
      }

      const side = this.selectSide(change)
      if (!side) {
        log.info({ path }, 'up to date')
        return this.pouch.setLocalSeq(seq)
      }

      stopMeasure = measureTime('Sync#applyChange:' + side.name)

      try {
        await this.applyDoc(doc, side)
      } catch (err) {
        throw syncErrors.wrapError(err, side.name, change)
      }

      await this.pouch.setLocalSeq(seq)
      log.trace({ path, seq }, `Applied change on ${side.name} side`)

      // Clean up documents so that we don't mistakenly take action based on
      // previous changes and keep our Pouch documents as small as possible
      // and especially avoid deep nesting levels.
      if (doc.trashed) {
        await this.pouch.eraseDocument(doc)
        if (doc.docType === metadata.FILE) {
          this.events.emit('delete-file', doc)
        }
      } else {
        delete doc.moveFrom
        delete doc.overwrite
        // We also update the sides in case the document is not erased
        await this.updateRevs(doc, side.name)
      }
    } finally {
      stopMeasure()
    }
  }

  async applyDoc(
    doc /*: SavedMetadata */,
    side /*: Writer */
  ) /*: Promise<*> */ {
    if (doc.incompatibilities && side.name === 'local') {
      const was = doc.moveFrom
      if (was != null && was.incompatibilities == null) {
        // Move compatible -> incompatible
        if (!was.childMove) {
          log.warn(
            {
              path: doc.path,
              oldpath: was.path,
              incompatibilities: doc.incompatibilities
            },
            `Not syncing ${side.name} ${doc.docType} since new remote one is incompatible`
          )
        }
      } else {
        log.warn(
          { path: doc.path, incompatibilities: doc.incompatibilities },
          `Not syncing incompatible ${doc.docType}`
        )
      }
      throw new IncompatibleDocError({ doc })
    } else if (
      doc.docType !== metadata.FILE &&
      doc.docType !== metadata.FOLDER
    ) {
      throw new Error(`Unknown docType: ${doc.docType}`)
    } else if (!metadata.wasSynced(doc) && isMarkedForDeletion(doc)) {
      // do nothing
    } else if (doc.moveFrom != null) {
      const from = (doc.moveFrom /*: SavedMetadata */)
      log.debug(
        { path: doc.path },
        `Applying ${doc.docType} change with moveFrom`
      )

      if (from.incompatibilities && side.name === 'local') {
        await this.doAdd(side, doc)
      } else if (from.childMove) {
        await this.doChildMove(side, doc, from)
      } else {
        if (from.moveFrom && from.moveFrom.childMove) {
          await this.doChildMove(side, from, from.moveFrom)
        }
        await this.doMove(side, doc, from)
      }
      if (
        doc.docType === metadata.FILE &&
        (!metadata.sameBinary(from, doc) ||
          (from.local.docType === metadata.FILE &&
            from.remote.type === remoteConstants.FILE_TYPE &&
            !metadata.sameBinary(from.local, from.remote)))
      ) {
        try {
          await this.doOverwrite(side, doc) // move & update
        } catch (err) {
          // the move succeeded, delete moveFrom and overwrite to avoid
          // re-applying these actions.
          delete doc.moveFrom
          delete doc.overwrite
          throw err
        }
      }
    } else if (isMarkedForDeletion(doc)) {
      log.debug({ path: doc.path }, `Applying ${doc.docType} deletion`)
      await this.trashWithParentOrByItself(doc, side)
    } else if (!metadata.wasSynced(doc)) {
      log.debug({ path: doc.path }, `Applying ${doc.docType} addition`)
      await this.doAdd(side, doc)
    } else {
      log.debug({ path: doc.path }, `Applying else for ${doc.docType} change`)
      const outdated = outdatedMetadata(doc, side.name)
      if (outdated) {
        if (
          (side.name === 'local' && metadata.equivalentLocal(outdated, doc)) ||
          (side.name === 'remote' && metadata.equivalentRemote(outdated, doc))
        ) {
          log.debug({ path: doc.path }, 'Ignoring timestamp-only change')
        } else if (metadata.isFolder(doc)) {
          await side.updateFolderAsync(doc)
        } else if (metadata.isFile(doc)) {
          if (metadata.sameBinary(outdated, doc)) {
            await side.updateFileMetadataAsync(doc)
          } else {
            await this.doOverwrite(side, doc)
          }
        }
      } else {
        // If we don't have an opposite side (i.e. old), then it's a creation
        // and it should have been dealt with by another conditionnal block.
        // This means we should never run this code block but we'll add it just
        // in case.
        log.debug(
          { path: doc.path, sentry: true },
          `Applying unexpected ${doc.docType} addition`
        )
        await this.doAdd(side, doc)
      }
    }
  }

  async doAdd(
    side /*: Writer */,
    doc /*: SavedMetadata */
  ) /*: Promise<void> */ {
    if (metadata.isFile(doc)) {
      this.events.emit('transfer-started', doc)
      try {
        await side.addFileAsync(doc, ({ transferred }) => {
          // XXX: progress will never be emitted when we copy the content from
          // an existing local file since we don't download anything.
          this.events.emit('transfer-progress', doc, { transferred })
        })
        this.events.emit('transfer-done', doc)
      } catch (err) {
        this.events.emit('transfer-failed', doc)
        throw err
      }
    } else {
      await side.addFolderAsync(doc)
    }
  }

  async doOverwrite(
    side /*: Writer */,
    doc /*: SavedMetadata */
  ) /*: Promise<void> */ {
    this.events.emit('transfer-started', doc)
    try {
      await side.overwriteFileAsync(doc, ({ transferred }) => {
        // XXX: progress will never be emitted when we copy the content from
        // an existing local file since we don't download anything.
        this.events.emit('transfer-progress', doc, { transferred })
      })
      this.events.emit('transfer-done', doc)
    } catch (err) {
      this.events.emit('transfer-failed', doc)
      throw err
    }
  }

  async doMove(
    side /*: Writer */,
    doc /*: SavedMetadata */,
    from /*: SavedMetadata */
  ) /*: Promise<void> */ {
    await side.moveAsync(doc, from)
    if (doc.docType === metadata.FILE) {
      this.events.emit('transfer-move', _.clone(doc), _.clone(from))
    }
  }

  async doChildMove(
    side /*: Writer */,
    doc /*: SavedMetadata */,
    from /*: SavedMetadata */
  ) /*: Promise<void> */ {
    const oldParentPath = dirname(from.path)
    const newParentPath = dirname(doc.path)
    const parent = await this.pouch.bySyncedPath(newParentPath)
    if (parent && parent.moveFrom && parent.moveFrom.path === oldParentPath) {
      // If the parent move was not successfully synchronized, prevent the child
      // move synchronization by throwning a SyncError.
      throw new syncErrors.UnsyncedParentMoveError(parent)
    }

    await side.assignNewRemote(doc)
    if (doc.docType === metadata.FILE) {
      this.events.emit('transfer-move', _.clone(doc), _.clone(from))
    }
  }

  // Select which side will apply the change
  // It returns the side, its name, and also the last rev applied by this side
  selectSide(change /*: { doc: SavedMetadata } */) /*: ?Writer */ {
    const { doc } = change
    switch (metadata.outOfDateSide(doc)) {
      case 'local':
        return this.local
      case 'remote':
        return this.remote
      default:
        return null
    }
  }

  blockSyncFor(
    cause
    /*: {| err: RemoteError |} | {| err: SyncError, change: Change |} */
  ) {
    log.debug(cause, 'blocking sync for error')

    const { err } = cause

    this.lifecycle.blockFor(err.code)

    const waitBeforeRetry = () => {
      // The user is currently doing the required action so we postpone the next
      // retry up to `retryDelay` to give the user enough time to complete the
      // action.
      // $FlowFixMe intervals have a refresh() method starting with Node v10
      if (this.retryInterval) this.retryInterval.refresh()
    }
    const executeCommand = async (
      { cmd } /*: { cmd: UserActionCommand } */
    ) => {
      this.events.off('user-action-inprogress', waitBeforeRetry)
      this.events.off('user-action-command', executeCommand)

      // Remove the user action from the list and thus the UI
      this.events.emit(
        'user-action-done',
        err,
        cause.change && cause.change.seq
      )

      switch (cmd) {
        case 'retry':
          await syncErrors.retry(cause, this)
          break
        case 'skip':
          await syncErrors.skip(cause, this)
          break
        case 'create-conflict':
          await syncErrors.createConflict(cause, this)
          break
        case 'link-directories':
          await syncErrors.linkDirectories(cause, this)
          break
        default:
          log.error(
            { path: cause.change && cause.change.doc.path, cmd, sentry: true },
            'received invalid user action command'
          )
          await syncErrors.retry(cause, this)
      }

      this.lifecycle.unblockFor(err.code)
    }

    // Clear any existing interval since we'll replace it
    clearInterval(this.retryInterval)
    // We'll automatically retry to sync the change after a delay
    const retryDelay = syncErrors.retryDelay(err)
    this.retryInterval = setInterval(
      executeCommand.bind(this, { cmd: 'retry' }),
      retryDelay
    )

    // FIXME: possible memory leak as it seems possible to add lots of listeners
    // without removing them (maybe if we have multiple blocking changes?)
    this.events.once('user-action-inprogress', waitBeforeRetry)
    this.events.once('user-action-command', executeCommand)

    // In case the error comes from the RemoteWatcher and not a change
    // application, we stop the watcher to avoid more errors.
    // It will be started again with the next retry or if the user action is
    // skipped.
    if (err instanceof remoteErrors.RemoteError) {
      this.remote.watcher.stop()
    }

    if (err.code === remoteErrors.UNREACHABLE_COZY_CODE) {
      this.remote.watcher.stop()
      this.events.emit('offline')
    } else if (err instanceof syncErrors.SyncError) {
      switch (err.code) {
        case syncErrors.EXCLUDED_DIR_CODE:
        case syncErrors.INCOMPATIBLE_DOC_CODE:
        case syncErrors.MISSING_PERMISSIONS_CODE:
        case syncErrors.NO_DISK_SPACE_CODE:
        case remoteErrors.CONFLICTING_NAME_CODE:
        case remoteErrors.FILE_TOO_LARGE_CODE:
        case remoteErrors.INVALID_METADATA_CODE:
        case remoteErrors.INVALID_NAME_CODE:
        case remoteErrors.NEEDS_REMOTE_MERGE_CODE:
        case remoteErrors.NO_COZY_SPACE_CODE:
        case remoteErrors.PATH_TOO_DEEP_CODE:
        case remoteErrors.REMOTE_MAINTENANCE_ERROR_CODE:
        case remoteErrors.UNKNOWN_REMOTE_ERROR_CODE:
        case remoteErrors.USER_ACTION_REQUIRED_CODE:
          this.events.emit(
            'user-alert',
            err,
            cause.change && cause.change.seq,
            cause.change &&
              cause.change.operation.side != null &&
              cause.change.operation.side
          )
          break
        default:
        // Hide the error from the user as we should be able to solve it
      }
    } else {
      switch (err.code) {
        case remoteErrors.REMOTE_MAINTENANCE_ERROR_CODE:
        case remoteErrors.UNKNOWN_REMOTE_ERROR_CODE:
          this.events.emit('user-alert', err)
          break
        default:
        // Hide the error from the user as we should be able to solve it
      }
    }
  }

  // Increment the counter of errors for this document
  async updateErrors(
    change /*: Change */,
    err /*: SyncError */
  ) /*: Promise<void> */ {
    const { doc } = change

    try {
      doc.errors = (doc.errors || 0) + 1

      // Make sure isUpToDate(sourceSideName, doc) is still true
      const sourceSideName = otherSide(err.sideName)
      metadata.markSide(sourceSideName, doc, doc)

      await this.pouch.put(doc, { checkInvariants: false })
    } catch (err) {
      // If the doc can't be saved, it's because of a new revision.
      // So, we can skip this revision
      if (err.status === 409) {
        const was = await this.pouch.byIdMaybe(doc._id)
        log.info({ err, doc, was }, `Ignored ${change.seq}`)
      } else {
        log.info({ err }, `Ignored ${change.seq}`)
      }
      await this.pouch.setLocalSeq(change.seq)
    }
  }

  async skipChange(
    change /*: Change */,
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
    await this.pouch.setLocalSeq(change.seq)
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
  ) /*: Promise<void> */ {
    const parentPath = dirname(doc.path)
    if (parentPath !== '.') {
      const parent /*: SavedMetadata */ = await this.pouch.bySyncedPath(
        parentPath
      )

      if (
        parent &&
        isMarkedForDeletion(parent) &&
        !metadata.isUpToDate(side.name, parent)
      ) {
        log.info(
          { path: doc.path },
          `${doc.docType} will be trashed within its parent directory`
        )
        // XXX: doc will be erased from PouchDB as it is marked as `deleted`.
        // This means that, until the parent deletion is synchronized, our local
        // PouchDB won't reflect the reality.
        return
      }
    }

    if (metadata.isFolder(doc)) {
      log.info({ path: doc.path }, 'folder will be trashed with its content')

      // Erase child records as they will be trashed with their parent
      const children = await this.pouch.byRecursivePath(doc.path)
      await this.pouch.eraseDocuments(children)

      for (const child of children) {
        if (metadata.isFile(child)) {
          this.events.emit('delete-file', child)
        }

        // Remove potential child changes from the list of current changes to
        // apply.
        const maybeIndex = this.currentChangesToApply.findIndex(
          change => change.doc._id === child._id
        )
        if (maybeIndex) this.currentChangesToApply.splice(maybeIndex, 1)
      }
    } else {
      log.info({ path: doc.path }, 'file will be trashed by itself')
    }

    await side.trashAsync(doc)

    if (metadata.isFile(doc)) {
      this.events.emit('delete-file', doc)
    }
  }
}

module.exports = {
  MAX_SYNC_RETRIES,
  compareChanges,
  Sync
}
