/* @flow */

import printit from 'printit'

import Config from '../config'
import * as conversion from '../conversion'
import RemoteCozy from './cozy'
import Pouch from '../pouch'
import Prep from '../prep'
import Watcher from './watcher'

import type { RemoteDoc } from './document'
import type { FileStreamProvider } from '../file_stream_provider'
import type { Metadata } from '../metadata'
import type { Callback } from '../utils'

const log = printit({
  prefix: 'Remote writer ',
  date: true
})

export default class Remote {
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
    this.addFileAsync(doc)
      .then(created => callback(null, created))
      .catch(callback)
  }

  // FIXME: Temporary stub so we can do some acceptance testing on file upload
  //        without getting errors for methods not implemented yet.
  updateFileMetadata (doc: Metadata, _: any, callback: Callback) {
    callback(null, doc)
  }
}
