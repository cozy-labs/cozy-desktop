/* @flow */

import * as conversion from '../conversion'
import logger from '../logger'
import { invalidPath } from '../metadata'
import Pouch from '../pouch'
import Prep from '../prep'
import RemoteCozy from './cozy'

import type { Metadata } from '../metadata'
import type { RemoteDoc } from './document'

const log = logger({
  prefix: 'RemoteWatcher',
  date: true
})

export const DEFAULT_HEARTBEAT: number = 1000 * 60 * 3 // 3 minutes
export const HEARTBEAT: number = parseInt(process.env.COZY_DESKTOP_HEARTBEAT) || DEFAULT_HEARTBEAT

const SIDE = 'remote'

// Get changes from the remote Cozy and prepare them for merge
export default class RemoteWatcher {
  pouch: Pouch
  prep: Prep
  remoteCozy: RemoteCozy
  intervalID: ?number

  constructor (pouch: Pouch, prep: Prep, remoteCozy: RemoteCozy) {
    this.pouch = pouch
    this.prep = prep
    this.remoteCozy = remoteCozy
  }

  start () {
    this.watch()
    this.intervalID = setInterval(this.watch, HEARTBEAT)
  }

  stop () {
    if (this.intervalID) {
      clearInterval(this.intervalID)
      this.intervalID = null
    }
  }

  async watch () {
    try {
      const seq = await this.pouch.getRemoteSeqAsync()
      const changes = await this.remoteCozy.changes(seq)

      await this.pullMany(changes.ids)
      return this.pouch.setRemoteSeqAsync(changes.last_seq)
    } catch (err) {
      log.error(err)
    }
  }

  // Pull multiple files/dirs metadata at once, given their ids
  async pullMany (ids: string[]) {
    let failedIds = []

    for (let id of ids) {
      try {
        await this.pullOne(id)
      } catch (err) {
        log.error(err)
        failedIds.push(id)
      }
    }

    if (failedIds.length > 0) {
      throw new Error(
        `Some documents could not be pulled: ${failedIds.join(', ')}`
      )
    }
  }

  // Pull a single file/dir metadata, given its id
  async pullOne (id: string): Promise<*> {
    const doc: ?RemoteDoc = await this.remoteCozy.findMaybe(id)

    if (doc != null) {
      return this.onChange(doc)
    }
  }

  async onChange (doc: RemoteDoc) {
    log.info('onChange', doc)
    const was: ?Metadata = await this.pouch.byRemoteIdMaybeAsync(doc._id)

    if (doc.path && doc.path.startsWith('/.cozy_trash/')) {
      if (was == null) {
        log.debug(`${doc.path}: was deleted both remotely and locally`)
        return
      } else {
        log.info(`${doc.path}: was deleted remotely`)
        return this.prep.deleteDocAsync(SIDE, was)
      }
    } else if (['directory', 'file'].includes(doc.type)) {
      return this.putDoc(doc, was)
    } else {
      log.debug(`Document ${doc._id} is not a file or a directory`)
      return
    }
  }

  // Transform the doc and save it in pouchdb
  //
  // In both CouchDB and PouchDB, the filepath includes the name field.
  // And the _id/_rev from CouchDB are saved in the remote field in PouchDB.
  async putDoc (remote: RemoteDoc, was: ?Metadata): Promise<*> {
    let doc: Metadata = conversion.createMetadata(remote)
    const docType = doc.docType
    log.debug('new local doc', doc)
    log.debug('was', was)
    if (invalidPath(doc)) {
      log.error('Invalid path / local id')
      log.error(doc)
      throw new Error('Invalid path/name')
    } else if (!was) {
      log.info(`${doc.path}: ${docType} was added remotely`)
      return this.prep.addDocAsync(SIDE, doc)
    } else if (was.path === doc.path) {
      log.info(`${doc.path}: ${docType} was updated remotely`)
      return this.prep.updateDocAsync(SIDE, doc)
    } else if ((doc.checksum != null) && (was.checksum === doc.checksum)) {
      log.info(`${doc.path}: ${docType} was moved remotely`)
      return this.prep.moveDocAsync(SIDE, doc, was)
    } else if ((doc.docType === 'folder') || (was.remote._rev === doc.remote._rev)) {
      log.info(`${doc.path}: ${docType} was possibly modified and renamed remotely while cozy-desktop was stopped`)
      await this.prep.deleteDocAsync(SIDE, was)
      return this.prep.addDocAsync(SIDE, doc)
    } else {
      // TODO: add unit test
      log.info(`${doc.path}: ${docType} was possibly renamed remotely while updated locally`)
      await this.removeRemote(was)
      return this.prep.addDocAsync(SIDE, doc)
    }
  }

  // Remove the association between a document and its remote
  // It's useful when a file has diverged (updated/renamed both in local and
  // remote) while cozy-desktop was not running.
  removeRemote (doc: Metadata) {
    log.debug(`${doc.path}: Dissociating from remote...`)
    delete doc.remote
    if (doc.sides) delete doc.sides.remote
    return this.pouch.db.put(doc)
  }
}
