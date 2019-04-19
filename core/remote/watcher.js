/* @flow */

const autoBind = require('auto-bind')
const Promise = require('bluebird')
const _ = require('lodash')

const logger = require('../logger')
const metadata = require('../metadata')
const remoteChange = require('./change')
const { inRemoteTrash } = require('./document')
const userActionRequired = require('./user_action_required')

/*::
import type EventEmitter from 'events'
import type Pouch from '../pouch'
import type Prep from '../prep'
import type { RemoteCozy } from './cozy'
import type { Metadata, RemoteRevisionsByID } from '../metadata'
import type { RemoteChange, RemoteFileMove } from './change'
import type { RemoteDoc, RemoteDeletion } from './document'
*/

const log = logger({
  component: 'RemoteWatcher'
})

const DEFAULT_HEARTBEAT /*: number */ = 1000 * 60 // 1 minute
const HEARTBEAT /*: number */ = parseInt(process.env.COZY_DESKTOP_HEARTBEAT) || DEFAULT_HEARTBEAT

const sideName = 'remote'

// Get changes from the remote Cozy and prepare them for merge
class RemoteWatcher {
  /*::
  pouch: Pouch
  prep: Prep
  remoteCozy: RemoteCozy
  events: EventEmitter
  runningResolve: ?() => void
  runningReject: ?() => void
  */

  constructor (pouch /*: Pouch */, prep /*: Prep */, remoteCozy /*: RemoteCozy */, events /*: EventEmitter */) {
    this.pouch = pouch
    this.prep = prep
    this.remoteCozy = remoteCozy
    this.events = events

    autoBind(this)
  }

  start () {
    const started /*: Promise<void> */ = this.watch()
    const running /*: Promise<void> */ = started.then(() => Promise.race([
      // run until either stop is called or watchLoop reject
      new Promise((resolve) => { this.runningResolve = resolve }),
      this.watchLoop()
    ]))

    return {
      started: started,
      running: running
    }
  }

  stop () {
    if (this.runningResolve) {
      this.runningResolve()
      this.runningResolve = null
    }
  }

  async watchLoop () {
    while (true) {
      await Promise.delay(HEARTBEAT)
      if (!this.runningResolve) { // stopped
        return
      }
      await this.watch()
    }
  }

  async watch () {
    try {
      const seq = await this.pouch.getRemoteSeqAsync()
      const {last_seq, docs} = await this.remoteCozy.changes(seq)
      this.events.emit('online')

      if (docs.length === 0) return

      const release = await this.pouch.lock(this)
      let target = -1
      try {
        this.events.emit('remote-start')
        await this.pullMany(docs)
        target = (await this.pouch.db.changes({limit: 1, descending: true})).last_seq
      } finally {
        this.events.emit('sync-target', target)
        release()
        this.events.emit('remote-end')
      }

      await this.pouch.setRemoteSeqAsync(last_seq)
      log.debug('No more remote changes for now')
    } catch (err) {
      if (err.status === 400) {
        log.error({err}, 'Client has been revoked')
        throw new Error('Client has been revoked')
      } else if (err.status === 402) {
        log.error({err}, 'User action required')
        throw userActionRequired.includeJSONintoError(err)
      } else {
        log.error({err})
        this.events.emit('offline')
      }
    }
  }

  // Pull multiple changed or deleted docs
  // FIXME: Misleading method name?
  async pullMany (docs /*: Array<RemoteDoc|RemoteDeletion> */) {
    const remoteIds = docs.reduce((ids, doc) => ids.add(doc._id), new Set())
    const olds = await this.pouch.allByRemoteIds(remoteIds)

    const changes = this.analyse(docs, olds)

    log.trace('Apply changes...')
    await this.applyAll(changes)

    log.trace('Done with pull.')
  }

  analyse (remoteDocs /*: Array<RemoteDoc|RemoteDeletion> */, olds /*: Array<Metadata> */) /*: Array<RemoteChange> */ {
    const oldsByRemoteId = _.keyBy(olds, 'remote._id')
    const changes /*: Array<RemoteChange> */ = []

    log.trace('Contextualize and analyse changesfeed results...')
    for (let index = 0; index < remoteDocs.length; index++) {
      const remoteDoc = remoteDocs[index]
      const was /*: ?Metadata */ = oldsByRemoteId[remoteDoc._id]
      changes.push(this.identifyChange(remoteDoc, was, index, changes))
    }
    log.trace('Done with analysis.')

    log.trace('Sort changes...')
    remoteChange.sort(changes)

    return changes
  }

