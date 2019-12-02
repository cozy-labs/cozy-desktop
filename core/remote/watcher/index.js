/**
 * @module core/remote/watcher
 * @flow
 */

const autoBind = require('auto-bind')
const Promise = require('bluebird')
const _ = require('lodash')

const logger = require('../../utils/logger')
const { MergeMissingParentError } = require('../../merge')
const metadata = require('../../metadata')
const remoteChange = require('../change')
const { handleCommonCozyErrors } = require('../cozy')
const { inRemoteTrash } = require('../document')
const analyse = require('./analyse')

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
    let errors = []

    try {
      const seq = await this.pouch.getRemoteSeqAsync()
      const { last_seq, docs } = await this.remoteCozy.changes(seq)
      this.events.emit('online')

      if (docs.length === 0) return

      const release = await this.pouch.lock(this)
      this.events.emit('remote-start')

      try {
        let target = -1
        errors = errors.concat(await this.pullMany(docs))
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
      errors.push(err)
    }

    for (const err of errors) {
      handleCommonCozyErrors(err, { events: this.events, log })
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
  ) /*: Promise<Error[]> */ {
    const remoteIds = docs.reduce((ids, doc) => ids.add(doc._id), new Set())
    const olds = await this.pouch.allByRemoteIds(remoteIds)

    this.detectIncompatibilities(docs, olds)

    log.trace('Contextualize and analyse changesfeed results...')
    const changes = analyse(docs, olds)

    log.trace('Sort changes...')
    remoteChange.sort(changes)

    log.trace('Apply changes...')
    const errors = await this.applyAll(changes)

    log.trace('Done with pull.')
    return errors
  }

  detectIncompatibilities(
    remoteDocs /*: Array<RemoteDoc|RemoteDeletion> */,
    olds /*: Array<Metadata> */
  ) {
    const oldsByRemoteId = _.keyBy(olds, 'remote._id')
    for (const remoteDoc of remoteDocs) {
      if (!remoteDoc._deleted && !inRemoteTrash(remoteDoc)) {
        const doc /*: Metadata */ = metadata.fromRemoteDoc(remoteDoc)
        const was /*: ?Metadata */ = oldsByRemoteId[doc._id]

        metadata.assignPlatformIncompatibilities(doc, this.prep.config.syncPath)
        const { incompatibilities } = doc
        if (incompatibilities) {
          log.debug({
            path: doc.path,
            oldpath: was && was.path,
            incompatibilities
          })
          this.events.emit('platform-incompatibilities', incompatibilities)
        }
      }
    }
  }

  async applyAll(changes /*: Array<RemoteChange> */) /*: Promise<Error[]> */ {
    const errors = []

    for (let change of changes) {
      try {
        await this.apply(change)
      } catch (err) {
        log.error({ path: _.get(change, 'doc.path'), err })
        if (err instanceof MergeMissingParentError) continue
        errors.push(err)
      }
    }

    return errors
  }

  async apply(change /*: RemoteChange */) /*: Promise<void> */ {
    const docType = _.get(change, 'doc.docType')
    const path = _.get(change, 'doc.path')

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
      case 'FileRestoration':
        log.info({ path }, 'file was restored remotely')
        await this.prep.restoreFileAsync(sideName, change.doc, change.was)
        break
      case 'DirRestoration':
        log.info({ path }, 'folder was restored remotely')
        await this.prep.restoreFolderAsync(sideName, change.doc, change.was)
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
  }
}

module.exports = {
  HEARTBEAT,
  RemoteWatcher
}
