/* @flow */

import clone from 'lodash.clone'
import EventEmitter from 'events'
import * as stream from 'stream'

import Config from '../config'
import * as conversion from '../conversion'
import RemoteCozy from './cozy'
import logger from '../logger'
import Pouch from '../pouch'
import Prep from '../prep'
import Watcher from './watcher'

import type { RemoteDoc } from './document'
import type { FileStreamProvider } from '../file_stream_provider'
import type { Metadata } from '../metadata'
import type { Side } from '../side' // eslint-disable-line

const log = logger({
  component: 'RemoteWriter'
})

export default class Remote implements Side {
  other: FileStreamProvider
  pouch: Pouch
  events: EventEmitter
  watcher: Watcher
  remoteCozy: RemoteCozy

  constructor (config: Config, prep: Prep, pouch: Pouch, events: EventEmitter) {
    this.pouch = pouch
    this.events = events
    this.remoteCozy = new RemoteCozy(config)
    this.watcher = new Watcher(pouch, prep, this.remoteCozy)
  }

  start () {
    return this.watcher.start()
  }

  stop () {
    return this.watcher.stop()
  }

  unregister () {
    return this.remoteCozy.unregister()
  }

  // Create a readable stream for the given doc
  createReadStreamAsync (doc: Metadata): Promise<stream.Readable> {
    return this.remoteCozy.downloadBinary(doc.remote._id)
  }

  // Create a folder on the remote cozy instance
  async addFolderAsync (doc: Metadata): Promise<Metadata> {
    log.info(`${doc.path}: Creating folder...`)

    const [parentPath, name] = conversion.extractDirAndName(doc.path)
    const parent: RemoteDoc = await this.remoteCozy.findDirectoryByPath(parentPath)
    let dir: RemoteDoc

    try {
      dir = await this.remoteCozy.createDirectory({
        name,
        dirID: parent._id,
        lastModifiedDate: doc.updated_at
      })
    } catch (err) {
      if (err.status !== 409) { throw err }

      log.info(`${doc.path}: Folder already exists`)
      dir = await this.remoteCozy.findDirectoryByPath(`/${doc.path}`)
    }

    doc.remote = {
      _id: dir._id,
      _rev: dir._rev
    }

    return conversion.createMetadata(dir)
  }

  async addFileAsync (doc: Metadata): Promise<Metadata> {
    log.info(`${doc.path}: Uploading new file...`)
    const stream = await this.other.createReadStreamAsync(doc)
    const [dirPath, name] = conversion.extractDirAndName(doc.path)
    const dir = await this.remoteCozy.findDirectoryByPath(dirPath)

    // Emit events to track the upload progress
    let info = clone(doc)
    info.way = 'up'
    info.eventName = `transfer-up-${doc._id}`
    this.events.emit('transfer-started', info)
    stream.on('data', data => {
      this.events.emit(info.eventName, data)
    })
    stream.on('finish', () => {
      this.events.emit(info.eventName, {finished: true})
    })

    const created = await this.remoteCozy.createFile(stream, {
      name,
      dirID: dir._id,
      executable: doc.executable,
      contentType: doc.mime,
      lastModifiedDate: new Date(doc.updated_at)
    })

    doc.remote = {
      _id: created._id,
      _rev: created._rev
    }

    // TODO do we use the returned values somewhere?
    return conversion.createMetadata(created)
  }

  async overwriteFileAsync (doc: Metadata, old: ?Metadata): Promise<Metadata> {
    log.info(`${doc.path}: Uploading new file version...`)
    const stream = await this.other.createReadStreamAsync(doc)
    const updated = await this.remoteCozy.updateFileById(doc.remote._id, stream, {
      contentType: doc.mime,
      checksum: doc.md5sum,
      lastModifiedDate: new Date(doc.updated_at)
    })

    doc.remote._rev = updated._rev

    return conversion.createMetadata(updated)
  }

  async updateFileMetadataAsync (doc: Metadata, old: any): Promise<Metadata> {
    log.info(`${doc.path}: Updating file metadata...`)

    const attrs = {
      executable: doc.executable,
      updated_at: doc.updated_at
    }
    const opts = {
      ifMatch: old.remote._rev
    }
    const updated = await this.remoteCozy.updateAttributesById(old.remote._id, attrs, opts)

    doc.remote = {
      _id: updated._id,
      _rev: updated._rev
    }

    return conversion.createMetadata(updated)
  }

  async moveFileAsync (newMetadata: Metadata, oldMetadata: Metadata): Promise<Metadata> {
    log.info(`${oldMetadata.path}: Moving to ${newMetadata.path}`)

    const [newDirPath, newName]: [string, string] = conversion.extractDirAndName(newMetadata.path)
    const newDir: RemoteDoc = await this.remoteCozy.findDirectoryByPath(newDirPath)
    const newRemoteDoc: RemoteDoc = await this.remoteCozy.updateAttributesById(oldMetadata.remote._id, {
      name: newName,
      dir_id: newDir._id
    })

    newMetadata.remote = {
      _id: newRemoteDoc._id,
      _rev: newRemoteDoc._rev
    }

    return conversion.createMetadata(newRemoteDoc)
  }

  async updateFolderAsync (doc: Metadata, old: Metadata): Promise<Metadata> {
    if (!old.remote) {
      return this.addFolderAsync(doc)
    }
    log.info(`${doc.path}: Updating metadata...`)

    const [newParentDirPath, newName] = conversion.extractDirAndName(doc.path)
    const newParentDir = await this.remoteCozy.findDirectoryByPath(newParentDirPath)
    let newRemoteDoc: RemoteDoc

    try {
      newRemoteDoc = await this.remoteCozy.updateAttributesById(old.remote._id, {
        name: newName,
        dir_id: newParentDir._id,
        updated_at: doc.updated_at
      })
    } catch (err) {
      if (err.status !== 404) { throw err }

      log.warn(`${doc.path}: Directory doesn't exist anymore. Recreating it...`)
      newRemoteDoc = await this.remoteCozy.createDirectory({
        name: newName,
        dirID: newParentDir._id,
        lastModifiedDate: doc.updated_at
      })
    }

    doc.remote = {
      _id: newRemoteDoc._id,
      _rev: newRemoteDoc._rev
    }

    return conversion.createMetadata(newRemoteDoc)
  }

  async trashAsync (doc: Metadata): Promise<void> {
    log.info(`${doc.path}: Moving to the trash...`)
    try {
      await this.remoteCozy.trashById(doc.remote._id)
    } catch (err) {
      throw err
    }
    // TODO update _rev for the trashed file/folder
  }

  moveFolderAsync (doc: Metadata, from: Metadata): Promise<*> {
    // TODO: v3: Remote#moveFolderAsync()
    throw new Error('Remote#moveFolderAsync() is not implemented')
  }

  diskUsage (): Promise<*> {
    return this.remoteCozy.diskUsage()
  }

  // TODO add tests
  async resolveConflictAsync (dst: Metadata, src: Metadata): Promise<*> {
    log.info(`Resolve a conflict: ${src.path} → ${dst.path}`)
    const newName = conversion.extractDirAndName(dst.path)[1]
    await this.remoteCozy.updateAttributesById(src.remote._id, {
      name: newName
    })
  }
}
