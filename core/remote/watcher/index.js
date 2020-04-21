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
const { inRemoteTrash } = require('../document')
const squashMoves = require('./squashMoves')
const logger = require('../../utils/logger')

/*::
import type EventEmitter from 'events'
import type { Pouch } from '../../pouch'
import type Prep from '../../prep'
import type { RemoteCozy } from '../cozy'
import type { Metadata, RemoteRevisionsByID } from '../../metadata'
import type { RemoteChange, RemoteFileMove, RemoteDirMove, RemoteDescendantChange } from '../change'
import type { RemoteDoc, RemoteDeletion } from '../document'
*/

const log = logger({
  component: 'RemoteWatcher'
})

const DEFAULT_HEARTBEAT /*: number */ = 1000 * 60 // 1 minute
const HEARTBEAT /*: number */ =
  parseInt(process.env.COZY_DESKTOP_HEARTBEAT) || DEFAULT_HEARTBEAT

const sideName = 'remote'

/** Get changes from the remote Cozy and prepare them for merge */
class RemoteWatcher {
  /*::
  pouch: Pouch
  prep: Prep
  remoteCozy: RemoteCozy
  events: EventEmitter
  runningResolve: ?() => void
  runningReject: ?() => void
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

    autoBind(this)
  }

  start() {
    const started /*: Promise<void> */ = this.watch()
    const running /*: Promise<void> */ = started.then(() =>
      Promise.race([
        // run until either stop is called or watchLoop reject
        new Promise(resolve => {
          this.runningResolve = resolve
        }),
        this.watchLoop()
      ])
    )

    return {
      started: started,
      running: running
    }
  }

  stop() {
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
        return
      }
      await this.watch()
    }
  }

  async watch() {
    let errors /*: Array<{ err: Error, change?: * }> */ = []

    try {
      const seq = await this.pouch.getRemoteSeqAsync()
      const { last_seq, docs } = await this.remoteCozy.changes(seq)
      this.events.emit('online')

      if (docs.length === 0) return

      const release = await this.pouch.lock(this)
      this.events.emit('remote-start')

      try {
        let target = -1
        errors = await this.pullMany(docs)
        if (errors.length === 0) {
          target = (await this.pouch.db.changes({ limit: 1, descending: true }))
            .last_seq
          this.events.emit('sync-target', target)
          await this.pouch.setRemoteSeqAsync(last_seq)
        }
      } finally {
        release()
        this.events.emit('remote-end')
        log.debug('No more remote changes for now')
      }
    } catch (err) {
      errors.push({ err })
    }

    for (const { err, change } of errors) {
      if (err instanceof MergeMissingParentError) {
        log.error(
          { err, change, path: change && change.doc.path },
          'swallowing missing parent metadata error'
        )
        continue
      }

      handleCommonCozyErrors({ err, change }, { events: this.events, log })
      // No need to handle 'offline' result since next pollings will switch
      // back to 'online' as soon as the changesfeed can be fetched.
    }
  }

  /** Pull multiple changed or deleted docs
   *
   * FIXME: Misleading method name?
   */
  async pullMany(
    docs /*: Array<RemoteDoc|RemoteDeletion> */
  ) /*: Promise<Array<{ change: RemoteChange, err: Error }>> */ {
    const remoteIds = docs.reduce((ids, doc) => ids.add(doc._id), new Set())
    const olds /*: Metadata[] */ = await this.pouch.allByRemoteIds(remoteIds)

    const changes = this.analyse(docs, olds)

    log.trace('Apply changes...')
    const errors = await this.applyAll(changes)

    log.trace('Done with pull.')
    return errors
  }

  analyse(
    remoteDocs /*: Array<RemoteDoc|RemoteDeletion> */,
    olds /*: Array<Metadata> */
  ) /*: Array<RemoteChange> */ {
    log.trace('Contextualize and analyse changesfeed results...')
    const changes = this.identifyAll(remoteDocs, olds)
    log.trace('Done with analysis.')

    log.trace('Sort changes...')
    remoteChange.sort(changes)

    return changes
  }

  identifyAll(
    remoteDocs /*: Array<RemoteDoc|RemoteDeletion> */,
    olds /*: Array<Metadata> */
  ) {
    const changes /*: Array<RemoteChange> */ = []
    const originalMoves = []

    const oldsByRemoteId = _.keyBy(olds, 'remote._id')
    for (const remoteDoc of remoteDocs) {
      const was /*: ?Metadata */ = oldsByRemoteId[remoteDoc._id]
      changes.push(this.identifyChange(remoteDoc, was, changes, originalMoves))
    }

    return changes
  }

  identifyChange(
    remoteDoc /*: RemoteDoc|RemoteDeletion */,
    was /*: ?Metadata */,
    previousChanges /*: Array<RemoteChange> */,
    originalMoves /*: Array<RemoteDirMove|RemoteDescendantChange> */
  ) /*: RemoteChange */ {
    const oldpath /*: ?string */ = was && was.path
    log.debug(
      {
        path: (remoteDoc /*: Object */).path || oldpath,
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
      // $FlowFixMe
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
    remoteDoc /*: RemoteDoc */,
    was /*: ?Metadata */,
    previousChanges /*: Array<RemoteChange> */,
    originalMoves /*: Array<RemoteDirMove|RemoteDescendantChange> */
  ) /*: RemoteChange */ {
    let doc /*: Metadata */ = metadata.fromRemoteDoc(remoteDoc)
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
    metadata.assignId(doc)

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
      const previousMoveToSamePath = _.find(
        previousChanges,
        change =>
          (change.type === 'DescendantChange' ||
            change.type === 'FileMove' ||
            change.type === 'DirMove') &&
          // $FlowFixMe
          change.doc.path === was.path
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

    if (!was || was.trashed) {
      return remoteChange.added(doc)
    }
    if (was._id === doc._id && was.path === doc.path) {
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
    if (errors.length === 0 || errors.length === changes.length) return errors
    return this.applyAll(errors.map(error => error.change))
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
            { path, remoteId: change.doc._id },
            `${_.get(change, 'doc.docType')} was moved as descendant of ${
              change.ancestorPath
            }`
          )
          break
        case 'IgnoredChange':
          log.debug({ path, remoteId: change.doc._id }, change.detail)
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
            change.was = await this.pouch.byRemoteIdMaybeAsync(
              change.was.remote._id
            )
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
              change.was = await this.pouch.byRemoteIdMaybeAsync(
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
      return { err, change }
    }
  }
}

module.exports = {
  HEARTBEAT,
  RemoteWatcher
}
