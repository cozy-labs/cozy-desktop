/* @flow */

import * as conversion from '../conversion'
import EventEmitter from 'events'
import _ from 'lodash'

import logger from '../logger'
import { assignId, ensureValidPath, detectPlatformIncompatibilities } from '../metadata'
import Pouch from '../pouch'
import Prep from '../prep'
import RemoteCozy from './cozy'
import * as remoteChange from './change'
import { inRemoteTrash } from './document'

import type { Metadata } from '../metadata'
import type { RemoteChange, RemoteNoise, RemoteFileMoved } from './change'
import type { RemoteDoc, RemoteDeletion } from './document'

const log = logger({
  component: 'RemoteWatcher'
})

export const DEFAULT_HEARTBEAT: number = 1000 * 60 // 1 minute
export const HEARTBEAT: number = parseInt(process.env.COZY_DESKTOP_HEARTBEAT) || DEFAULT_HEARTBEAT

const sideName = 'remote'

// Get changes from the remote Cozy and prepare them for merge
export default class RemoteWatcher {
  pouch: Pouch
  prep: Prep
  remoteCozy: RemoteCozy
  events: EventEmitter
  intervalID: *
  runningResolve: ?() => void

  constructor (pouch: Pouch, prep: Prep, remoteCozy: RemoteCozy, events: EventEmitter) {
    this.pouch = pouch
    this.prep = prep
    this.remoteCozy = remoteCozy
    this.events = events
  }

  start () {
    const started = this.watch()
    // $FlowFixMe
    const running = started.then(() => {
      return new Promise((resolve, reject) => {
        this.runningResolve = resolve
        this.intervalID = setInterval(() => {
          this.watch().catch(err => reject(err))
        }, HEARTBEAT)
      })
    })
    return {
      started: started,
      running: running
    }
  }

  stop () {
    if (this.intervalID) {
      clearInterval(this.intervalID)
      this.intervalID = null
    }
    if (this.runningResolve) {
      this.runningResolve()
    }
  }

  async watch () {
    try {
      const seq = await this.pouch.getRemoteSeqAsync()
      const {last_seq, docs} = await this.remoteCozy.changes(seq)

      if (docs.length === 0) return

      await this.pullMany(docs)
      await this.pouch.setRemoteSeqAsync(last_seq)
      log.debug('No more remote changes for now')
    } catch (err) {
      log.error({err})
      if (err.status === 400) {
        throw new Error('Client has been revoked')
      }
    }
  }

  // Pull multiple changed or deleted docs
  // FIXME: Misleading method name?
  async pullMany (docs: Array<RemoteDoc|RemoteDeletion>) {
    const changes: Array<RemoteChange|RemoteNoise> = []

    const release = await this.pouch.lock(this)
    let target = -1
    try {
      this.events.emit('remote-start')
      log.trace('Contextualize and analyse changesfeed results...')
      for (let index = 0; index < docs.length; index++) {
        const doc = docs[index]
        const was: ?Metadata = await this.pouch.byRemoteIdMaybeAsync(doc._id)
        changes.push(this.identifyChange(doc, was, index, changes))
      }
      log.trace('Done with analysis.')

      log.trace('Sort changes...')
      remoteChange.sort(changes)

      log.trace('Apply changes...')
      await this.applyAll(changes)

      log.trace('Done with pull.')
      target = (await this.pouch.db.changes({limit: 1, descending: true})).last_seq
    } finally {
      this.events.emit('sync-target', target)
      release()
      this.events.emit('remote-end')
    }
  }

  identifyChange (doc: RemoteDoc|RemoteDeletion, was: ?Metadata, changeIndex: number, previousChanges: Array<RemoteChange|RemoteNoise>): RemoteChange|RemoteNoise {
    log.trace({path: was ? was.path : _.get(doc, 'path'), doc, was}, 'change received')

    if (doc._deleted) {
      if (was == null) {
        return {
          type: 'RemoteIgnoredChange',
          doc,
          detail: 'file or directory was created, trashed, and removed remotely'
        }
      }
      // $FlowFixMe
      return remoteChange.deleted(was)
    } else {
      if (doc.type !== 'directory' && doc.type !== 'file') {
        return {
          type: 'RemoteInvalidChange',
          doc,
          error: new Error(`Document ${doc._id} is not a file or a directory`)
        }
      } else if (doc.type === 'file' && (doc.md5sum == null || doc.md5sum === '')) {
        return {
          type: 'RemoteIgnoredChange',
          doc,
          detail: 'Ignoring temporary file'
        }
      } else {
        return this.identifyExistingDocChange(doc, was, changeIndex, previousChanges)
      }
    }
  }

