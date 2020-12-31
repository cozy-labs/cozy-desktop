/**
 * @module core/remote/watcher
 * @flow
 */

const autoBind = require('auto-bind')
const Promise = require('bluebird')
const _ = require('lodash')

const metadata = require('../../metadata')
const { MergeMissingParentError } = require('../../merge')
const remoteChange = require('../change')
const { handleCommonCozyErrors } = require('../cozy')
const { HEARTBEAT } = require('../constants')
const { inRemoteTrash } = require('../document')
const squashMoves = require('./squashMoves')
const normalizePaths = require('./normalizePaths')
const logger = require('../../utils/logger')

/*::
import type EventEmitter from 'events'
import type { Pouch } from '../../pouch'
import type Prep from '../../prep'
import type { RemoteCozy } from '../cozy'
import type { Metadata, MetadataRemoteInfo, SavedMetadata, RemoteRevisionsByID } from '../../metadata'
import type { RemoteChange, RemoteFileMove, RemoteDirMove, RemoteDescendantChange } from '../change'
import type { RemoteDeletion } from '../document'
*/

const log = logger({
  component: 'RemoteWatcher'
})

const sideName = 'remote'

/** Get changes from the remote Cozy and prepare them for merge */
class RemoteWatcher {
  /*::
  pouch: Pouch
  prep: Prep
  remoteCozy: RemoteCozy
  events: EventEmitter
  runningResolve: ?() => void
  running: Promise
  */

  constructor(
    pouch /*: Pouch */,
    prep /*: Prep */,
    remoteCozy /*: RemoteCozy */,
    events /*: EventEmitter */
  ) {
    this.pouch = pouch
    this.prep = prep
    this.remoteCozy = remoteCozy
    this.events = events
    this.running = new Promise(() => {})

    autoBind(this)
  }

  async start() {
    log.debug('Starting watcher')
    await this.watch()

    this.running = Promise.race([
      // run until either stop is called or watchLoop reject
      new Promise(resolve => {
        this.runningResolve = resolve
      }),
      this.watchLoop()
    ])
  }

  stop() {
    log.debug('Stop requested')
    if (this.runningResolve) log.debug('Stopping watcher')
    if (this.runningResolve) {
      this.runningResolve()
      this.runningResolve = null
    }
  }

