/* @flow weak */

import RemoteCozy from './cozy'
import Watcher from './watcher'

export default class Remote {
  watcher: Watcher

  constructor (config, prep, pouch) {
    const deviceName = config.getDefaultDeviceName()
    const device = config.getDevice(deviceName)
    const remoteCozy = new RemoteCozy(device.url)

    this.watcher = new Watcher(pouch, prep, remoteCozy)
  }

  start (callback) {
    this.watcher.start()
    callback()
  }

  stop (callback) {
    this.watcher.stop()
    callback()
  }
}