  // FIXME: comment: Transform the doc and save it in pouchdb
  //
  // In both CouchDB and PouchDB, the filepath includes the name field.
  // And the _id/_rev from CouchDB are saved in the remote field in PouchDB.
  //
  // Note that the changes feed can aggregate several changes for many changes
  // for the same document. For example, if a file is created and then put in
  // the trash just after, it looks like it appeared directly on the trash.
  identifyExistingDocChange (remote: RemoteDoc, was: ?Metadata, changeIndex: number, previousChanges: Array<RemoteChange|RemoteNoise>): * {
    let doc: Metadata = conversion.createMetadata(remote)
    try {
      ensureValidPath(doc)
    } catch (error) {
      return {type: 'RemoteInvalidChange', doc, error}
    }
    const {docType, path} = doc
    assignId(doc)

    if (doc.docType !== 'file' && doc.docType !== 'folder') {
      return {
        type: 'RemoteInvalidChange',
        doc,
        error: new Error(`Unexpected docType: ${doc.docType}`)
      }
    }

    // TODO: Move to Prep?
    if (!inRemoteTrash(remote)) {
      const incompatibilities = detectPlatformIncompatibilities(
        doc,
        this.prep.config.syncPath
      )
      if (incompatibilities.length > 0) {
        log.warn({path, incompatibilities})
        this.events.emit('platform-incompatibilities', incompatibilities)
        doc.incompatibilities = incompatibilities
      }
    } else {
      if (!was) {
        return {
          type: 'RemoteIgnoredChange',
          doc,
          detail: `${docType} was created and trashed remotely`
        }
      }
      return remoteChange.trashed(doc, was)
    }
    if (!was) {
      return remoteChange.added(doc)
    }
    if (was.remote && was.remote._rev === doc.remote._rev) {
      return remoteChange.upToDate(doc, was)
    }
    if (!inRemoteTrash(remote) && was.trashed) {
      return remoteChange.restored(doc, was)
    }
    if (was._id === doc._id) {
      if (doc.docType === 'file' && doc.md5sum === was.md5sum && doc.size !== was.size) {
        return {
          type: 'RemoteInvalidChange',
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
    if ((doc.docType === 'file') && (was.md5sum === doc.md5sum)) {
      const change: RemoteFileMoved = {type: 'RemoteFileMoved', doc, was}
      // Squash moves
      for (let previousChangeIndex = 0; previousChangeIndex < changeIndex; previousChangeIndex++) {
        const previousChange: RemoteChange|RemoteNoise = previousChanges[previousChangeIndex]
        // FIXME figure out why isChildMove%checks is not enough
        if (previousChange.type === 'RemoteFolderMoved' && remoteChange.isChildMove(previousChange, change)) {
          if (!remoteChange.isOnlyChildMove(previousChange, change)) {
            // move inside move
            change.was.path = remoteChange.applyMoveToPath(previousChange, change.was.path)
            change.needRefetch = true
            return change
          } else {
            return {
              type: 'RemoteIgnoredChange',
              doc,
              was,
              detail: `File was moved as descendant of ${_.get(previousChange, 'doc.path')}`
            }
          }
        }
      }
      return change
    }
    if (doc.docType === 'folder') {
      const change = {type: 'RemoteFolderMoved', doc, was}
      // Squash moves
      for (let previousChangeIndex = 0; previousChangeIndex < changeIndex; previousChangeIndex++) {
        const previousChange: RemoteChange|RemoteNoise = previousChanges[previousChangeIndex]
        // FIXME figure out why isChildMove%checks is not enough
        if ((previousChange.type === 'RemoteFolderMoved' || previousChange.type === 'RemoteFileMoved') && remoteChange.isChildMove(change, previousChange)) {
          if (!remoteChange.isOnlyChildMove(change, previousChange)) {
            previousChange.was.path = remoteChange.applyMoveToPath(change, previousChange.was.path)
            previousChange.needRefetch = true
            continue
          } else {
            _.assign(previousChange, {
              type: 'RemoteIgnoredChange',
              detail: `Folder was moved as descendant of ${change.doc.path}`
            })
            continue
          }
        } else if (remoteChange.isChildMove(previousChange, change)) {
          return {
            type: 'RemoteIgnoredChange',
            doc,
            was,
            detail: `Folder was moved as descendant of ${_.get(previousChange, 'doc.path')}`
          }
        }
      }
      return change
    }
    // TODO: add unit test
    log.info({path}, `${docType} was possibly renamed remotely while updated locally`)
    return remoteChange.dissociated(doc, was)
  }

  async applyAll (changes: Array<RemoteChange|RemoteNoise>): Promise<void> {
    const failedChanges = []

    for (let change of changes) {
      try {
        await this.apply(change)
      } catch (err) {
        log.error({path: _.get(change, 'doc.path'), err})
        failedChanges.push(change)
      } // try
    } // for

    if (failedChanges.length > 0) {
      throw new Error(
        `Some changes could not be pulled:\n${failedChanges.map(change =>
          JSON.stringify(change.doc)).join('\n')}`
      )
    }
  }

  async apply (change: RemoteChange|RemoteNoise): Promise<void> {
    const docType = _.get(change, 'doc.docType')
    const path = _.get(change, 'doc.path')

    switch (change.type) {
      case 'RemoteInvalidChange':
        throw change.error
      case 'RemoteIgnoredChange':
        log.debug({path, remoteId: change.doc._id}, change.detail)
        break
      case 'RemoteFileTrashed':
        log.info({path}, 'file was trashed remotely')
        await this.prep.trashFileAsync(sideName, change.was, change.doc)
        break
      case 'RemoteFolderTrashed':
        log.info({path}, 'folder was trashed remotely')
        await this.prep.trashFolderAsync(sideName, change.was, change.doc)
        break
      case 'RemoteFileDeleted':
        log.info({path}, 'file was deleted permanently')
        await this.prep.deleteFileAsync(sideName, change.doc)
        break
      case 'RemoteFolderDeleted':
        log.info({path}, 'folder was deleted permanently')
        await this.prep.deleteFolderAsync(sideName, change.doc)
        break
      case 'RemoteFileAdded':
        log.info({path}, 'file was added remotely')
        await this.prep.addFileAsync(sideName, change.doc)
        break
      case 'RemoteFolderAdded':
        log.info({path}, 'folder was added remotely')
        await this.prep.putFolderAsync(sideName, change.doc)
        break
      case 'RemoteFileRestored':
        log.info({path}, 'file was restored remotely')
        await this.prep.restoreFileAsync(sideName, change.doc, change.was)
        break
      case 'RemoteFolderRestored':
        log.info({path}, 'folder was restored remotely')
        await this.prep.restoreFolderAsync(sideName, change.doc, change.was)
        break
      case 'RemoteFileUpdated':
        log.info({path}, 'file was updated remotely')
        await this.prep.updateFileAsync(sideName, change.doc)
        break
      case 'RemoteFileMoved':
        log.info({path, oldpath: change.was.path}, 'file was moved or renamed remotely')
        if (change.needRefetch) {
          change.was = await this.pouch.byRemoteIdMaybeAsync(change.was.remote._id)
          change.was.childMove = false
        }
        await this.prep.moveFileAsync(sideName, change.doc, change.was)
        break
      case 'RemoteFolderMoved':
        log.info({path}, 'folder was moved or renamed remotely')
        await this.prep.moveFolderAsync(sideName, change.doc, change.was)
        break
      case 'RemoteFileDissociated':
        log.info({path}, 'file was possibly renamed remotely while updated locally')
        await this.dissociateFromRemote(change.was)
        await this.prep.addFileAsync(sideName, change.doc)
        break
      case 'RemoteFolderDissociated':
        log.info({path}, 'folder was possibly renamed remotely while updated locally')
        await this.dissociateFromRemote(change.was)
        await this.prep.putFolderAsync(sideName, change.doc)
        break
      case 'RemoteUpToDate':
        log.info({path}, `${docType} is up-to-date`)
        break
      default:
        throw new Error(`Unexpected change type: ${change.type}`)
    } // switch
  }

  // Remove the association between a document and its remote
  // It's useful when a file has diverged (updated/renamed both in local and
  // remote) while cozy-desktop was not running.
  async dissociateFromRemote (doc: Metadata): Promise<void> {
    const {path} = doc
    log.info({path}, 'Dissociating from remote...')
    delete doc.remote
    if (doc.sides) delete doc.sides.remote
    await this.pouch.put(doc)
  }
}
