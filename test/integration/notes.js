/* @flow */
/* eslint-env mocha */

const path = require('path')

const should = require('should')

const { TRASH_DIR_ID } = require('../../core/remote/constants')
const { isNote } = require('../../core/utils/notes')
const timestamp = require('../../core/utils/timestamp')
const Builders = require('../support/builders')
const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')

describe('Update', () => {
  let builders, helpers

  before(configHelpers.createConfig)
  before(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)

  afterEach(() => helpers.clean())
  afterEach(pouchHelpers.cleanDatabase)
  after(configHelpers.cleanConfig)

  beforeEach(async function() {
    builders = new Builders({ cozy: cozyHelpers.cozy, pouch: this.pouch })
    helpers = TestHelpers.init(this)

    await helpers.local.clean()
    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })
  afterEach(async function() {
    await helpers.stop()
  })

  describe('Cozy Note', () => {
    let note
    beforeEach('create note', async () => {
      note = await builders
        .remoteNote()
        .name('note.cozy-note')
        .data('Initial content')
        .createdAt(2018, 5, 15, 21, 1, 53, 0)
        .create()
      await helpers.pullAndSyncAll()
      await helpers.flushLocalAndSyncAll()
    })

    describe('on remote Cozy', () => {
      beforeEach('update remote note', async () => {
        await builders
          .remoteNote(note)
          .data('updated content')
          .updatedAt(...timestamp.spread(new Date()))
          .update()
        await helpers.pullAndSyncAll()
        await helpers.flushLocalAndSyncAll()
      })

      it('updates the note content on the filesystem', async () => {
        should(await helpers.local.syncDir.readFile('note.cozy-note')).eql(
          'note\n\nupdated content'
        )
      })
    })

    describe('on local filesystem', () => {
      beforeEach('update local note', async () => {
        await helpers.local.syncDir.outputFile(
          'note.cozy-note',
          'updated content'
        )
        await helpers.flushLocalAndSyncAll()
        await helpers.pullAndSyncAll()
      })

      it('uploads the new content to the Cozy', async () => {
        should(await helpers.remote.readFile('note.cozy-note')).eql(
          'updated content'
        )
      })
    })
  })

  describe('Cozy Note move', () => {
    let note
    beforeEach('create note', async () => {
      await builders
        .remoteDir()
        .name('dst')
        .create()
      note = await builders
        .remoteNote()
        .name('note.cozy-note')
        .data('Initial content')
        .createdAt(2018, 5, 15, 21, 1, 53, 0)
        .create()
      await helpers.pullAndSyncAll()
    })

    describe('on local filesystem', () => {
      const srcPath = 'note.cozy-note'
      const dstPath = path.normalize('dst/note.cozy-note')

      describe('to a free target location', () => {
        beforeEach('move local note', async () => {
          await helpers.local.syncDir.move(srcPath, dstPath)
          await helpers.flushLocalAndSyncAll()
          await helpers.pullAndSyncAll()
        })

        it('keeps the note metadata', async () => {
          const updatedDoc = await helpers.pouch.byRemoteIdMaybe(note._id)
          should(updatedDoc).have.property('metadata')
        })
      })
    })

    describe('on remote Cozy', () => {
      const dstPath = path.normalize('dst/note.cozy-note')

      describe('to a free target location', () => {
        beforeEach('move local note', async () => {
          await helpers.remote.move(note, dstPath)
          await helpers.pullAndSyncAll()
          await helpers.flushLocalAndSyncAll()
        })

        it('keeps the note metadata', async () => {
          const updatedDoc = await helpers.pouch.byRemoteIdMaybe(note._id)
          should(updatedDoc).have.property('metadata')
        })
      })
    })
  })

  describe('Cozy Note move with update', () => {
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
        .createdAt(2018, 5, 15, 21, 1, 53, 0)
        .create()
      await helpers.pullAndSyncAll()
    })

    describe('on local filesystem', () => {
      const srcPath = 'note.cozy-note'
      const dstPath = path.normalize('dst/note.cozy-note')

      describe('to a free target location', () => {
        beforeEach('move and update local note', async () => {
          await helpers.local.syncDir.move(srcPath, dstPath)
          await helpers.local.syncDir.outputFile(dstPath, 'updated content')
          await helpers.flushLocalAndSyncAll()
          await helpers.pullAndSyncAll()
        })

        it('moves the remote note to the destination folder', async () => {
          const updatedRemote = await helpers.remote.byIdMaybe(note._id)
          should(updatedRemote).have.properties({
            name: note.name,
            dir_id: dst._id
          })
          should(isNote(updatedRemote)).be.true()
        })

        it('uploads the new content to the Cozy at the target location', async () => {
          should(await helpers.remote.readFile('dst/note.cozy-note')).eql(
            'updated content'
          )
        })

        it('updates the note metadata', async () => {
          const updatedDoc = await helpers.pouch.byRemoteIdMaybe(note._id)
          should(updatedDoc)
            .have.property('name')
            .equal(note.name)
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
            .createdAt(2018, 5, 15, 21, 1, 53, 0)
            .create()
          await helpers.pullAndSyncAll()
          await helpers.flushLocalAndSyncAll()
        })
        beforeEach('move and update local note', async () => {
          await helpers.local.syncDir.move(srcPath, dstPath, {
            overwrite: true
          })
          await helpers.local.syncDir.outputFile(dstPath, 'updated content')
          await helpers.flushLocalAndSyncAll()
        })

        it('moves the remote note to the destination folder and overwrites the existing note', async () => {
          const updatedRemote = await helpers.remote.byIdMaybe(note._id)
          should(updatedRemote).have.properties({
            name: note.name,
            dir_id: dst._id
          })
          should(updatedRemote)
            .have.property('md5sum')
            .not.equal(note.md5sum)
          should(isNote(updatedRemote)).be.true()
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
})
