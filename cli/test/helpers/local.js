/* @flow */

import Promise from 'bluebird'
import fs from 'fs'
import path from 'path'
import rimraf from 'rimraf'

import { TMP_DIR_NAME } from '../../src/local/constants'

Promise.promisifyAll(fs)
const rimrafAsync = Promise.promisify(rimraf)

export class LocalTestHelpers {
  syncPath: string

  constructor (syncPath: string) {
    this.syncPath = path.normalize(syncPath)
  }

  async clean () {
    for (const pattern of ['*', '.*']) {
      await rimrafAsync(path.join(this.syncPath, pattern))
    }
  }

  async tree () {
    const dirsToRead = [this.syncPath]
    const relPaths = []
    const makeRelative = (absPath) => { return absPath.slice(this.syncPath.length + 1) }

    while (true) {
      const dir = dirsToRead.shift()
      if (dir == null) break

      // $FlowFixMe
      for (const name of await fs.readdirAsync(dir)) {
        if (name === TMP_DIR_NAME) continue

        const absPath = path.join(dir, name)
        // $FlowFixMe
        const stat = await fs.statAsync(absPath)
        let relPath = makeRelative(absPath)

        if (stat.isDirectory()) {
          dirsToRead.push(absPath)
          relPath = relPath + '/'
        }

        relPaths.push(relPath)
      }
    }

    return relPaths
  }
}
