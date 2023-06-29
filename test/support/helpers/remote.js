/* @flow */

const path = require('path')

const autoBind = require('auto-bind')
const _ = require('lodash')

const Builders = require('../builders')
const conflictHelpers = require('./conflict')
const cozyHelpers = require('./cozy')
const { Remote, dirAndName } = require('../../../core/remote')
const {
  DIR_TYPE,
  FILES_DOCTYPE,
  ROOT_DIR_ID,
  TRASH_DIR_NAME
} = require('../../../core/remote/constants')

/*::
import type { Client as OldCozyClient } from 'cozy-client-js'
import type { CozyClient } from 'cozy-client'
import type { Pouch } from '../../../core/pouch'
import type { RemoteOptions } from '../../../core/remote'
import type { FullRemoteFile, RemoteDir, RemoteDoc } from '../../../core/remote/document'
import type { Metadata, MetadataRemoteInfo } from '../../../core/metadata'

export type RemoteTree = { [string]: FullRemoteFile|RemoteDir }
*/

class RemoteTestHelpers {
  /*::
  side: Remote
  builders: ?Builders
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

  async getClient() /*: CozyClient */ {
    return this.side.remoteCozy.getClient()
  }

  async getBuilders() /*: Promise<Builders> */ {
    if (this.builders != null) return this.builders

    const client = await this.side.remoteCozy.getClient()
    this.builders = new Builders({ client })
    return this.builders
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
    dirId /*: string */ = ROOT_DIR_ID
  ) /*: Promise<RemoteDir> */ {
    return this.side.remoteCozy.createDirectory({
      name,
      dirId,
      lastModifiedDate: new Date().toISOString()
    })
  }

  async createFile(
    name /*: string */,
    dirId /*: string */ = ROOT_DIR_ID,
    content /*: string */ = 'whatever'
  ) /*: Promise<FullRemoteFile> */ {
    const builders = await this.getBuilders()

    return this.side.remoteCozy.createFile(
      builders
        .stream()
        .push(content)
        .build(),
      {
        name,
        dirId,
        contentType: 'application/octet-stream',
        contentLength: content.length,
        checksum: builders.checksum(content).build(),
        lastModifiedDate: new Date().toISOString(),
        executable: false
      }
    )
  }

  async createTree(paths /*: Array<string> */) /*: Promise<RemoteTree> */ {
    const remoteDocsByPath = {}
    for (const p of paths) {
      const name = path.posix.basename(p)
      const parentPath = path.posix.dirname(p)
      const dirID = (
        remoteDocsByPath[parentPath + '/'] ||
        (await this.findByPath('/' + parentPath + '/')) ||
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

      let dir, content
      try {
        const client = await this.getClient()
        const { data, included } = await client
          .collection(FILES_DOCTYPE)
          .statByPath(dirPath)
        dir = await this.side.remoteCozy.toRemoteDoc(data)
        content = included
      } catch (err) {
        if (err.status !== 404) throw err
        dir = {
          // $FlowFixMe
          relations: () => [{ id: '<BROKEN>', type: '<BROKEN>' }]
        }
        content = [{ '<BROKEN>': { name: '<BROKEN>' } }]
      }
      for (const { id } of dir.relations('contents')) {
        const { name, type } = _.find(content, ({ _id }) => _id === id)
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

  async readFile(remotePath /*: string */) {
    if (!remotePath.startsWith('/')) remotePath = '/' + remotePath
    const client = await this.getClient()
    const file = await this.findByPath(remotePath)
    const resp = await client
      .collection(FILES_DOCTYPE)
      .fetchFileContentById(file._id)
    return resp.text()
  }

  async byId(id /*: string */) /*: Promise<FullRemoteFile|RemoteDir> */ {
    return this.side.remoteCozy.find(id)
  }

  async byIdMaybe(
    id /*: string */
  ) /*: Promise<?(FullRemoteFile|RemoteDir)> */ {
    return this.side.remoteCozy.findMaybe(id)
  }

  async findByPath(remotePath /*: string */) {
    const client = await this.getClient()
    const { data } = await client
      .collection(FILES_DOCTYPE)
      .statByPath(remotePath)
    return this.side.remoteCozy.toRemoteDoc(data)
  }

  async move(
    { _id, updated_at } /*: MetadataRemoteInfo|FullRemoteFile|RemoteDir */,
    newPath /*: string */
  ) {
    const [newDirPath, newName] /*: [string, string] */ = dirAndName(newPath)
    const newDir /*: RemoteDir */ =
      newDirPath === '/' || newDirPath === '.'
        ? await this.side.remoteCozy.findDir(ROOT_DIR_ID)
        : await this.side.remoteCozy.findDirectoryByPath(`/${newDirPath}`)
    const attrs = {
      name: newName,
      dir_id: newDir._id,
      updated_at
    }
    await this.side.remoteCozy.updateAttributesById(_id, attrs, { ifMatch: '' })
  }

  async updateAttributesById(
    id /*: string */,
    attrs /*: {|name?: string,
               dir_id?: string,
               executable?: boolean,
               updated_at?: string|} */
  ) {
    const client = await this.getClient()
    const { data: updated } = await client
      .collection(FILES_DOCTYPE)
      .updateAttributes(id, attrs, { sanitizeName: false })
    return this.side.remoteCozy.toRemoteDoc(updated)
  }

  async updateAttributesByPath(
    remotePath /*: string */,
    attrs /*: {|name?: string,
               dir_id?: string,
               executable?: boolean,
               updated_at?: string|} */
  ) {
    const { _id } = await this.findByPath(remotePath)
    return this.updateAttributesById(_id, attrs)
  }

  async updateFileById(
    id /*: string */,
    content /*: string */,
    options /*: {|name: string,
                 contentType?: string,
                 contentLength?: number,
                 checksum?: string,
                 executable?: boolean,
                 lastModifiedDate?: string|} */
  ) /*: Promise<FullRemoteFile> */ {
    const client = await this.getClient()
    const { data: updated } = await client.collection(FILES_DOCTYPE).updateFile(
      content,
      {
        ...options,
        fileId: id
      },
      {
        sanitizeName: false
      }
    )
    return this.side.remoteCozy.toRemoteDoc(updated)
  }

  async trashById(_id /*: string */) {
    const client = await this.getClient()
    const { data: trashed } = await client
      .collection(FILES_DOCTYPE)
      .destroy({ _id })
    return this.side.remoteCozy.toRemoteDoc(trashed)
  }

  async restoreById(id /*: string */) {
    const client = await this.getClient()
    const { data: restored } = await client
      .collection(FILES_DOCTYPE)
      .restore(id)
    return this.side.remoteCozy.toRemoteDoc(restored)
  }

  async destroyById(_id /*: string */) {
    const client = await this.getClient()
    await client.collection(FILES_DOCTYPE).deleteFilePermanently(_id)
  }
}

module.exports = {
  RemoteTestHelpers
}
