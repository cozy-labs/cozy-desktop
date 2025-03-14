/* @flow */

const path = require('path')

const autoBind = require('auto-bind')
const _ = require('lodash')

const { Q } = require('cozy-client')

const Builders = require('../builders')
const conflictHelpers = require('./conflict')
const cozyHelpers = require('./cozy')
const { Remote, dirAndName } = require('../../../core/remote')
const {
  DIR_TYPE,
  FILES_DOCTYPE,
  ROOT_DIR_ID,
  TRASH_DIR_ID,
  TRASH_DIR_NAME
} = require('../../../core/remote/constants')

/*::
import type { Client as OldCozyClient } from 'cozy-client-js'
import type { CozyClient } from 'cozy-client'
import type { Pouch } from '../../../core/pouch'
import type { RemoteOptions } from '../../../core/remote'
import type { FullRemoteFile, RemoteDir, RemoteDoc } from '../../../core/remote/document'
import type { Metadata, MetadataRemoteInfo } from '../../../core/metadata'

export type RemoteTree = {
  dirs: { [string]: RemoteDir },
  files: { [string]: FullRemoteFile },
}
*/

class RemoteTestHelpers {
  /*::
  side: Remote
  builders: ?Builders
  rootDir: ?RemoteDir
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

    const client = await this.getClient()
    this.builders = new Builders({ client, pouch: this.pouch })
    return this.builders
  }

  get pouch() /*: Pouch */ {
    return this.side.pouch
  }

  async clean() {
    const client = await this.getClient()

    const queryDef = Q(FILES_DOCTYPE)
      .where({
        dir_id: { $in: [ROOT_DIR_ID, TRASH_DIR_ID] },
        _id: { $ne: TRASH_DIR_ID }
      })
      .select(['_id', 'dir_id', '_deleted'])
      .indexFields(['_id', 'dir_id', '_deleted'])
    const data = await client.queryAll(queryDef)

    try {
      await Promise.all(
        data.map(j => {
          if (j._deleted) return Promise.resolve()

          return client.collection(FILES_DOCTYPE).deleteFilePermanently(j._id)
        })
      )
    } catch (err) {
      if (err.status !== 404) throw err
    }
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

  async getRootDir() {
    if (this.rootDir) return this.rootDir

    this.rootDir = await this.side.remoteCozy.findDir(ROOT_DIR_ID)

    return this.rootDir
  }

  async createDirectory(
    name /*: string */,
    attrs /*: ?{|dirId?: string,
                lastModifiedDate?: string|} */
  ) /*: Promise<RemoteDir> */ {
    const options = {
      name,
      dirId: ROOT_DIR_ID,
      lastModifiedDate: new Date().toISOString(),
      ...attrs
    }

    return this.side.remoteCozy.createDirectory(options)
  }

  async createDirectoryByPath(
    fullpath /*: string */,
    attrs /*: ?{|lastModifiedDate?: string|} */
  ) /*: Promise<RemoteDir> */ {
    if (fullpath === '/') return this.getRootDir()

    const dirname = path.basename(fullpath)
    const ancestorPaths = path.dirname(fullpath).split(path.posix.sep)

    let ancestor = await this.getRootDir()
    for (const dirname of ancestorPaths) {
      if (dirname === '') continue

      try {
        ancestor = await this.byPath(path.posix.join(ancestor.path, dirname))
      } catch (err) {
        if (err.status === 404) {
          ancestor = await this.createDirectory(dirname, {
            dirId: ancestor._id
          })
        } else {
          throw err
        }
      }
    }

    return this.createDirectory(dirname, { ...attrs, dirId: ancestor._id })
  }

  async createFile(
    name /*: string */,
    content /*: string */ = 'whatever',
    attrs /*: ?{|dirId?: string,
                contentType?: string,
                executable?: boolean,
                lastModifiedDate?: string|} */
  ) /*: Promise<FullRemoteFile> */ {
    const builders = await this.getBuilders()

    const options = {
      name,
      dirId: ROOT_DIR_ID,
      contentType: 'application/octet-stream',
      contentLength: content.length,
      checksum: builders.checksum(content).build(),
      lastModifiedDate: new Date().toISOString(),
      executable: false,
      ...attrs
    }

    return this.side.remoteCozy.createFile(
      builders
        .stream()
        .push(content)
        .build(),
      options
    )
  }

  async createFileByPath(
    fullpath /*: string */,
    content /*: string */ = 'whatever',
    attrs /*: ?{|contentType?: string,
                executable?: boolean,
                lastModifiedDate?: string|} */
  ) /*: Promise<FullRemoteFile> */ {
    const filename = path.basename(fullpath)
    const parentPath = path.dirname(fullpath)
    const parent = await this.createDirectoryByPath(parentPath)
    return this.createFile(filename, content, { ...attrs, dirId: parent._id })
  }

  async createTree(paths /*: Array<string> */) /*: Promise<RemoteTree> */ {
    const dirs = {}
    const files = {}
    for (const p of paths) {
      const name = path.posix.basename(p)
      const parentPath = path.posix.dirname(p)
      const dirId = (
        dirs[parentPath + '/'] ||
        (await this.byPath('/' + parentPath + '/')) ||
        {}
      )._id
      if (p.endsWith('/')) {
        dirs[p] = await this.createDirectory(name, { dirId })
      } else {
        files[p] = await this.createFile(name, `Content of file ${p}`, {
          dirId
        })
      }
    }

    return { dirs, files }
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
          relations: (/*:: relation: string */) => [
            { id: '<BROKEN>', type: '<BROKEN>' }
          ]
        }
        content = [{ _id: '<BROKEN>', name: '<BROKEN>', type: '<BROKEN>' }]
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

  async readFile(path /*: string */) {
    if (!path.startsWith('/')) path = '/' + path
    const resp = await this.cozy.files.downloadByPath(path)
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

  async byPath(
    remotePath /*: string */
  ) /*: Promise<FullRemoteFile|RemoteDir> */ {
    return this.side.remoteCozy.findByPath(remotePath)
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
