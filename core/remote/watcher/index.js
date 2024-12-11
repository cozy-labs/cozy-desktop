/**
 * @module core/remote/watcher
 * @flow
 */

const async = require('async')
const autoBind = require('auto-bind')
const Promise = require('bluebird')
const _ = require('lodash')

const metadata = require('../../metadata')
const { logger } = require('../../utils/logger')
const remoteChange = require('../change')
const {
  FILE_TYPE,
  DIR_TYPE,
  HEARTBEAT,
  REMOTE_WATCHER_ERROR_EVENT,
  REMOTE_WATCHER_FATAL_EVENT
} = require('../constants')
const { inRemoteTrash } = require('../document')
const remoteErrors = require('../errors')
const normalizePaths = require('./normalizePaths')
const { RealtimeManager } = require('./realtime_manager')
const squashMoves = require('./squashMoves')

/*::
import type { Config } from '../../config'
import type EventEmitter from 'events'
import type { Pouch } from '../../pouch'
import type Prep from '../../prep'
import type { RemoteCozy } from '../cozy'
import type {
  Metadata,
  MetadataRemoteInfo,
  MetadataRemoteDir,
  SavedMetadata,
  RemoteRevisionsByID
} from '../../metadata'
import type { RemoteChange, RemoteFileMove, RemoteDirMove, RemoteDescendantChange } from '../change'
import type { CouchDBDeletion, CouchDBDoc, FullRemoteFile, RemoteDir } from '../document'
import type { RemoteError } from '../errors'
import type { QueueObject } from 'async'

export type RemoteWatcherOptions = {
  +config: Config,
  events: EventEmitter,
  pouch: Pouch,
  prep: Prep,
  remoteCozy: RemoteCozy
}
*/

const log = logger({
  component: 'RemoteWatcher'
})

const sideName = 'remote'

const folderMightHaveBeenExcluded = (
  remoteDir /*: CouchDBDoc */
) /*: boolean %checks */ => {
  // A folder newly created has a rev number of 1.
  // Once exluded, its rev number is at least 2.
  // Once re-included, its rev number is at least 3.
  return metadata.extractRevNumber(remoteDir) > 2
}

const needsContentFetching = (
  remoteDoc /*: CouchDBDoc */,
  { isRecursiveFetch = false } /*: { isRecursiveFetch: boolean } */ = {}
) /*: boolean %checks */ => {
  return (
    remoteDoc.type === DIR_TYPE &&
    (folderMightHaveBeenExcluded(remoteDoc) || isRecursiveFetch)
  )
}

/** Get changes from the remote Cozy and prepare them for merge */
class RemoteWatcher {
  /*::
  config: Config
  pouch: Pouch
  prep: Prep
  remoteCozy: RemoteCozy
  events: EventEmitter
  running: boolean
  watchInterval: ?IntervalID
  queue: QueueObject
  nextRun: Promise
  realtimeManager: RealtimeManager
  */

  constructor(
    { config, pouch, prep, remoteCozy, events } /*: RemoteWatcherOptions */
  ) {
    this.config = config
    this.pouch = pouch
    this.prep = prep
    this.remoteCozy = remoteCozy
    this.events = events
    this.running = false
    this.nextRun = Promise.resolve()
    this.realtimeManager = new RealtimeManager()

    this.startQueue()

    autoBind(this)
  }

  async start() {
    if (!this.running) {
      log.info('Starting watcher')
      this.running = true
      this.startClock()

      if (this.realtimeManager) {
        const client = await this.remoteCozy.getClient()
        this.realtimeManager.setup({
          client,
          eventHandler: this.requestRun.bind(this)
        })
        await this.realtimeManager.start()
      }

      await this.requestRun()
    }
  }

  async stop() {
    if (this.running) {
      log.info('Stopping watcher')

      if (this.realtimeManager) {
        this.realtimeManager.stop()
      }

      this.stopClock()
      await this.stopQueue()
      this.running = false
    }
  }

  onError(listener /*: (RemoteError) => any */) {
    this.events.on(REMOTE_WATCHER_ERROR_EVENT, listener)
  }

