/* @flow */

import cozy from 'cozy-client-js'
import path from 'path'

import Pouch from '../../src/pouch'
import Remote from '../../src/remote'
import { TRASH_DIR_NAME } from '../../src/remote/constants'

export class RemoteTestHelpers {
  remote: Remote

  constructor (remote: Remote) {
    this.remote = remote
  }

  get cozy (): cozy.Client { return this.remote.remoteCozy.client }
  get pouch (): Pouch { return this.remote.pouch }

  async ignorePreviousChanges () {
    const {last_seq} = await this.remote.remoteCozy.changes()
    await this.pouch.setRemoteSeqAsync(last_seq)
  }

  async pullChanges () {
    await this.remote.watcher.watch()
  }

  async tree () {
    const pathsToScan = ['/', `/${TRASH_DIR_NAME}`]
    const relPaths = [`${TRASH_DIR_NAME}/`]

    while (true) {
      const dirPath = pathsToScan.shift()
      if (dirPath == null) break

      const dir = await this.cozy.files.statByPath(dirPath)
      for (const content of dir.relations('contents')) {
        const {name, type} = content.attributes
        const remotePath = path.posix.join(dirPath, name)
        let relPath = remotePath.slice(1)

        if (type === 'directory') {
          relPath += '/'
          pathsToScan.push(remotePath)
        }

        relPaths.push(relPath)
      }
    }

    return relPaths.sort()
  }
}
