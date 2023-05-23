/* @flow */

const autoBind = require('auto-bind')
const _ = require('lodash')
const path = require('path')

const conflictHelpers = require('./conflict')
const cozyHelpers = require('./cozy')

const { Remote, dirAndName } = require('../../../core/remote')
const {
  DIR_TYPE,
  ROOT_DIR_ID,
  TRASH_DIR_NAME
} = require('../../../core/remote/constants')

/*::
import type { Client as OldCozyClient } from 'cozy-client-js'
import type { Pouch } from '../../../core/pouch'
import type { RemoteOptions } from '../../../core/remote'
import type { FullRemoteFile, RemoteDir, RemoteDoc } from '../../../core/remote/document'
import type { Metadata, MetadataRemoteInfo } from '../../../core/metadata'

export type RemoteTree = { [string]: FullRemoteFile|RemoteDir }
*/

class RemoteTestHelpers {
  /*::
  side: Remote
  */

  constructor(
    opts /*: RemoteOptions */,
    { cozy } /*: { cozy: ?OldCozyClient } */ = {}
  ) {
    this.side = new Remote(opts)
    this.side.remoteCozy.client = cozy || cozyHelpers.cozy
    autoBind(this)
  }

  get cozy() /*: OldCozyClient */ {
    return this.side.remoteCozy.client
  }

  get pouch() /*: Pouch */ {
    return this.side.pouch
  }

  async ignorePreviousChanges() {
    const last_seq = await this.side.remoteCozy.fetchLastSeq()
    await this.pouch.setRemoteSeq(last_seq)
  }

  async pullChanges() {
    this.side.watcher.running = true
    await this.side.watcher.requestRun()
    this.side.watcher.running = false
  }

  async createDirectory(
    name /*: string */,
    dirID /*: string */ = ROOT_DIR_ID
  ) /*: Promise<RemoteDir> */ {
    return this.cozy.files
      .createDirectory({
        name,
        dirID,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .then(this.side.remoteCozy.toRemoteDoc)
  }

  async createFile(
    name /*: string */,
    dirID /*: string */ = ROOT_DIR_ID,
    content /*: string */ = 'whatever'
  ) /*: Promise<FullRemoteFile> */ {
    return this.cozy.files
      .create(content, {
        name,
        dirID,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .then(this.side.remoteCozy.toRemoteDoc)
  }

  async createTree(paths /*: Array<string> */) /*: Promise<RemoteTree> */ {
    const remoteDocsByPath = {}
    for (const p of paths) {
      const name = path.posix.basename(p)
      const parentPath = path.posix.dirname(p)
      const dirID = (
        remoteDocsByPath[parentPath + '/'] ||
        (await this.cozy.files
          .statByPath('/' + parentPath + '/')
          .then(this.side.remoteCozy.toRemoteDoc)) ||
        {}
      )._id
      if (p.endsWith('/')) {
        remoteDocsByPath[p] = await this.createDirectory(name, dirID)
      } else {
        remoteDocsByPath[p] = await this.createFile(
          name,
          dirID,
          `Content of file ${p}`
        )
      }
    }

    return remoteDocsByPath
  }

  // TODO: Extract reusable #scan() method from tree*()

  async tree(
    opts /*: {ellipsize: boolean} */ = { ellipsize: true }
  ) /*: Promise<string[]> */ {
    const pathsToScan = ['/', `/${TRASH_DIR_NAME}`]
    const relPaths = [`${TRASH_DIR_NAME}/`]

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const dirPath = pathsToScan.shift()
      if (dirPath == null) break

      let dir
      try {
        dir = await this.cozy.files.statByPath(dirPath)
      } catch (err) {
        if (err.status !== 404) throw err
        dir = {
          // $FlowFixMe
          relations: () => [
            { attributes: { name: '<BROKEN>', type: '<BROKEN>' } }
          ]
        }
      }
      for (const content of dir.relations('contents')) {
        const { name, type } = content.attributes
        const remotePath = path.posix.join(dirPath, name)
        let relPath = remotePath.slice(1)

        if (type === DIR_TYPE) {
          relPath += '/'
          pathsToScan.push(remotePath)
        }

        relPaths.push(relPath)
      }
    }

    const ellipsizeDate = opts.ellipsize
      ? conflictHelpers.ellipsizeDate
      : _.identity
    return (
      relPaths
        .sort()
        // XXX: replace Desktop conflict dates with ...
        .map(ellipsizeDate)
        // XXX: replace random conflit suffix for trashed files with same name
        .map(p => p.replace(/\(\d+\)/, '(...)'))
    )
  }

  async treeWithoutTrash(
    opts /*: {ellipsize: boolean} */ = { ellipsize: true }
  ) /*: Promise<string[]> */ {
    return (await this.tree(opts)).filter(
      p => !p.startsWith(`${TRASH_DIR_NAME}/`)
    )
  }

  async trash() {
    const TRASH_REGEXP = new RegExp(`^${TRASH_DIR_NAME}/(.+)$`)
    return _.chain(await this.tree())
      .map(p => _.nth(p.match(TRASH_REGEXP), 1))
      .compact()
      .map(p => p.replace(/\(__cozy__: \d+\)/, '(__cozy__: ...)'))
      .value()
  }

  async simulateChanges(docs /*: * */) {
    await this.side.watcher.processRemoteChanges(docs, {
      isInitialFetch: false
    })
  }

  async readFile(path /*: string */) {
    if (!path.startsWith('/')) path = '/' + path
    const resp = await this.cozy.files.downloadByPath(path)
    return resp.text()
  }

  async byId(id /*: string */) /*: Promise<FullRemoteFile|RemoteDir> */ {
    const remoteDoc = await this.cozy.files.statById(id)
    return await this.side.remoteCozy.toRemoteDoc(remoteDoc)
  }

  async byIdMaybe(
    id /*: string */
  ) /*: Promise<?(FullRemoteFile|RemoteDir)> */ {
    try {
      return await this.byId(id)
    } catch (err) {
      return null
    }
  }

  async move(
    { _id, updated_at } /*: MetadataRemoteInfo|FullRemoteFile|RemoteDir */,
    newPath /*: string */
  ) {
    const [newDirPath, newName] /*: [string, string] */ = dirAndName(newPath)
    const newDir /*: RemoteDir */ =
      newDirPath === '.'
        ? await this.side.remoteCozy.findDir(ROOT_DIR_ID)
        : await this.side.remoteCozy.findDirectoryByPath(`/${newDirPath}`)
    const attrs = {
      name: newName,
      dir_id: newDir._id,
      updated_at
    }
    await this.side.remoteCozy.updateAttributesById(_id, attrs, { ifMatch: '' })
  }
}

module.exports = {
  RemoteTestHelpers
}
