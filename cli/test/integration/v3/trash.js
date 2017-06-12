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

import MetadataBuilders from '../../builders/metadata'
import configHelpers from '../../helpers/config'
import * as cozyHelpers from '../../helpers/cozy'
import pouchHelpers from '../../helpers/pouch'

suite('Trash', () => {
  if (process.env.APPVEYOR) {
    test('is unstable on AppVeyor')
    return
  }

  let builders, config, cozy, events, ignore, local, merge, pouch, prep, remote, sync

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(function () {
    config = this.config
    pouch = this.pouch
    builders = new MetadataBuilders(pouch)
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

  test('local dir', async () => {
    const dir = await builders.dirMetadata().path('parent/dir').create()
    const child = await builders.dirMetadata().path('parent/dir/child').create()
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
  })
})