  async watchLoop() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await Promise.delay(HEARTBEAT)
      if (!this.runningResolve) {
        // stopped
        log.debug('Watcher stopped')
        return
      }
      await this.watch()
    }
  }

  async watch() {
    try {
      const seq = await this.pouch.getRemoteSeq()
      const { last_seq, docs } = await this.remoteCozy.changes(seq)
      this.events.emit('online')

      if (docs.length === 0) {
        log.debug('No remote changes for now')
        return
      }

      const release = await this.pouch.lock(this)
      this.events.emit('remote-start')

      try {
        let target = -1
        await this.pullMany(docs)
        target = (await this.pouch.db.changes({ limit: 1, descending: true }))
          .last_seq
        this.events.emit('sync-target', target)
        await this.pouch.setRemoteSeq(last_seq)
      } finally {
        release()
        this.events.emit('remote-end')
        log.debug('No more remote changes for now')
      }
    } catch (err) {
      // TODO: If FetchError && status === 412 → error during conflict resolution
      handleCommonCozyErrors({ err }, { events: this.events, log })
      // If we were offline, we'll wait for the next pollings to switch back
      // to 'online' as soon as the changesfeed can be fetched and retry to
      // merge the failed changes.
    }
  }

  /** Pull multiple changed or deleted docs
   *
   * FIXME: Misleading method name?
   */
  async pullMany(
    docs /*: Array<MetadataRemoteInfo|RemoteDeletion> */
  ) /*: Promise<void> */ {
    const remoteIds = docs.reduce((ids, doc) => ids.add(doc._id), new Set())
    const olds /*: SavedMetadata[] */ = await this.pouch.allByRemoteIds(
      remoteIds
    )

    const changes = await this.analyse(docs, olds)

    log.trace('Apply changes...')
    const errors = await this.applyAll(changes)

    for (const { err, change } of errors) {
      if (err instanceof MergeMissingParentError) {
        log.warn(
          { err, change, path: change && change.doc.path },
          'swallowing missing parent metadata error'
        )
        continue
      }
      throw err
    }

    log.trace('Done with pull.')
  }

  async analyse(
    remoteDocs /*: Array<MetadataRemoteInfo|RemoteDeletion> */,
    olds /*: Array<SavedMetadata> */
  ) /*: Promise<RemoteChange[]> */ {
    log.trace('Contextualize and analyse changesfeed results...')
    const changes = this.identifyAll(remoteDocs, olds)
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
    remoteDocs /*: Array<MetadataRemoteInfo|RemoteDeletion> */,
    olds /*: Array<SavedMetadata> */
  ) {
    const changes /*: Array<RemoteChange> */ = []
    const originalMoves = []

    const oldsByRemoteId = _.keyBy(olds, 'remote._id')
    for (const remoteDoc of remoteDocs) {
      const was /*: ?SavedMetadata */ = oldsByRemoteId[remoteDoc._id]
      changes.push(this.identifyChange(remoteDoc, was, changes, originalMoves))
    }

    return changes
  }

  identifyChange(
    remoteDoc /*: MetadataRemoteInfo|RemoteDeletion */,
    was /*: ?SavedMetadata */,
    previousChanges /*: Array<RemoteChange> */,
    originalMoves /*: Array<RemoteDirMove|RemoteDescendantChange> */
  ) /*: RemoteChange */ {
    const oldpath /*: ?string */ = was ? was.path : undefined
    log.debug(
      {
        path: (remoteDoc /*: $Shape<MetadataRemoteInfo> */).path || oldpath,
        oldpath,
        remoteDoc,
        was
      },
      'change received'
    )

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
      if (remoteDoc.type !== 'directory' && remoteDoc.type !== 'file') {
        return {
          sideName,
          type: 'InvalidChange',
          doc: remoteDoc,
          error: new Error(
            `Document ${remoteDoc._id} is not a file or a directory`
          )
        }
      } else if (
        remoteDoc.type === 'file' &&
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
          originalMoves
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
    remoteDoc /*: MetadataRemoteInfo */,
    was /*: ?SavedMetadata */,
    previousChanges /*: Array<RemoteChange> */,
    originalMoves /*: Array<RemoteDirMove|RemoteDescendantChange> */
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

    if (doc.docType !== 'file' && doc.docType !== 'folder') {
      return {
        sideName,
        type: 'InvalidChange',
        doc,
        error: new Error(`Unexpected docType: ${doc.docType}`)
      }
    }

    if (
      was &&
      was.remote &&
      metadata.extractRevNumber(was.remote) >=
        metadata.extractRevNumber(doc.remote)
    ) {
      return remoteChange.upToDate(doc, was)
    }

    // TODO: Move to Prep?
    if (!inRemoteTrash(remoteDoc)) {
      metadata.assignPlatformIncompatibilities(doc, this.prep.config.syncPath)
      const { incompatibilities } = doc
      if (incompatibilities) {
        log.debug({ path, oldpath: was && was.path, incompatibilities })
        this.events.emit('platform-incompatibilities', incompatibilities)
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

    if (!was || was.deleted) {
      return remoteChange.added(doc)
    }
    if (metadata.samePath(was, doc)) {
      if (
        doc.docType === 'file' &&
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
            { path, remoteId: change.doc.remote._id },
            `${_.get(change, 'doc.docType')} was moved as descendant of ${
              change.ancestorPath
            }`
          )
          break
        case 'IgnoredChange':
          log.debug(
            { path, remoteId: change.doc.remote && change.doc.remote._id },
            change.detail
          )
          break
        case 'FileTrashing':
          log.info({ path }, 'file was trashed remotely')
          await this.prep.trashFileAsync(sideName, change.was, change.doc)
          break
        case 'DirTrashing':
          log.info({ path }, 'folder was trashed remotely')
          await this.prep.trashFolderAsync(sideName, change.was, change.doc)
          break
        case 'FileDeletion':
          log.info({ path }, 'file was deleted permanently')
          await this.prep.deleteFileAsync(sideName, change.doc)
          break
        case 'DirDeletion':
          log.info({ path }, 'folder was deleted permanently')
          await this.prep.deleteFolderAsync(sideName, change.doc)
          break
        case 'FileAddition':
          log.info({ path }, 'file was added remotely')
          await this.prep.addFileAsync(sideName, change.doc)
          break
        case 'DirAddition':
          log.info({ path }, 'folder was added remotely')
          await this.prep.putFolderAsync(sideName, change.doc)
          break
        case 'FileUpdate':
          log.info({ path }, 'file was updated remotely')
          await this.prep.updateFileAsync(sideName, change.doc)
          break
        case 'FileMove':
          log.info(
            { path, oldpath: change.was.path },
            'file was moved or renamed remotely'
          )
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
            log.info(
              { path, oldpath: change.was.path },
              'folder was moved or renamed remotely'
            )
            if (change.needRefetch) {
              change.was = await this.pouch.byRemoteIdMaybe(
                change.was.remote._id
              )
              change.was.childMove = false
            }
            const newRemoteRevs /*: RemoteRevisionsByID */ = {}
            const descendants = change.descendantMoves || []
            for (let descendant of descendants) {
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
            for (let descendant of descendants) {
              if (descendant.update) {
                await this.prep.updateFileAsync(sideName, descendant.doc)
              }
            }
          }
          break
        case 'UpToDate':
          log.info({ path }, `${docType} is up-to-date`)
          break
        default:
          throw new Error(`Unexpected change type: ${change.type}`)
      } // switch
    } catch (err) {
      log.debug(
        { err, path: change.doc.path, change },
        'could not apply change'
      )
      return { err, change }
    }
  }
}

module.exports = {
  RemoteWatcher
}
