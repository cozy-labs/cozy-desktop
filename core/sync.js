/**
 * @module core/sync
 * @flow
 */

const autoBind = require('auto-bind')
const Promise = require('bluebird')

const { dirname } = require('path')
const _ = require('lodash')

const metadata = require('./metadata')
const { handleCommonCozyErrors } = require('./remote/cozy')
const { HEARTBEAT } = require('./remote/watcher')
const { otherSide } = require('./side')
const logger = require('./utils/logger')
const measureTime = require('./utils/perfs')

/*::
import type EventEmitter from 'events'
import type { Ignore } from './ignore'
import type Local from './local'
import type { Pouch } from './pouch'
import type { Remote } from './remote'
import type { Metadata } from './metadata'
import type { SideName } from './side'
import type { Writer } from './writer'
*/

const log = logger({
  component: 'Sync'
})

const MAX_SYNC_ATTEMPTS = 3

const TRASHING_DELAY = 1000

/*::
export type MetadataChange = {
  changes: {rev: string}[],
  doc: Metadata,
  id: string,
  seq: number
};

export type SyncMode =
  | "pull"
  | "push"
  | "full";
*/

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
  stopRequested: Promise
  started: ?Promise<boolean>
  running: ?Promise

  diskUsage: () => Promise<*>
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
    this.stopRequested = false

    autoBind(this)
  }

  // Start to synchronize the remote cozy with the local filesystem
  // First, start metadata synchronization in pouch, with the watchers
  // Then, when a stable state is reached, start applying changes from pouch
  async start() /*: Promise<void> */ {
    if (this.started && (await this.started)) return

    let runningResolve, runningReject
    this.running = new Promise((resolve, reject) => {
      runningResolve = resolve
      runningReject = reject
    })

    this.started = new Promise(async (resolve, reject) => {
      if (this.stopRequested) {
        reject()
        return
      }

      log.info('Starting Sync...')

      try {
        await this.local.start()
        const localRunning = this.local.watcher.running
        const {
          running: remoteRunning,
          started: remoteStarted
        } = this.remote.start()
        await remoteStarted

        Promise.all([localRunning, remoteRunning]).catch(err => {
          if (runningReject) runningReject(err)
        })
      } catch (err) {
        log.error({ err }, 'Could not start watchers')
        this.local.stop()
        this.remote.stop()
        reject(err)
      }
      resolve(true)
    })

    await this.started

    log.info('Sync started')

    try {
      // eslint-disable-next-line no-constant-condition
      while (!this.stopRequested) {
        await this.sync()
      }
    } catch (err) {
      log.error({ err }, 'Sync error')
      throw err
    } finally {
      if (this.changes) {
        this.changes.cancel()
        this.changes = null
      }

      await Promise.all([this.local.stop(), this.remote.stop()])

      this.started = null
      if (runningResolve) {
        runningResolve()
      }
      log.info('Sync stopped')
    }
  }

  // Manually force a full synchronization
  async forceSync() {
    await this.stop()
    await this.start()
  }

  // Stop the synchronization
  async stop() {
    if (this.started) await this.started
    log.info('Stopping Sync...')
    this.stopRequested = true
    this.events.emit('stopRequested')
    const stopped = this.running || Promise.resolve()
    stopped.then(() => {
      this.stopRequested = false
    })
    return stopped
  }

  // TODO: remove waitForNewChanges to .start while(true)
  async sync(waitForNewChanges /*: boolean */ = true) /*: Promise<*> */ {
    let seq = await this.pouch.getLocalSeqAsync()
    if (waitForNewChanges) {
      const change = await this.waitForNewChanges(seq)
      if (change == null) return
    }
    const release = await this.pouch.lock(this)
    this.events.emit('sync-start')
    try {
      await this.syncBatch()
    } finally {
      this.events.emit('sync-end')
      release()
    }
    log.debug('No more metadata changes for now')
  }

  // sync
  async syncBatch() {
    let seq = null
    // eslint-disable-next-line no-constant-condition
    while (!this.stopRequested) {
      seq = await this.pouch.getLocalSeqAsync()
      // TODO: Prevent infinite loop
      const change = await this.getNextChange(seq)
      if (change == null) break
      this.events.emit('sync-current', change.seq)
      try {
        await this.apply(change)
        // XXX: apply should call setLocalSeqAsync
      } catch (err) {
        if (!this.stopRequested) throw err
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
      const resolver = data => {
        this.events.off('stopRequested', resolver)
        resolve(data)
      }
      const rejecter = err => {
        this.events.off('stopRequested', resolver)
        reject(err)
      }
      this.events.on('stopRequested', resolver)
      this.changes = this.pouch.db
        .changes(opts)
        .on('change', c => {
          if (this.changes) {
            this.changes.cancel()
            this.changes = null
            resolver(c)
          }
        })
        .on('error', err => {
          if (this.changes) {
            // FIXME: pas de cancel ici ??
            this.changes = null
            rejecter(err)
          }
        })
    })
  }

  async getNextChange(seq /*: number */) /*: Promise<?MetadataChange> */ {
    const stopMeasure = measureTime('Sync#getNextChange')
    const opts = await this.baseChangeOptions(seq)
    opts.include_docs = true
    const p = new Promise((resolve, reject) => {
      const resolver = data => {
        this.events.off('stopRequested', resolver)
        resolve(data)
      }
      const rejecter = err => {
        this.events.off('stopRequested', resolver)
        reject(err)
      }
      this.events.on('stopRequested', resolver)
      this.pouch.db
        .changes(opts)
        .on('change', info => resolver(info))
        .on('error', err => rejecter(err))
        .on('complete', info => {
          if (info.results == null || info.results.length === 0) {
            resolver(null)
          }
        })
    })
    stopMeasure()
    return p
  }

  // Apply a change to both local and remote
  // At least one side should say it has already this change
  // In some cases, both sides have the change
  async apply(change /*: MetadataChange */) /*: Promise<*> */ {
    let { doc, seq } = change
    const { path } = doc
    log.debug({ path, seq, doc }, 'Applying change...')

    if (metadata.shouldIgnore(doc, this.ignore)) {
      return this.pouch.setLocalSeqAsync(change.seq)
    }

    // FIXME: Acquire lock for as many changes as possible to prevent next huge
    // remote/local batches to acquite it first
    let stopMeasure = () => {}
    let [side, sideName, rev] = this.selectSide(doc)
    try {
      stopMeasure = measureTime('Sync#applyChange:' + sideName)

      if (!side) {
        log.info({ path }, 'up to date')
        return this.pouch.setLocalSeqAsync(change.seq)
      } else if (sideName === 'remote' && doc.trashed) {
        // File or folder was just deleted locally
        const byItself = await this.trashWithParentOrByItself(doc, side)
        if (!byItself) {
          return
        }
      } else {
        await this.applyDoc(doc, side, sideName, rev)
        delete doc.moveFrom
      }

      log.trace({ path, seq }, `Applied change on ${sideName} side`)
      await this.pouch.setLocalSeqAsync(change.seq)
      if (!change.doc._deleted) {
        await this.updateRevs(change.doc, sideName)
      }
    } catch (err) {
      await this.handleApplyError(change, sideName, err)
    } finally {
      stopMeasure()
    }
  }

  async applyDoc(
    doc /*: Metadata */,
    side /*: Writer */,
    sideName /*: SideName */,
    rev /*: number */
  ) /*: Promise<*> */ {
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
      }
    } else if (doc.docType !== 'file' && doc.docType !== 'folder') {
      throw new Error(`Unknown docType: ${doc.docType}`)
    } else if (doc._deleted && rev === 0) {
      // do nothing
    } else if (doc.moveTo != null) {
      log.debug(
        { path: doc.path },
        `Ignoring deleted ${doc.docType} metadata as move source`
      )
    } else if (doc.moveFrom != null) {
      const from = (doc.moveFrom /*: Metadata */)
      log.debug(
        { path: doc.path },
        `Applying ${doc.docType} change with moveFrom`
      )

      if (from.incompatibilities) {
        await this.doAdd(side, doc)
      } else if (from.childMove) {
        await side.assignNewRev(doc)
        this.events.emit('transfer-move', _.clone(doc), _.clone(from))
      } else {
        if (from.moveFrom && from.moveFrom.childMove) {
          await side.assignNewRev(from)
        }
        await this.doMove(side, doc, from)
      }
      delete doc.moveFrom // the move succeeded, delete moveFrom before attempting overwrite
      if (
        !metadata.sameBinary(from, doc) ||
        (from.overwrite && !metadata.sameBinary(from.overwrite, doc))
      ) {
        await side.overwriteFileAsync(doc, doc) // move & update
      }
    } else if (doc._deleted) {
      log.debug({ path: doc.path }, `Applying ${doc.docType} deletion`)
      if (doc.docType === 'file') await side.trashAsync(doc)
      else await side.deleteFolderAsync(doc)
    } else if (rev === 0) {
      log.debug({ path: doc.path }, `Applying ${doc.docType} addition`)
      await this.doAdd(side, doc)
    } else {
      log.debug({ path: doc.path }, `Applying else for ${doc.docType} change`)
      let old
      try {
        old = await this.pouch.getPreviousRevAsync(
          doc._id,
          doc.sides.target - rev
        )
      } catch (err) {
        await this.doOverwrite(side, doc)
      }

      if (old) {
        if (doc.docType === 'folder') {
          await side.updateFolderAsync(doc, old)
        } else if (metadata.sameBinary(old, doc)) {
          if (metadata.sameFileIgnoreRev(old, doc)) {
            log.debug({ path: doc.path }, 'Ignoring timestamp-only change')
          } else {
            await side.updateFileMetadataAsync(doc, old)
          }
        } else {
          if (sideName === 'local' && !doc.overwrite) {
            const copy = await this.local.createBackupCopyAsync(doc)
            await this.local.trashAsync(copy)
          }
          await side.overwriteFileAsync(doc, old)
          this.events.emit('transfer-started', _.clone(doc))
        }
      } // TODO else what do we do ?
    }
  }

  async doAdd(side /*: Writer */, doc /*: Metadata */) /*: Promise<void> */ {
    if (doc.docType === 'file') {
      await side.addFileAsync(doc)
      this.events.emit('transfer-started', _.clone(doc))
    } else {
      await side.addFolderAsync(doc)
    }
  }

  async doOverwrite(
    side /*: Writer */,
    doc /*: Metadata */
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
    doc /*: Metadata */,
    old /*: Metadata */
  ) /*: Promise<void> */ {
    if (doc.overwrite) await this.trashWithParentOrByItself(doc.overwrite, side)
    if (doc.docType === 'file') {
      await side.moveFileAsync(doc, old)
      this.events.emit('transfer-move', _.clone(doc), _.clone(old))
    } else await side.moveFolderAsync(doc, old)
  }

  // Select which side will apply the change
  // It returns the side, its name, and also the last rev applied by this side
  selectSide(doc /*: Metadata */) {
    switch (metadata.outOfDateSide(doc)) {
      case 'local':
        return [this.local, 'local', doc.sides.local || 0]
      case 'remote':
        return [this.remote, 'remote', doc.sides.remote || 0]
      default:
        return []
    }
  }

  // Make the error explicit (offline, local disk full, quota exceeded, etc.)
  // and keep track of the number of retries
  async handleApplyError(
    change /*: MetadataChange */,
    sideName /*: SideName */,
    err /*: * */
  ) {
    const { path } = change.doc
    if (err.code === 'ENOSPC') {
      log.error({ path, err, change }, 'No more disk space')
      throw new Error('No more disk space')
    } else if (err.status === 412) {
      log.warn({ path, err, change }, 'Sync error 412 needs Merge')
      change.doc.errors = MAX_SYNC_ATTEMPTS
      return this.updateErrors(change, sideName)
    } else if (err.status === 413) {
      log.error({ path, err, change }, 'Cozy is full')
      throw new Error('Cozy is full')
    } else {
      log.error({ path, err, change }, 'Unknown sync error')
    }
    try {
      await this.diskUsage()
    } catch (err) {
      const result = handleCommonCozyErrors(
        { err, change },
        { events: this.events, log }
      )
      if (result === 'offline') {
        // The client is offline, wait that it can connect again to the server
        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            await Promise.delay(60000)
            await this.diskUsage()
            this.events.emit('online')
            log.warn({ path }, 'Client is online')
            return
          } catch (err) {
            // Client is still offline
          }
        }
      }
    }
    await this.updateErrors(change, sideName)
  }

  // Increment the counter of errors for this document
  async updateErrors(
    change /*: MetadataChange */,
    sideName /*: SideName */
  ) /*: Promise<void> */ {
    let { doc } = change
    if (!doc.errors) doc.errors = 0
    doc.errors++

    // Make sure isUpToDate(sourceSideName, doc) is still true
    const sourceSideName = otherSide(sideName)
    metadata.markSide(sourceSideName, doc, doc)

    // Don't try more than MAX_SYNC_ATTEMPTS for the same operation
    if (doc.errors && doc.errors >= MAX_SYNC_ATTEMPTS) {
      log.error(
        { path: doc.path, oldpath: _.get(change, 'was.path') },
        `Failed to sync ${MAX_SYNC_ATTEMPTS} times. Giving up.`
      )
      await this.pouch.setLocalSeqAsync(change.seq)
      // FIXME: final doc.errors is not saved which works but may be confusing.
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
  async updateRevs(
    doc /*: Metadata */,
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
        const unsynced = await this.pouch.db.get(doc._id)
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
        log.warn({ path: doc.path, err }, 'Race condition')
      }
    }
  }

  // Trash a file or folder. If a folder was deleted on local, we try to trash
  // only this folder on the remote, not every files and folders inside it, to
  // preserve the tree in the trash.
  async trashWithParentOrByItself(
    doc /*: Metadata */,
    side /*: Writer */
  ) /*: Promise<boolean> */ {
    let parentId = dirname(doc._id)
    if (parentId !== '.') {
      let parent = await this.pouch.db.get(parentId)

      if (!parent.trashed) {
        await Promise.delay(TRASHING_DELAY)
        parent = await this.pouch.db.get(parentId)
      }

      if (parent.trashed && !metadata.isUpToDate('remote', parent)) {
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

module.exports = Sync
