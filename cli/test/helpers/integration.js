/* @flow */

import cozy from 'cozy-client-js'
import EventEmitter from 'events'
import pick from 'lodash.pick'
import sinon from 'sinon'

import Config from '../../src/config'
import Ignore from '../../src/ignore'
import Local from '../../src/local'
import Merge from '../../src/merge'
import Pouch from '../../src/pouch'
import Prep from '../../src/prep'
import Remote from '../../src/remote'
import Sync from '../../src/sync'

import { LocalTestHelpers } from './local'
import { RemoteTestHelpers } from './remote'

export class IntegrationTestHelpers {
  local: LocalTestHelpers
  remote: RemoteTestHelpers
  prep: Prep

  _pouch: Pouch
  _sync: Sync
  _local: Local
  _remote: Remote

  constructor (config: Config, pouch: Pouch, cozyClient: cozy.Client) {
    const merge = new Merge(pouch)
    const ignore = new Ignore([])
    this.prep = new Prep(merge, ignore, config)
    const events = new EventEmitter()
    this._local = merge.local = new Local(config, this.prep, pouch, events)
    this._remote = merge.remote = new Remote(config, this.prep, pouch, events)
    this._remote.remoteCozy.client = cozyClient
    this._sync = new Sync(pouch, this._local, this._remote, ignore, events)
    this._sync.stopped = false
    this._pouch = pouch
    this.local = new LocalTestHelpers(this._local)
    this.remote = new RemoteTestHelpers(this._remote)
  }

  async syncAll () {
    const seq = await this._pouch.getLocalSeqAsync()
    const changes = await this._pouch.db.changes({
      since: seq,
      include_docs: true,
      filter: '_view',
      view: 'byPath'
    })

    for (let change of changes.results) {
      await this._sync.apply(change)
    }
  }

  spyPouch () {
    sinon.spy(this._pouch, 'put')
    sinon.spy(this._pouch, 'bulkDocs')
  }

  putDocs (...props: string[]) {
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
}
