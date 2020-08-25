/* @flow */
/* eslint-env mocha */

const path = require('path')
const should = require('should')

const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const TestHelpers = require('../support/helpers')

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

  beforeEach(async function() {
    helpers = TestHelpers.init(this)
    helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()

    parent = await cozy.files.createDirectory({ name: 'parent' })
    await helpers.remote.pullChanges()
    await helpers.syncAll()

    helpers.spyPouch()
  })

  describe('file', () => {
    describe('local', () => {
      const filename = 'Texte.txt'
      context('when file is completely empty', () => {
        it('creates an empty file on the remote Cozy', async () => {
          await helpers.local.syncDir.touchFile(filename)

          await helpers.flushLocalAndSyncAll()
          await helpers.pullAndSyncAll()

          should(await helpers.trees()).deepEqual({
            local: [filename, 'parent/'],
            remote: [filename, 'parent/']
          })
          should(await helpers.local.readFile(filename)).eql('')
          should(await helpers.remote.readFile(filename)).eql('')
        })
      })

      context('when file has content', () => {
        it('uploads the file with its local content', async () => {
          const filecontent = 'My local content'
          await helpers.local.syncDir.outputFile(filename, filecontent)

          await helpers.flushLocalAndSyncAll()
          await helpers.pullAndSyncAll()

          should(await helpers.trees()).deepEqual({
            local: [filename, 'parent/'],
            remote: [filename, 'parent/']
          })
          should(await helpers.local.readFile(filename)).eql(filecontent)
          should(await helpers.remote.readFile(filename)).eql(filecontent)
        })
      })
    })

    describe('remote', () => {
      it('downloads the new file', async () => {
        await cozy.files.create('foo', { name: 'file', dirID: parent._id })
        await helpers.remote.pullChanges()

        should(
          helpers.putDocs('path', '_deleted', 'trashed', 'sides')
        ).deepEqual([
          {
            path: path.normalize('parent/file'),
            sides: { target: 1, remote: 1 }
          }
        ])

        await helpers.syncAll()

        should(await helpers.local.tree()).deepEqual(['parent/', 'parent/file'])
      })
    })
  })

  describe('dir', () => {
    it('local')

    it('remote', async () => {
      const dir = await cozy.files.createDirectory({
        name: 'dir',
        dirID: parent._id
      })
      const subdir = await cozy.files.createDirectory({
        name: 'subdir',
        dirID: dir._id
      })
      await cozy.files.createDirectory({ name: 'empty-subdir', dirID: dir._id })
      await cozy.files.create('foo', { name: 'file', dirID: subdir._id })
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
