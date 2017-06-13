import {
  afterEach,
  beforeEach,
  suite,
  test
} from 'mocha'
import pick from 'lodash.pick'
import should from 'should'
import sinon from 'sinon'

import Ignore from '../../../src/ignore'
import Merge from '../../../src/merge'
import Prep from '../../../src/prep'

import MetadataBuilders from '../../builders/metadata'
import configHelpers from '../../helpers/config'
import pouchHelpers from '../../helpers/pouch'

suite('Trash', () => {
  if (process.env.APPVEYOR) {
    test('is unstable on AppVeyor')
    return
  }

  let builders, ignore, merge, pouch, prep

  beforeEach(configHelpers.createConfig)
  beforeEach(pouchHelpers.createDatabase)
  afterEach(pouchHelpers.cleanDatabase)
  afterEach(configHelpers.cleanConfig)

  beforeEach(function () {
    pouch = this.pouch
    builders = new MetadataBuilders(pouch)
    merge = new Merge(pouch)
    ignore = new Ignore([])
    prep = new Prep(merge, ignore)
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
