/* @flow */
/* eslint-env mocha */

const path = require('path')
const should = require('should')

const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const { IntegrationTestHelpers } = require('../support/helpers/integration')

const cozy = cozyHelpers.cozy

describe('Add', () => {
  let helpers, parent

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(() => helpers.local.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function () {
    helpers = new IntegrationTestHelpers(this.config, this.pouch, cozy)
    helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()

    parent = await cozy.files.createDirectory({name: 'parent'})
    await helpers.remote.pullChanges()
    await helpers.syncAll()

    helpers.spyPouch()
  })

  describe('file', () => {
    it('local')

    it('remote', async () => {
      await cozy.files.create('foo', {name: 'file', dirID: parent._id})
      await helpers.remote.pullChanges()

      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        {path: path.normalize('parent/file'), sides: {remote: 1}}
      ])

      await helpers.syncAll()

      should(await helpers.local.tree()).deepEqual([
        'parent/',
        'parent/file'
      ])
    })
  })

  describe('dir', () => {
    it('local')

    it('remote', async () => {
      const dir = await cozy.files.createDirectory({name: 'dir', dirID: parent._id})
      const subdir = await cozy.files.createDirectory({name: 'subdir', dirID: dir._id})
      await cozy.files.createDirectory({name: 'empty-subdir', dirID: dir._id})
      await cozy.files.create('foo', {name: 'file', dirID: subdir._id})
      await helpers.remote.pullChanges()

      /* FIXME: Nondeterministic
      should(helpers.putDocs('path', '_deleted', 'trashed', 'sides')).deepEqual([
        {path: 'parent/dir', sides: {remote: 1}},
        {path: 'parent/dir/empty-subdir', sides: {remote: 1}},
        {path: 'parent/dir/subdir', sides: {remote: 1}},
        {path: 'parent/dir/subdir/file', sides: {remote: 1}}
      ])
      */

      await helpers.syncAll()

      should(await helpers.local.tree()).deepEqual([
        'parent/',
        'parent/dir/',
        'parent/dir/empty-subdir/',
        'parent/dir/subdir/',
        'parent/dir/subdir/file'
      ])
    })
  })
})
