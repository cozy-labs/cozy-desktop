/* @flow */

const autoBind = require('auto-bind')
const _ = require('lodash')
const { pick } = _
const sinon = require('sinon')

const { Ignore } = require('../../../core/ignore')
const Local = require('../../../core/local')
const metadata = require('../../../core/metadata')
const Merge = require('../../../core/merge')
const Prep = require('../../../core/prep')
const Remote = require('../../../core/remote')
const Sync = require('../../../core/sync')
const SyncState = require('../../../core/syncstate')

const { posixifyPath } = require('./context_dir')
const { LocalTestHelpers } = require('./local')
const { RemoteTestHelpers } = require('./remote')

/*::
import type cozy from 'cozy-client-js'
import type Config from '../../../core/config'
import type { Metadata } from '../../../core/metadata'
import type Pouch from '../../../core/pouch'
*/

class IntegrationTestHelpers {
  /*::
  local: LocalTestHelpers
  remote: RemoteTestHelpers
  prep: Prep
  events: SyncState

  _pouch: Pouch
  _sync: Sync
  _local: Local
  _remote: Remote
  */

  constructor (config /*: Config */, pouch /*: Pouch */, cozyClient /*: cozy.Client */) {
    const merge = new Merge(pouch)
    const ignore = new Ignore([])
    this.prep = new Prep(merge, ignore, config)
    this.events = new SyncState()
    this._local = merge.local = new Local(config, this.prep, pouch, this.events)
    this._remote = merge.remote = new Remote(config, this.prep, pouch, this.events)
    this._remote.remoteCozy.client = cozyClient
    this._sync = new Sync(pouch, this._local, this._remote, ignore, this.events)
    this._sync.stopped = false
    this._sync.diskUsage = this._remote.diskUsage
    this._pouch = pouch
    this.local = new LocalTestHelpers(this._local)
    this.remote = new RemoteTestHelpers(this._remote)

    autoBind(this)
  }

  async syncAll () {
    await this._sync.sync(false)
  }

  async pullAndSyncAll () {
    await this.remote.pullChanges()
    await this.syncAll()
  }

  async flushLocalAndSyncAll () {
    await this.local.scan()
    await this.syncAll()
  }

  // TODO: Spy by default?
  spyPrep () {
    const prepCalls = []

    for (let method of ['addFileAsync', 'putFolderAsync', 'updateFileAsync',
      'moveFileAsync', 'moveFolderAsync', 'deleteFolderAsync', 'trashFileAsync',
      'trashFolderAsync', 'restoreFileAsync', 'restoreFolderAsync']) {
      // $FlowFixMe
      const origMethod = this.prep[method]
      sinon.stub(this.prep, method).callsFake(async (...args) => {
        const call /*: Object */ = {method}
        if (method.startsWith('move') || method.startsWith('restore')) {
          call.dst = args[1].path
          call.src = args[2].path
        } else {
          call.path = args[1].path
        }
        prepCalls.push(call)

        // Call the actual method so we can make assertions on metadata & FS
        return origMethod.apply(this.prep, args)
      })
    }

    return prepCalls
  }

  spyPouch () {
    sinon.spy(this._pouch, 'put')
    sinon.spy(this._pouch, 'bulkDocs')
  }

  putDocs (...props /*: string[] */) {
    const results = []

    for (const args of this._pouch.bulkDocs.args) {
      for (const doc of args[0]) {
        results.push(pick(doc, props))
      }
    }

    for (const args of this._pouch.put.args) {
      const doc = args[0]
      results.push(pick(doc, props))
    }

    return results
  }

  async trees (...treeNames /*: Array<'local' | 'metadata' | 'remote'> */) /*: Promise<*> */ {
    if (treeNames.length === 0) treeNames = ['local', 'remote']

    const result = {}
    if (treeNames.includes('local')) result.local = await this.local.tree()
    if (treeNames.includes('metadata')) result.metadata = (await this.metadataTree())
    if (treeNames.includes('remote')) result.remote = await this.remote.treeWithoutTrash()

    return result
  }

  async metadataTree () {
    return _.chain(await this._pouch.byRecursivePathAsync(''))
      .map(({docType, path}) => posixifyPath(path) + (docType === 'folder' ? '/' : ''))
      .sort()
      .value()
  }

  async incompatibleTree () {
    return _.chain(await this._pouch.byRecursivePathAsync(''))
      .filter(doc => doc.incompatibilities)
      .map(({docType, path}) => posixifyPath(path) + (docType === 'folder' ? '/' : ''))
      .uniq()
      .sort()
      .value()
  }

  async docByPath (relpath /*: string */) /*: Promise<Metadata> */ {
    const doc = await this._pouch.db.get(metadata.id(relpath))
    if (doc) return doc
    else throw new Error(`No doc with path ${JSON.stringify(relpath)}`)
  }
}

module.exports = {
  IntegrationTestHelpers
}
