/* @flow */

import * as conversion from '../conversion'
import EventEmitter from 'events'
import _ from 'lodash'

import logger from '../logger'
import { ensureValidPath, detectPlatformIncompatibilities } from '../metadata'
import Pouch from '../pouch'
import Prep from '../prep'
import RemoteCozy from './cozy'
import * as remoteChange from './change'
import { inRemoteTrash } from './document'

import type { Metadata } from '../metadata'
import type { Change } from './change'
import type { RemoteDoc, RemoteDeletion } from './document'

const log = logger({
  component: 'RemoteWatcher'
})

export const DEFAULT_HEARTBEAT: number = 1000 * 60 // 1 minute
export const HEARTBEAT: number = parseInt(process.env.COZY_DESKTOP_HEARTBEAT) || DEFAULT_HEARTBEAT

const SIDE = 'remote'

// Get changes from the remote Cozy and prepare them for merge
export default class RemoteWatcher {
  pouch: Pouch
  prep: Prep
  remoteCozy: RemoteCozy
  events: EventEmitter
  intervalID: ?number
  runningResolve: ?() => void

  constructor (pouch: Pouch, prep: Prep, remoteCozy: RemoteCozy, events: EventEmitter) {
    this.pouch = pouch
    this.prep = prep
    this.remoteCozy = remoteCozy
    this.events = events
  }

  start () {
    const started = this.watch()
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
    const changes: Change[] = []
    const release = await this.pouch.lock()

    try {
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
    } finally {
      // TODO: Ensure lock is released
      release()
    }
  }

  identifyChange (doc: RemoteDoc|RemoteDeletion, was: ?Metadata, changeIndex: number, previousChanges: Change[]): Change {
    log.trace({path: was ? was.path : _.get(doc, 'path'), doc, was}, 'change received')

    if (doc._deleted) {
      if (was == null) {
        return {
          type: 'IgnoredChange',
          doc,
          detail: 'file or directory was created, trashed, and removed remotely'
        }
      }
      // $FlowFixMe
      return remoteChange.deleted(was)
    } else {
      if (doc.type !== 'directory' && doc.type !== 'file') {
        return {
          type: 'InvalidChange',
          doc,
          error: new Error(`Document ${doc._id} is not a file or a directory`)
        }
      } else if (doc.type === 'file' && (doc.md5sum == null || doc.md5sum === '')) {
        return {
          type: 'IgnoredChange',
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
  identifyExistingDocChange (remote: RemoteDoc, was: ?Metadata, changeIndex: number, previousChanges: Change[]): * {
    let doc: Metadata = conversion.createMetadata(remote)
    try {
      ensureValidPath(doc)
    } catch (error) {
      return {type: 'InvalidChange', doc, error}
    }
    const {docType, path} = doc

    if (doc.docType !== 'file' && doc.docType !== 'folder') {
      return {
        type: 'InvalidChange',
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
        return {type: 'PlatformIncompatibleChange', doc, incompatibilities}
      }
    } else {
      if (!was) {
        return {
          type: 'IgnoredChange',
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
    if (was.path === doc.path) {
      return remoteChange.updated(doc)
    }
    if ((doc.docType === 'file') && (was.md5sum === doc.md5sum)) {
      return {type: 'FileMoved', doc, was}
    }
    if (doc.docType === 'folder') {
      const change = {type: 'FolderMoved', doc, was}
      // Squash moves
      for (let previousChangeIndex = 0; previousChangeIndex < changeIndex; previousChangeIndex++) {
        const previousChange = previousChanges[previousChangeIndex]
        const previousDesc = `previous(${previousChange.type} ${_.get(previousChange, 'doc.path')})`
        const currentDesc = `current(${change.type} ${change.doc.path})`
        if (remoteChange.isChildMove(change, previousChange)) {
          _.assign(previousChange, {
            type: 'IgnoredChange',
            detail: `Folder was moved as descendant of ${change.doc.path}`
          })
          continue
        } else if (remoteChange.isChildMove(previousChange, change)) {
          return {
            type: 'IgnoredChange',
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

  async applyAll (changes: Change[]): Promise<void> {
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

  async apply (change: Change): Promise<void> {
    const docType = _.get(change, 'doc.docType')
    const path = _.get(change, 'doc.path')

    switch (change.type) {
      case 'InvalidChange':
        throw change.error
      case 'PlatformIncompatibleChange':
        this.events.emit('platform-incompatibilities', change.incompatibilities)
        break
      case 'IgnoredChange':
        log.debug({path, remoteId: change.doc._id}, change.detail)
        break
      case 'FileTrashed':
        log.info({path}, 'file was trashed remotely')
        await this.prep.trashFileAsync(SIDE, change.was, change.doc)
        break
      case 'FolderTrashed':
        log.info({path}, 'folder was trashed remotely')
        await this.prep.trashFolderAsync(SIDE, change.was, change.doc)
        break
      case 'FileDeleted':
        log.info({path}, 'file was deleted permanently')
        await this.prep.deleteFileAsync(SIDE, change.doc)
        break
      case 'FolderDeleted':
        log.info({path}, 'folder was deleted permanently')
        await this.prep.deleteFolderAsync(SIDE, change.doc)
        break
      case 'FileAdded':
        log.info({path}, 'file was added remotely')
        await this.prep.addFileAsync(SIDE, change.doc)
        break
      case 'FolderAdded':
        log.info({path}, 'folder was added remotely')
        await this.prep.putFolderAsync(SIDE, change.doc)
        break
      case 'FileRestored':
        log.info({path}, 'file was restored remotely')
        await this.prep.restoreFileAsync(SIDE, change.doc, change.was)
        break
      case 'FolderRestored':
        log.info({path}, 'folder was restored remotely')
        await this.prep.restoreFolderAsync(SIDE, change.doc, change.was)
        break
      case 'FileUpdated':
        log.info({path}, 'file was updated remotely')
        await this.prep.updateFileAsync(SIDE, change.doc)
        break
      case 'FileMoved':
        log.info({path}, 'file was moved or renamed remotely')
        await this.prep.moveFileAsync(SIDE, change.doc, change.was)
        break
      case 'FolderMoved':
        log.info({path}, 'folder was moved or renamed remotely')
        await this.prep.moveFolderAsync(SIDE, change.doc, change.was)
        break
      case 'FileDissociated':
        log.info({path}, 'file was possibly renamed remotely while updated locally')
        await this.dissociateFromRemote(change.was)
        await this.prep.addFileAsync(SIDE, change.doc)
        break
      case 'FolderDissociated':
        log.info({path}, 'folder was possibly renamed remotely while updated locally')
        await this.dissociateFromRemote(change.was)
        await this.prep.putFolderAsync(SIDE, change.doc)
        break
      case 'UpToDate':
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
