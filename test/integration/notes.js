/* @flow */
/* eslint-env mocha */

const should = require('should')
const path = require('path')

const Builders = require('../support/builders')
const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')

const { TRASH_DIR_ID } = require('../../core/remote/constants')

describe('Note update', () => {
  let builders, helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function() {
    builders = new Builders({ cozy: cozyHelpers.cozy })
    helpers = TestHelpers.init(this)

    await helpers.local.clean()
    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  let note
  beforeEach('create note', async () => {
    note = await builders
      .remoteNote()
      .name('note.cozy-note')
      .data('Initial content')
      .timestamp(2018, 5, 15, 21, 1, 53)
      .create()
    await helpers.pullAndSyncAll()
  })

  describe('on remote Cozy', () => {
    beforeEach('update remote note', async () => {
      await builders
        .remoteNote(note)
        .data('updated content')
        .update()
      await helpers.pullAndSyncAll()
    })

    it('updates the note content on the filesystem', async () => {
      should(await helpers.local.syncDir.readFile('note.cozy-note')).eql(
        'note\n\nupdated content'
      )
    })
  })

  describe('on local filesystem', () => {
    beforeEach('update local note', async () => {
      await helpers.local.syncDir.chmod('note.cozy-note', 0o777)
      await helpers.local.syncDir.outputFile(
        'note.cozy-note',
        'updated content'
      )
      await helpers.flushLocalAndSyncAll()
    })

    it('renames the original remote note with a conflict suffix', async () => {
      const updatedRemote = await helpers.remote.byIdMaybe(note._id)
      should(updatedRemote)
        .have.property('name')
        .match(/-conflict-/)
      should(updatedRemote).have.properties({
        md5sum: note.md5sum,
        dir_id: note.dir_id
      })
    })

    it('uploads the new content to the Cozy', async () => {
      should(await helpers.remote.readFile('note.cozy-note')).eql(
        'updated content'
      )
    })
  })
})

describe('Note move with update', () => {
  let builders, helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)

  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function() {
    builders = new Builders({ cozy: cozyHelpers.cozy })
    helpers = TestHelpers.init(this)

    await helpers.local.clean()
    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  let dst, note
  beforeEach('create note', async () => {
    dst = await builders
      .remoteDir()
      .name('dst')
      .create()
    note = await builders
      .remoteNote()
      .name('note.cozy-note')
      .data('Initial content')
      .timestamp(2018, 5, 15, 21, 1, 53)
      .create()
    await helpers.pullAndSyncAll()
  })

  context('on local filesystem', () => {
    const srcPath = 'note.cozy-note'
    const dstPath = path.normalize('dst/note.cozy-note')

    beforeEach('move and update local note', async () => {
      await helpers.local.syncDir.move(srcPath, dstPath)
      await helpers.local.syncDir.chmod(dstPath, 0o777)
      await helpers.local.syncDir.outputFile(dstPath, 'updated content')
      await helpers.flushLocalAndSyncAll()
    })

    it('moves the original remote note then rename it with a conflict suffix', async () => {
      const updatedRemote = await helpers.remote.byIdMaybe(note._id)
      should(updatedRemote)
        .have.property('name')
        .match(/-conflict-/)
      should(updatedRemote).have.properties({
        md5sum: note.md5sum,
        dir_id: dst._id
      })
    })

    it('uploads the new content to the Cozy at the target location', async () => {
      should(await helpers.remote.readFile('dst/note.cozy-note')).eql(
        'updated content'
      )
    })
  })

  describe('overwriting existing note at target location', () => {
    const srcPath = 'note.cozy-note'
    const dstPath = path.normalize('dst/note.cozy-note')

    let existing
    beforeEach('create note at target location', async () => {
      existing = await builders
        .remoteNote()
        .inDir(dst)
        .name('note.cozy-note')
        .data('overwritten content')
        .timestamp(2018, 5, 15, 21, 1, 53)
        .create()
      await helpers.pullAndSyncAll()
    })
    beforeEach('move and update local note', async () => {
      await helpers.local.syncDir.chmod(dstPath, 0o777)
      await helpers.local.syncDir.move(srcPath, dstPath, { overwrite: true })
      await helpers.local.syncDir.chmod(dstPath, 0o777)
      await helpers.local.syncDir.outputFile(dstPath, 'updated content')
      await helpers.flushLocalAndSyncAll()
    })

    context('on local filesystem', () => {
      it('moves the original remote note then rename it with a conflict suffix', async () => {
        const updatedRemote = await helpers.remote.byIdMaybe(note._id)
        should(updatedRemote)
          .have.property('name')
          .match(/-conflict-/)
        should(updatedRemote).have.properties({
          md5sum: note.md5sum,
          dir_id: dst._id
        })
      })

      it('uploads the new content to the Cozy at the target location', async () => {
        should(await helpers.remote.readFile('dst/note.cozy-note')).eql(
          'updated content'
        )
      })

      it('sends the overwritten note to the trash', async () => {
        should(await helpers.remote.byIdMaybe(existing._id)).have.properties({
          md5sum: existing.md5sum,
          name: existing.name,
          dir_id: TRASH_DIR_ID,
          trashed: true
        })
      })
    })
  })
})
