/* @flow */

import Promise from 'bluebird'
import fs from 'fs-extra'
import path from 'path'
import rimraf from 'rimraf'

import * as conflictHelpers from './conflict'
import { SyncDirTestHelpers } from './sync_dir'

import { TMP_DIR_NAME } from '../../src/local/constants'
import Local from '../../src/local'

import type { ChokidarFSEvent } from '../../src/local/chokidar_event'

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

  return relPaths.sort((a, b) => a.localeCompare(b))
}

export class LocalTestHelpers {
  local: Local
  syncDir: SyncDirTestHelpers

  constructor (local: Local) {
    this.local = local
    this.syncDir = new SyncDirTestHelpers(local.syncPath)
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
      try {
        await fs.renameAsync(src, dst)
      } catch (err) {
        throw err
      }
    }
  }

  async setupTrash () {
    await fs.emptyDir(this.trashPath)
    this.local._trash = this.trashFunc
  }

  async tree (): Promise<string[]> {
    let trashContents
    try {
      trashContents = await tree(this.trashPath)
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
      throw new Error(
        'You must call and await helpers.local.setupTrash() (e.g. in a ' +
        'beforeEach block) before calling helpers.local.tree() in a test'
      )
    }
    return trashContents
      .map(relPath => path.posix.join('/Trash', relPath))
      .concat(await tree(this.syncPath))
      .map(conflictHelpers.ellipsizeDate)
  }

  async treeWithoutTrash () {
    return (await this.tree())
      .filter(p => !p.startsWith('/Trash/'))
  }

  async simulateEvents (events: ChokidarFSEvent[]) {
    return this.local.watcher.onFlush(events)
  }
}
