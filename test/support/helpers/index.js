/* @flow */

const autoBind = require('auto-bind')
const _ = require('lodash')
const { pick } = _
const sinon = require('sinon')

const { Ignore } = require('../../../core/ignore')
const metadata = require('../../../core/metadata')
const Merge = require('../../../core/merge')
const Prep = require('../../../core/prep')
const Sync = require('../../../core/sync')
const SyncState = require('../../../core/syncstate')

const conflictHelpers = require('./conflict')
const { posixifyPath } = require('./context_dir')
const { LocalTestHelpers } = require('./local')
const { RemoteTestHelpers } = require('./remote')

/*::
import type cozy from 'cozy-client-js'
import type { Config } from '../../../core/config'
import type Local from '../../../core/local'
import type { Metadata } from '../../../core/metadata'
import type Pouch from '../../../core/pouch'
import type { Remote } from '../../../core/remote'

export type TestHelpersOptions = {
  config: Config,
  pouch: Pouch
}
*/

class TestHelpers {
  /*::
  local: LocalTestHelpers
  remote: RemoteTestHelpers
  pouch: Pouch
  prep: Prep
  events: SyncState

  _sync: Sync
  _local: Local
  _remote: Remote
  */

  constructor({ config, pouch } /*: TestHelpersOptions */) {
    const merge = new Merge(pouch)
    const ignore = new Ignore([]).addDefaultRules()
    const prep = new Prep(merge, ignore, config)
    const events = new SyncState()
    const localHelpers = new LocalTestHelpers({
      config,
      prep,
      pouch,
      events,
      ignore
    })
    const remoteHelpers = new RemoteTestHelpers({ config, prep, pouch, events })
    const local = localHelpers.side
    const remote = remoteHelpers.side
    const sync = new Sync(pouch, local, remote, ignore, events)

    this.prep = prep
    this.events = events
    this._local = merge.local = local
    this._remote = merge.remote = remote
    this._sync = sync
    this._sync.stopped = false
    this._sync.diskUsage = this._remote.diskUsage
    this.pouch = pouch
    this.local = localHelpers
    this.remote = remoteHelpers

    autoBind(this)
  }

  async syncAll() {
    await this._sync.sync(false)
  }

  async pullAndSyncAll() {
    await this.remote.pullChanges()
    await this.syncAll()
  }

  async flushLocalAndSyncAll() {
    await this.local.scan()
    await this.syncAll()
  }

  // TODO: Spy by default?
  spyPrep() {
    const prepCalls = []

    for (let method of [
      'addFileAsync',
      'putFolderAsync',
      'updateFileAsync',
      'moveFileAsync',
      'moveFolderAsync',
      'deleteFolderAsync',
      'trashFileAsync',
      'trashFolderAsync',
      'restoreFileAsync',
      'restoreFolderAsync'
    ]) {
      // $FlowFixMe
      const origMethod = this.prep[method]
      sinon.stub(this.prep, method).callsFake(async (...args) => {
        const call /*: Object */ = { method }
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

  spyPouch() {
    sinon.spy(this.pouch, 'put')
    sinon.spy(this.pouch, 'bulkDocs')
  }

  putDocs(...props /*: string[] */) {
    const results = []

    for (const args of this.pouch.bulkDocs.args) {
      for (const doc of args[0]) {
        results.push(pick(doc, props))
      }
    }

    for (const args of this.pouch.put.args) {
      const doc = args[0]
      results.push(pick(doc, props))
    }

    return results
  }

  async trees(
    ...treeNames /*: Array<'local' | 'metadata' | 'remote'> */
  ) /*: Promise<*> */ {
    const result = await this.treesNonEllipsized(...treeNames)

    for (const treeName of ['local', 'metadata', 'remote']) {
      if (result[treeName]) {
        result[treeName] = result[treeName].map(conflictHelpers.ellipsizeDate)
      }
    }

    return result
  }

  async treesNonEllipsized(
    ...treeNames /*: Array<'local' | 'metadata' | 'remote'> */
  ) /*: Promise<*> */ {
    if (treeNames.length === 0) treeNames = ['local', 'remote']

    const result = {}
    if (treeNames.includes('local'))
      result.local = await this.local.tree({ ellipsize: false })
    if (treeNames.includes('metadata'))
      result.metadata = await this.metadataTree()
    if (treeNames.includes('remote'))
      result.remote = await this.remote.treeWithoutTrash({ ellipsize: false })

    return result
  }

  async metadataTree() {
    return _.chain(await this.pouch.byRecursivePathAsync(''))
      .map(
        ({ docType, path }) =>
          posixifyPath(path) + (docType === 'folder' ? '/' : '')
      )
      .sort()
      .value()
  }

  async incompatibleTree() {
    return _.chain(await this.pouch.byRecursivePathAsync(''))
      .filter(doc => doc.incompatibilities)
      .map(
        ({ docType, path }) =>
          posixifyPath(path) + (docType === 'folder' ? '/' : '')
      )
      .uniq()
      .sort()
      .value()
  }

  async docByPath(relpath /*: string */) /*: Promise<Metadata> */ {
    const doc = await this.pouch.db.get(metadata.id(relpath))
    if (doc) return doc
    else throw new Error(`No doc with path ${JSON.stringify(relpath)}`)
  }
}

const init /*: (TestHelpersOptions) => TestHelpers */ = opts =>
  new TestHelpers(opts)

module.exports = {
  init
}