  identifyChange (remoteDoc /*: RemoteDoc|RemoteDeletion */, was /*: ?Metadata */, changeIndex /*: number */, previousChanges /*: Array<RemoteChange> */) /*: RemoteChange */ {
    const oldpath /*: ?string */ = was && was.path
    log.debug({path: (remoteDoc /*: Object */).path || oldpath, oldpath, remoteDoc, was}, 'change received')

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
          error: new Error(`Document ${remoteDoc._id} is not a file or a directory`)
        }
      } else if (remoteDoc.type === 'file' && (remoteDoc.md5sum == null || remoteDoc.md5sum === '')) {
        return {
          sideName,
          type: 'IgnoredChange',
          doc: remoteDoc,
          detail: 'Ignoring temporary file'
        }
      } else {
        return this.identifyExistingDocChange(remoteDoc, was, changeIndex, previousChanges)
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
  identifyExistingDocChange (remoteDoc /*: RemoteDoc */, was /*: ?Metadata */, changeIndex /*: number */, previousChanges /*: Array<RemoteChange> */) /*: * */ {
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
    const {docType, path} = doc
    metadata.assignId(doc)

    if (doc.docType !== 'file' && doc.docType !== 'folder') {
      return {
        sideName,
        type: 'InvalidChange',
        doc,
        error: new Error(`Unexpected docType: ${doc.docType}`)
      }
    }

    if (was && was.remote && metadata.extractRevNumber(was.remote) >= metadata.extractRevNumber(doc.remote)) {
      return remoteChange.upToDate(doc, was)
    }

    // TODO: Move to Prep?
    if (!inRemoteTrash(remoteDoc)) {
      metadata.assignPlatformIncompatibilities(doc, this.prep.config.syncPath)
      const { incompatibilities } = doc
      if (incompatibilities) {
        log.debug({path, oldpath: was && was.path, incompatibilities})
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
      const previousMoveToSamePath = _.find(previousChanges, change =>
        // $FlowFixMe
        (change.type === 'DescendantChange' || change.type === 'FileMove' || change.type === 'DirMove') && change.doc.path === was.path)

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
    if (!was) {
      return remoteChange.added(doc)
    }
    if (!inRemoteTrash(remoteDoc) && was.trashed) {
      return remoteChange.restored(doc, was)
    }
    if (was._id === doc._id && was.path === doc.path) {
      if (doc.docType === 'file' && doc.md5sum === was.md5sum && doc.size !== was.size) {
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
    if ((doc.docType === 'file')) {
      const change /*: RemoteFileMove */ = {sideName, type: 'FileMove', doc, was}
      if (was.md5sum !== doc.md5sum) change.update = true // move + change

      // Squash moves
      for (let previousChangeIndex = 0; previousChangeIndex < changeIndex; previousChangeIndex++) {
        const previousChange /*: RemoteChange */ = previousChanges[previousChangeIndex]
        // FIXME figure out why isChildMove%checks is not enough
        if (previousChange.type === 'DirMove' && remoteChange.isChildMove(previousChange, change)) {
          if (!remoteChange.isOnlyChildMove(previousChange, change)) {
            // move inside move
            change.was.path = remoteChange.applyMoveToPath(previousChange, change.was.path)
            change.needRefetch = true
            return change // FileMove
          } else {
            const descendantChange = {
              sideName,
              type: 'DescendantChange',
              update: change.update,
              doc,
              was,
              ancestorPath: _.get(previousChange, 'doc.path')
            }
            if (previousChange.type === 'DirMove') remoteChange.includeDescendant(previousChange, descendantChange)
            return descendantChange
          }
        } else if (previousChange.type === 'FileTrashing' && previousChange.was.path === change.doc.path) {
          _.assign(previousChange, {
            type: 'IgnoredChange',
            detail: `File ${previousChange.was.path} overwritten by ${change.was.path}`
          })
          change.doc.overwrite = previousChange.was
          return change
        }
      }
      return change
    } else { // doc.docType === 'folder'
      const change = {sideName, type: 'DirMove', doc, was}
      // Squash moves
      for (let previousChangeIndex = 0; previousChangeIndex < changeIndex; previousChangeIndex++) {
        const previousChange /*: RemoteChange */ = previousChanges[previousChangeIndex]
        // FIXME figure out why isChildMove%checks is not enough
        if ((previousChange.type === 'DirMove' || previousChange.type === 'FileMove') && remoteChange.isChildMove(change, previousChange)) {
          if (!remoteChange.isOnlyChildMove(change, previousChange)) {
            previousChange.was.path = remoteChange.applyMoveToPath(change, previousChange.was.path)
            previousChange.needRefetch = true
            continue
          } else {
            _.assign(previousChange, {
              type: 'DescendantChange',
              ancestorPath: change.doc.path
            })
            // $FlowFixMe
            remoteChange.includeDescendant(change, previousChange)
            continue
          }
        } else if (previousChange.type === 'DirTrashing' && previousChange.was.path === change.doc.path) {
          _.assign(previousChange, {
            type: 'IgnoredChange',
            detail: `Folder ${previousChange.was.path} overwritten by ${change.was.path}`
          })
          change.doc.overwrite = previousChange.was
          return change
        } else if (remoteChange.isChildMove(previousChange, change)) {
          const descendantChange = {
            sideName,
            type: 'DescendantChange',
            doc,
            was,
            ancestorPath: _.get(previousChange, 'doc.path')
          }
          if (previousChange.type === 'DirMove') remoteChange.includeDescendant(previousChange, descendantChange)
          return descendantChange
        }
      }
      return change
    }
  }

  async applyAll (changes /*: Array<RemoteChange> */) /*: Promise<void> */ {
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

  async apply (change /*: RemoteChange */) /*: Promise<void> */ {
    const docType = _.get(change, 'doc.docType')
    const path = _.get(change, 'doc.path')

    switch (change.type) {
      case 'InvalidChange':
        throw change.error
      case 'DescendantChange':
        log.debug({path, remoteId: change.doc._id},
          `${_.get(change, 'doc.docType')} was moved as descendant of ${change.ancestorPath}`)
        break
      case 'IgnoredChange':
        log.debug({path, remoteId: change.doc._id}, change.detail)
        break
      case 'FileTrashing':
        log.info({path}, 'file was trashed remotely')
        await this.prep.trashFileAsync(sideName, change.was, change.doc)
        break
      case 'DirTrashing':
        log.info({path}, 'folder was trashed remotely')
        await this.prep.trashFolderAsync(sideName, change.was, change.doc)
        break
      case 'FileDeletion':
        log.info({path}, 'file was deleted permanently')
        await this.prep.deleteFileAsync(sideName, change.doc)
        break
      case 'DirDeletion':
        log.info({path}, 'folder was deleted permanently')
        await this.prep.deleteFolderAsync(sideName, change.doc)
        break
      case 'FileAddition':
        log.info({path}, 'file was added remotely')
        await this.prep.addFileAsync(sideName, change.doc)
        break
      case 'DirAddition':
        log.info({path}, 'folder was added remotely')
        await this.prep.putFolderAsync(sideName, change.doc)
        break
      case 'FileRestoration':
        log.info({path}, 'file was restored remotely')
        await this.prep.restoreFileAsync(sideName, change.doc, change.was)
        break
      case 'DirRestoration':
        log.info({path}, 'folder was restored remotely')
        await this.prep.restoreFolderAsync(sideName, change.doc, change.was)
        break
      case 'FileUpdate':
        log.info({path}, 'file was updated remotely')
        await this.prep.updateFileAsync(sideName, change.doc)
        break
      case 'FileMove':
        log.info({path, oldpath: change.was.path}, 'file was moved or renamed remotely')
        if (change.needRefetch) {
          change.was = await this.pouch.byRemoteIdMaybeAsync(change.was.remote._id)
          change.was.childMove = false
        }
        await this.prep.moveFileAsync(sideName, change.doc, change.was)
        if (change.update) {
          await this.prep.updateFileAsync(sideName, change.doc)
        }
        break
      case 'DirMove':
        log.info({path, oldpath: change.was.path}, 'folder was moved or renamed remotely')
        const newRemoteRevs /*: RemoteRevisionsByID */ = {}
        const descendants = change.descendantMoves || []
        for (let descendant of descendants) {
          if (descendant.doc.remote) {
            newRemoteRevs[descendant.doc.remote._id] = descendant.doc.remote._rev
          }
        }
        await this.prep.moveFolderAsync(sideName, change.doc, change.was, newRemoteRevs)
        for (let descendant of descendants) {
          if (descendant.update) {
            await this.prep.updateFileAsync(sideName, descendant.doc)
          }
        }
        break
      case 'UpToDate':
        log.info({path}, `${docType} is up-to-date`)
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
