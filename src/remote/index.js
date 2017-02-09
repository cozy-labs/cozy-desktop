/* @flow weak */

import RemoteCozy from './cozy'
import Watcher from './watcher'

export default class Remote {
  watcher: Watcher
  remoteCozy: RemoteCozy

  constructor (config, prep, pouch) {
    const deviceName = config.getDefaultDeviceName()
    const device = config.getDevice(deviceName)

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
}
