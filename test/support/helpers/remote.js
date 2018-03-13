/* @flow */

import type { RemoteDoc } from '../../../core/remote/document'

const cozy = require('cozy-client-js')
const _ = require('lodash')
const path = require('path')

const conflictHelpers = require('./conflict')

const Pouch = require('../../../core/pouch')
const Remote = require('../../../core/remote')
const { TRASH_DIR_NAME } = require('../../../core/remote/constants')

class RemoteTestHelpers {
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

  async createTree (paths: Array<string>): Promise<{ [string]: RemoteDoc}> {
    const docsByPath = {}
    for (const p of paths) {
      const name = path.posix.basename(p)
      const parentPath = path.posix.dirname(p)
      const dirID = (docsByPath[parentPath + '/'] || {})._id
      if (p.endsWith('/')) {
        docsByPath[p] = await this.cozy.files.createDirectory(
          {name, dirID, lastModifiedDate: new Date()})
      } else {
        docsByPath[p] = await this.cozy.files.create(`Content of file ${p}`,
          {name, dirID, lastModifiedDate: new Date()})
      }
    }

    return docsByPath
  }

  // TODO: Extract reusable #scan() method from tree*()

  async tree () {
    const pathsToScan = ['/', `/${TRASH_DIR_NAME}`]
    const relPaths = [`${TRASH_DIR_NAME}/`]

    while (true) {
      const dirPath = pathsToScan.shift()
      if (dirPath == null) break

      let dir
      try {
        dir = await this.cozy.files.statByPath(dirPath)
      } catch (err) {
        if (err.status !== 404) throw err
        // $FlowFixMe
        dir = {relations: () => [{attributes: {name: '<BROKEN>', type: '<BROKEN>'}}]}
      }
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

    return relPaths
      .sort()
      .map(conflictHelpers.ellipsizeDate)
  }

  async treeWithoutTrash () {
    return (await this.tree())
      .filter(p => !p.startsWith(`${TRASH_DIR_NAME}/`))
  }

  async trash () {
    const TRASH_REGEXP = new RegExp(`^${TRASH_DIR_NAME}/(.+)$`)
    return _.chain(await this.tree())
      .map(p => _.nth(p.match(TRASH_REGEXP), 1))
      .compact()
      .value()
  }

  async simulateChanges (docs: *) {
    await this.remote.watcher.pullMany(docs)
  }
}

module.exports = {
  RemoteTestHelpers
}
