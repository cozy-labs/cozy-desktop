import EventEmitter from 'events'
import pick from 'lodash.pick'
import {
  after,
  afterEach,
  before,
  beforeEach,
  suite,
  test
} from 'mocha'
import should from 'should'
import sinon from 'sinon'

import Ignore from '../../../src/ignore'
import Local from '../../../src/local'
import Merge from '../../../src/merge'
import Prep from '../../../src/prep'
import Remote from '../../../src/remote'
import Sync from '../../../src/sync'

import configHelpers from '../../helpers/config'
import * as cozyHelpers from '../../helpers/cozy'
import pouchHelpers from '../../helpers/pouch'

suite('Trash', () => {
  if (process.env.APPVEYOR) {
    test('is unstable on AppVeyor')
    return
  }

  let config, cozy, events, ignore, local, merge, pouch, prep, remote, sync

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(function () {
    config = this.config
    pouch = this.pouch
    merge = new Merge(pouch)
    ignore = new Ignore([])
    prep = new Prep(merge, ignore, config)
    events = new EventEmitter()
    local = new Local(config, prep, pouch, events)
    remote = new Remote(config, prep, pouch, events)
    sync = new Sync(pouch, local, remote, ignore, events)
    sync.stopped = false
    cozy = remote.remoteCozy
    cozy.client = cozyHelpers.cozy
  })

  const syncAll = async () => {
    const seq = await pouch.getLocalSeqAsync()
    const changes = await pouch.db.changes({
      since: seq,
      include_docs: true,
      filter: '_view',
      view: 'byPath'
    })
    for (let change of changes.results) {
      await sync.apply(change)
    }
  }

  test('local dir', async () => {
    const parent = await cozy.client.files.createDirectory({name: 'parent'})
    const dir = await cozy.client.files.createDirectory({name: 'dir', dirID: parent._id})
    const child = await cozy.client.files.createDirectory({name: 'child', dirID: dir._id})
    await remote.watcher.pullOne(parent._id)
    await remote.watcher.pullOne(dir._id)
    await remote.watcher.pullOne(child._id)
    await syncAll()
    sinon.spy(pouch, 'put')

    const promise = prep.trashFolderAsync('local', {path: 'parent/dir'})

    await should(promise).be.rejectedWith({status: 409, name: 'conflict'})
    const putDocs = pouch.put.args.map(args => {
      const doc = args[0]
      return pick(doc, ['path', '_deleted', 'trashed'])
    })
    should(putDocs).deepEqual([
      {path: 'parent/dir/child', _deleted: true},
      {path: 'parent/dir', _deleted: true},
      {path: 'parent/dir', trashed: true}
    ])
    await should(pouch.db.get(dir._id)).be.rejectedWith({status: 404})
    await should(pouch.db.get(child._id)).be.rejectedWith({status: 404})

    await syncAll()

    await should(cozy.client.files.statById(child._id)).be.fulfilled()
    should(await cozy.client.files.statById(dir._id))
      .have.propertyByPath('attributes', 'path').eql('/.cozy_trash/dir')
    should(await cozy.client.files.statById(child._id))
      .have.propertyByPath('attributes', 'path').eql('/.cozy_trash/dir/child')
  })
})