  error(err /*: RemoteError */) {
    log.error(`Remote watcher error: ${err.message}`, { err })
    this.events.emit(REMOTE_WATCHER_ERROR_EVENT, err)
  }

  onFatal(listener /*: Error => any */) {
    this.events.on(REMOTE_WATCHER_FATAL_EVENT, listener)
  }

  async fatal(err /*: Error */) {
    log.fatal(`Remote watcher fatal: ${err.message}`, { err, sentry: true })
    this.events.emit(REMOTE_WATCHER_FATAL_EVENT, err)
    this.events.removeAllListeners(REMOTE_WATCHER_FATAL_EVENT)
    await this.stop()
  }

  startQueue() {
    this.queue = async.queue(async () => {
      await this.watch()
    })
  }

  async stopQueue() {
    await this.queue.kill()
  }

  startClock() {
    if (this.watchInterval == null) {
      log.debug('starting watch clock')
      this.watchInterval = setInterval(() => {
        if (this.queue.idle()) {
          // Enqueue a scheduled run only if there weren't any running on
          // enqueued run.
          this.requestRun()
        }
      }, HEARTBEAT)
    }
  }

  stopClock() {
    log.debug('stopping watch clock')
    clearInterval(this.watchInterval)
    this.watchInterval = null
  }

  async requestRun() {
    if (!this.running) {
      log.debug('Watcher stopped: skipping remote watcher run request')
      return
    }

    try {
      log.debug('requesting watch run')

      if (this.queue.idle()) {
        // If there aren't any requests running, enqueue one and wait until
        // it's completed.
        await this.queue.pushAsync()
      } else if (this.queue.length() === 0) {
        // If there is a request running but none enqueued, enqueue one, mark
        // it as the next request to run and wait until it's completed.
        this.nextRun = this.queue.pushAsync()
        await this.nextRun
      } else {
        // If the queue is full (i.e. one running request + one enqueued
        // request), wait until the next request has completed.
        await this.nextRun
      }
    } catch (err) {
      switch (err.code) {
        case remoteErrors.COZY_CLIENT_REVOKED_CODE:
        case remoteErrors.MISSING_PERMISSIONS_CODE:
        case remoteErrors.COZY_NOT_FOUND_CODE:
          await this.fatal(err)
          break
        default:
          this.error(err)
      }
    }
  }

  async watch() /*: Promise<?RemoteError> */ {
    const release = await this.pouch.lock(this)
    try {
      if (!this.running) {
        log.info('Watcher stopped: skipping remote watch')
        return
      }

      this.events.emit('buffering-start')

      const seq = await this.pouch.getRemoteSeq()
      const { last_seq, docs, isInitialFetch } = await this.remoteCozy.changes(
        seq
      )
      this.events.emit('online')

      if (docs.length === 0) {
        log.info('No remote changes for now')
        await this.fetchReincludedContent()
        return
      }

      this.events.emit('remote-start')
      this.events.emit('buffering-end')

      if (isInitialFetch) {
        await this.processRemoteChanges(docs, { isInitialFetch })
      } else {
        await this.processRemoteChanges(docs)
        await this.fetchReincludedContent()
      }

      let target = -1
      target = (await this.pouch.db.changes({ limit: 1, descending: true }))
        .last_seq
      this.events.emit('sync-target', target)

      await this.pouch.setRemoteSeq(last_seq)
      log.info('No more remote changes for now')
    } catch (err) {
      // TODO: Maybe wrap remote errors more closely to remote calls to avoid
      // wrapping other kinds of errors? PouchDB errors for example.
      throw remoteErrors.wrapError(err)
    } finally {
      release()
      this.events.emit('buffering-end')
      this.events.emit('remote-end')
    }
  }

  async fetchReincludedContent() {
    let dirs = await this.pouch.needingContentFetching()

    while (dirs.length) {
      for (const dir of dirs) {
        log.info('Fetching content of unknown folder...', { path: dir.path })
        const children = await this.remoteCozy.getDirectoryContent(dir.remote)

        await this.processRemoteChanges(children, { isRecursiveFetch: true })

        dir.needsContentFetching = false
        await this.pouch.put(dir)
      }

      dirs = await this.pouch.needingContentFetching()
    }
  }

