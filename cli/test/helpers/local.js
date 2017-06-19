/* @flow */

import Promise from 'bluebird'
import fs from 'fs-extra'
import path from 'path'
import rimraf from 'rimraf'

import { TMP_DIR_NAME } from '../../src/local/constants'
import Local from '../../src/local'

Promise.promisifyAll(fs)
const rimrafAsync = Promise.promisify(rimraf)

export function posixifyPath (localPath: string): string {
  return localPath.split(path.sep).join(path.posix.sep)
}

async function tree (rootPath: string): Promise<string[]> {
  const dirsToRead = [rootPath]
  const relPaths = []
  const makeRelative = (absPath: string) => posixifyPath(absPath.slice(rootPath.length + path.sep.length))

  while (true) {
    const dir = dirsToRead.shift()
    if (dir == null) break

    for (const name of await fs.readdirAsync(dir)) {
      if (name === TMP_DIR_NAME) continue

      const absPath = path.join(dir, name)
      const stat = await fs.statAsync(absPath)
      let relPath = makeRelative(absPath)

      if (stat.isDirectory()) {
        dirsToRead.push(absPath)
        relPath = relPath + path.posix.sep
      }

      relPaths.push(relPath)
    }
  }

  return relPaths.sort()
}

export class LocalTestHelpers {
  local: Local

  constructor (local: Local) {
    this.local = local
  }

  get syncPath (): string {
    return path.normalize(this.local.syncPath)
  }

  get trashPath (): string {
    return path.join(this.local.tmpPath, '.test-trash')
  }

  async clean () {
    for (const pattern of ['*', '.*']) {
      await rimrafAsync(path.join(this.syncPath, pattern))
    }
  }

  async trashFunc (paths: string[]): Promise<void> {
    for (const src of paths) {
      const dst = path.join(this.trashPath, path.basename(src))
      await fs.renameAsync(src, dst)
    }
  }

  async setupTrash () {
    await fs.emptyDir(this.trashPath)
    this.local._trash = this.trashFunc
  }

  async tree (): Promise<string[]> {
    return (await tree(this.trashPath))
      .map(relPath => path.posix.join('/Trash', relPath))
      .concat(await tree(this.syncPath))
  }
}
