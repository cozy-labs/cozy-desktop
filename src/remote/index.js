/* @flow */

import Config from '../config'
import * as conversion from '../conversion'
import RemoteCozy from './cozy'
import { jsonApiToRemoteDoc } from './document'
import logger from '../logger'
import Pouch from '../pouch'
import Prep from '../prep'
import Watcher from './watcher'

import type { RemoteDoc } from './document'
import type { FileStreamProvider } from '../file_stream_provider'
import type { Metadata } from '../metadata'
import type { Side } from '../side' // eslint-disable-line
import type { Callback } from '../utils'

const log = logger({
  prefix: 'Remote writer ',
  date: true
})

export default class Remote implements Side {
  other: FileStreamProvider
  pouch: Pouch
  watcher: Watcher
  remoteCozy: RemoteCozy

  constructor (config: Config, prep: Prep, pouch: Pouch) {
    this.pouch = pouch
    this.remoteCozy = new RemoteCozy(config)
    this.watcher = new Watcher(pouch, prep, this.remoteCozy)
  }

  start (callback: Function) {
    this.watcher.start()
    callback()
  }

  stop (callback: Function) {
    this.watcher.stop()
    callback()
  }

  // Create a readable stream for the given doc
  async createReadStream (doc: Metadata, callback: Callback) {
    try {
      const stream = await this.remoteCozy.downloadBinary(doc.remote._id, callback)
      callback(null, stream)
    } catch (err) {
      callback(err)
    }
  }

  // Create a folder on the remote cozy instance
  async addFolder (doc: Metadata, callback: Callback) {
    try {
      log.info(`Add folder ${doc.path}`)

      const [dirPath, name] = conversion.extractDirAndName(doc.path)
      const dir: RemoteDoc = await this.remoteCozy.findDirectoryByPath(dirPath)
      const created: RemoteDoc = await this.remoteCozy.createDirectory({
        name,
        dirID: dir._id,
        lastModifiedDate: doc.lastModification
      })

      doc.remote = {
        _id: created._id,
        _rev: created._rev
      }

      callback(null, created)
    } catch (err) {
      callback(err)
    }
  }

  async addFileAsync (doc: Metadata): Promise<RemoteDoc> {
    const stream = await this.other.createReadStreamAsync(doc)
    const [dirPath, name] = conversion.extractDirAndName(doc.path)
    const dir = await this.remoteCozy.findDirectoryByPath(dirPath)
    const created = await this.remoteCozy.createFile(stream, {
      name,
      dirID: dir._id,
      executable: doc.executable,
      contentType: doc.mime,
      lastModifiedDate: new Date(doc.lastModification)
    })

    doc.remote = {
      _id: created._id,
      _rev: created._rev
    }

    return created
  }

  // FIXME: Drop this wrapper as soon as Sync uses promises
  addFile (doc: Metadata, callback: Callback) {
    try {
      this.addFileAsync(doc)
        .then(created => callback(null, created))
        .catch(callback)
    } catch (err) {
      callback(err)
    }
  }

  async overwriteFileAsync (doc: Metadata, old: Metadata): Promise<RemoteDoc> {
    const stream = await this.other.createReadStreamAsync(doc)
    const updated = await this.remoteCozy.updateFileById(doc.remote._id, stream, {
      contentType: doc.mime,
      checksum: doc.checksum,
      lastModifiedDate: new Date(doc.lastModification)
    })

    doc.remote._rev = updated._rev

    return jsonApiToRemoteDoc(updated)
  }

  async overwriteFile (doc: Metadata, old: Metadata, callback: Callback) {
    try {
      const updated = await this.overwriteFileAsync(doc, old)
      callback(null, updated)
    } catch (err) {
      callback(err)
    }
  }

  // FIXME: Temporary stubs so we can do some acceptance testing on file upload
  //        without getting errors for missing methods.

  updateFileMetadata (doc: Metadata, _: any, callback: Callback) {
    callback(new Error('Remote#updateFileMetadata() is not implemented'))
  }

  updateFolder (doc: Metadata, _: any, callback: Callback) {
    callback(new Error('Remote#updateFolder() is not implemented'))
  }

  moveFile (doc: Metadata, from: Metadata, callback: Callback) {
    callback(new Error('Remote#moveFile() is not implemented'))
  }

  moveFolder (doc: Metadata, from: Metadata, callback: Callback) {
    callback(new Error('Remote#moveFolder() is not implemented'))
  }

  deleteFile (doc: Metadata, callback: Callback) {
    callback(new Error('Remote#deleteFile() is not implemented'))
  }

  deleteFolder (doc: Metadata, callback: Callback) {
    callback(new Error('Remote#deleteFolder() is not implemented'))
  }
}