  async olds(
    remoteDocs /*: $ReadOnlyArray<CouchDBDoc|CouchDBDeletion|FullRemoteFile|RemoteDir> */
  ) /*: Promise<SavedMetadata[]> */ {
    const remoteIds = remoteDocs.reduce(
      (
        ids /*: Set<string> */,
        doc /*: CouchDBDoc|CouchDBDeletion|FullRemoteFile|RemoteDir */
      ) => ids.add(doc._id),
      new Set()
    )
    return await this.pouch.allByRemoteIds(remoteIds)
  }

  /** Process multiple changed or deleted docs
   */
  async processRemoteChanges(
    docs /*: $ReadOnlyArray<CouchDBDoc|CouchDBDeletion|FullRemoteFile|RemoteDir> */,
    {
      isInitialFetch = false,
      isRecursiveFetch = false
    } /*: { isInitialFetch?: boolean, isRecursiveFetch?: boolean } */ = {}
  ) /*: Promise<void> */ {
    let changes = await this.analyse(docs, await this.olds(docs), {
      isInitialFetch,
      isRecursiveFetch
    })

    log.trace('Apply changes...')
    const errors = await this.applyAll(changes)
    if (errors.length) throw errors[0].err

    log.trace('Done with changes processing.')
  }

  async analyse(
    remoteDocs /*: $ReadOnlyArray<CouchDBDoc|CouchDBDeletion|FullRemoteFile|RemoteDir> */,
    olds /*: SavedMetadata[] */,
    {
      isInitialFetch = false,
      isRecursiveFetch = false
    } /*: { isInitialFetch?: boolean, isRecursiveFetch?: boolean } */ = {}
  ) /*: Promise<RemoteChange[]> */ {
    log.trace('Contextualize and analyse changesfeed results...')
    const changes = this.identifyAll(remoteDocs, olds, {
      isInitialFetch,
      isRecursiveFetch
    })
    log.trace('Done with analysis.')

    remoteChange.sortByPath(changes)

    const normalizedChanges =
      process.platform === 'darwin'
        ? await normalizePaths(changes, {
            pouch: this.pouch
          })
        : changes

    log.trace('Sort changes...')
    remoteChange.sort(normalizedChanges)

    return normalizedChanges
  }

  identifyAll(
    remoteDocs /*: $ReadOnlyArray<CouchDBDoc|CouchDBDeletion|FullRemoteFile|RemoteDir> */,
    olds /*: SavedMetadata[] */,
    {
      isInitialFetch = false,
      isRecursiveFetch = false
    } /*: { isInitialFetch?: boolean, isRecursiveFetch?: boolean } */ = {}
  ) {
    const changes /*: Array<RemoteChange> */ = []
    const originalMoves = []

    const oldsByRemoteId = _.keyBy(olds, 'remote._id')
    for (const remoteDoc of remoteDocs) {
      const was /*: ?SavedMetadata */ = oldsByRemoteId[remoteDoc._id]
      changes.push(
        this.identifyChange(remoteDoc, was, changes, originalMoves, {
          isInitialFetch,
          isRecursiveFetch
        })
      )
    }

    return changes
  }

  identifyChange(
    remoteDoc /*: CouchDBDoc|CouchDBDeletion|FullRemoteFile|RemoteDir */,
    was /*: ?SavedMetadata */,
    previousChanges /*: Array<RemoteChange> */,
    originalMoves /*: Array<RemoteDirMove|RemoteDescendantChange> */,
    {
      isInitialFetch = false,
      isRecursiveFetch = false
    } /*: { isInitialFetch?: boolean, isRecursiveFetch?: boolean } */ = {}
  ) /*: RemoteChange */ {
    const oldpath /*: ?string */ = was ? was.path : undefined
    log.debug('change received', {
      path: remoteDoc.path || oldpath,
      oldpath,
      remoteDoc,
      was
    })

    if (remoteDoc._deleted) {
      if (was == null) {
        return {
          sideName,
          type: 'IgnoredChange',
          doc: remoteDoc,
          detail: 'file or directory was created, trashed, and removed remotely'
        }
      }
      return remoteChange.deleted(was)
    } else {
      if (remoteDoc.type !== DIR_TYPE && remoteDoc.type !== FILE_TYPE) {
        return {
          sideName,
          type: 'InvalidChange',
          doc: remoteDoc,
          error: new Error(
            `Document ${remoteDoc._id} is not a file or a directory`
          )
        }
      } else if (
        remoteDoc.type === FILE_TYPE &&
        (remoteDoc.md5sum == null || remoteDoc.md5sum === '')
      ) {
        return {
          sideName,
          type: 'IgnoredChange',
          doc: remoteDoc,
          detail: 'Ignoring temporary file'
        }
      } else {
        return this.identifyExistingDocChange(
          remoteDoc,
          was,
          previousChanges,
          originalMoves,
          { isInitialFetch, isRecursiveFetch }
        )
      }
    }
  }

