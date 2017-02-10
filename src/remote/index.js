/* @flow weak */

import RemoteCozy from './cozy'
import Watcher from './watcher'

let log = require('printit')({
  prefix: 'Remote writer ',
  date: true
})

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

  // Create a folder on the remote cozy instance
  addFolder (doc, callback) {
    log.info(`Add folder ${doc.path}`)
    let folder = this.createRemoteDoc(doc)
    this.couch.put(folder, function (err, created) {
      if (!err) {
        doc.remote = {
          _id: created.id,
          _rev: created.rev
        }
      }
      callback(err, created)
    })
  }
}
