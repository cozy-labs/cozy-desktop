/* @flow weak */

import printit from 'printit'

import * as conversion from '../conversion'
import RemoteCozy from './cozy'
import Pouch from '../pouch'
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

  constructor (config, prep, pouch) {
    const deviceName = config.getDefaultDeviceName()
    const device = config.getDevice(deviceName)

    this.pouch = pouch
    this.remoteCozy = new RemoteCozy(device.url)
    this.watcher = new Watcher(pouch, prep, this.remoteCozy)
  }

  start (callback) {
    this.watcher.start()
    callback()
  }

  stop (callback) {
    this.watcher.stop()
    callback()
  }

  // Create a readable stream for the given doc
  async createReadStream (doc, callback) {
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
}