  /**
   * FIXME: comment: Transform the doc and save it in pouchdb
   *
   * In both CouchDB and PouchDB, the filepath includes the name field.
   * And the _id/_rev from CouchDB are saved in the remote field in PouchDB.
   *
   * Note that the changes feed can aggregate several changes for many changes
   * for the same document. For example, if a file is created and then put in
   * the trash just after, it looks like it appeared directly on the trash.
   */
  identifyExistingDocChange(
    remoteDoc /*: CouchDBDoc|FullRemoteFile|RemoteDir */,
    was /*: ?SavedMetadata */,
    previousChanges /*: Array<RemoteChange> */,
    originalMoves /*: Array<RemoteDirMove|RemoteDescendantChange> */,
    {
      isInitialFetch = false,
      isRecursiveFetch = false
    } /*: { isInitialFetch?: boolean, isRecursiveFetch?: boolean } */ = {}
  ) /*: RemoteChange */ {
    const doc /*: Metadata */ = metadata.fromRemoteDoc(remoteDoc)
    try {
      metadata.ensureValidPath(doc)
    } catch (error) {
      return {
        sideName,
        type: 'InvalidChange',
        doc,
        error
      }
    }
    const { docType, path } = doc

    if (doc.docType !== metadata.FILE && doc.docType !== metadata.FOLDER) {
      return {
        sideName,
        type: 'InvalidChange',
        doc,
        error: new Error(`Unexpected docType: ${doc.docType}`)
      }
    }

    if (
      was &&
      metadata.extractRevNumber(was.remote) >=
        metadata.extractRevNumber(doc.remote)
    ) {
      return remoteChange.upToDate(doc, was)
    }

    // TODO: Move to Prep?
    if (!inRemoteTrash(remoteDoc)) {
      metadata.assignPlatformIncompatibilities(doc, this.config.syncPath)
      const { incompatibilities } = doc
      if (incompatibilities) {
        log.info({ path, oldpath: was && was.path, incompatibilities })
      }
    } else {
      if (!was) {
        return {
          sideName,
          type: 'IgnoredChange',
          doc,
          detail: `${docType} was created and trashed remotely`
        }
      }
      const oldPath = was.path
      const previousMoveToSamePath = _.find(
        previousChanges,
        change =>
          (change.type === 'DescendantChange' ||
            change.type === 'FileMove' ||
            change.type === 'DirMove') &&
          metadata.samePath(change.doc, oldPath)
      )

      if (previousMoveToSamePath) {
        previousMoveToSamePath.doc.overwrite = was
        return {
          sideName,
          type: 'IgnoredChange',
          doc,
          was,
          detail: `${was.docType} ${was.path} overwritten by ${previousMoveToSamePath.was.path}`
        }
      }
      return remoteChange.trashed(doc, was)
    }

    if (!was || inRemoteTrash(was.remote)) {
      if (!isInitialFetch) {
        doc.needsContentFetching = needsContentFetching(doc.remote, {
          isRecursiveFetch
        })
      }

      return remoteChange.added(doc)
    } else if (metadata.samePath(was, doc)) {
      if (
        doc.docType === metadata.FILE &&
        doc.md5sum === was.md5sum &&
        doc.size !== was.size
      ) {
        return {
          sideName,
          type: 'InvalidChange',
          doc,
          was,
          error: new Error(
            'File is corrupt on either side (md5sum matches but size does not)'
          )
        }
      } else {
        return remoteChange.updated(doc)
      }
    }
    // It's a move
    return squashMoves(doc, was, previousChanges, originalMoves)
  }

  async applyAll(
    changes /*: Array<RemoteChange> */
  ) /*: Promise<Array<{ change: RemoteChange, err: Error }>> */ {
    const errors = await Promise.mapSeries(
      changes,
      async change => await this.apply(change)
    ).filter(err => err)

    switch (errors.length) {
      case 0:
        return []
      case changes.length:
        return errors
      default:
        return this.applyAll(errors.map(error => error.change))
    }
  }

  async apply(
    change /*: RemoteChange */
  ) /*: Promise<?{ change: RemoteChange, err: Error }> */ {
    const docType = _.get(change, 'doc.docType')
    const path = _.get(change, 'doc.path')

    try {
      switch (change.type) {
        case 'InvalidChange':
          throw change.error
        case 'DescendantChange':
          log.debug(
            `${_.get(change, 'doc.docType')} was moved as descendant of ${_.get(
              change,
              'ancestor.doc.path'
            )}`,
            { path, remoteId: change.doc.remote._id }
          )
          break
        case 'IgnoredChange':
          log.debug(change.detail, {
            path,
            remoteId: change.doc.remote && change.doc.remote._id
          })
          break
        case 'FileTrashing':
          log.debug('file was trashed remotely', { path })
          await this.prep.trashFileAsync(sideName, change.was, change.doc)
          break
        case 'DirTrashing':
          log.debug('folder was trashed remotely', { path })
          await this.prep.trashFolderAsync(sideName, change.was, change.doc)
          break
        case 'FileDeletion':
          log.debug('file was deleted permanently', { path })
          await this.prep.deleteFileAsync(sideName, change.doc)
          break
        case 'DirDeletion':
          log.debug('folder was deleted permanently', { path })
          await this.prep.deleteFolderAsync(sideName, change.doc)
          break
        case 'FileAddition':
          log.debug('file was added remotely', { path })
          await this.prep.addFileAsync(sideName, change.doc)
          break
        case 'DirAddition':
          log.debug('folder was added remotely', { path })
          await this.prep.putFolderAsync(sideName, change.doc)
          break
        case 'FileUpdate':
          log.debug('file was updated remotely', { path })
          await this.prep.updateFileAsync(sideName, change.doc)
          break
        case 'DirUpdate':
          log.debug('folder was updated remotely', { path })
          await this.prep.putFolderAsync(sideName, change.doc)
          break
        case 'FileMove':
          log.debug('file was moved or renamed remotely', {
            path,
            oldpath: change.was.path
          })
          if (change.needRefetch) {
            change.was = await this.pouch.byRemoteIdMaybe(change.was.remote._id)
            change.was.childMove = false
          }
          await this.prep.moveFileAsync(sideName, change.doc, change.was)
          if (change.update) {
            await this.prep.updateFileAsync(sideName, change.doc)
          }
          break
        case 'DirMove':
          {
            log.debug('folder was moved or renamed remotely', {
              path,
              oldpath: change.was.path
            })
            if (change.needRefetch) {
              change.was = await this.pouch.byRemoteIdMaybe(
                change.was.remote._id
              )
              change.was.childMove = false
            }
            const newRemoteRevs /*: RemoteRevisionsByID */ = {}
            for (const descendant of change.descendantMoves) {
              if (descendant.doc.remote) {
                newRemoteRevs[descendant.doc.remote._id] =
                  descendant.doc.remote._rev
              }
            }
            await this.prep.moveFolderAsync(
              sideName,
              change.doc,
              change.was,
              newRemoteRevs
            )
            for (const descendant of change.descendantMoves) {
              if (descendant.update) {
                await this.prep.updateFileAsync(sideName, descendant.doc)
              }
            }
          }
          break
        case 'UpToDate':
          log.debug(`${docType} is up-to-date`, { path })
          break
        default:
          throw new Error(`Unexpected change type: ${change.type}`)
      } // switch
    } catch (err) {
      log.error('could not apply change', {
        err,
        path: change.doc.path,
        change
      })
      return { err, change }
    }
  }
}

module.exports = {
  RemoteWatcher
}
