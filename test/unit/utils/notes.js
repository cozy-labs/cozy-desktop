/* @flow */
/* eslint-env mocha */

const os = require('os')
const path = require('path')

const should = require('should')

const { findNote, localDoc, remoteDoc } = require('../../../core/utils/notes')
const Builders = require('../../support/builders')
const configHelpers = require('../../support/helpers/config')
const { LocalTestHelpers } = require('../../support/helpers/local')
const pouchHelpers = require('../../support/helpers/pouch')
const { RemoteTestHelpers } = require('../../support/helpers/remote')

describe('utils/notes', () => {
  describe('localDoc', () => {
    before('instanciate config', configHelpers.createConfig)
    beforeEach('instanciate pouch', pouchHelpers.createDatabase)

    afterEach('clean pouch', pouchHelpers.cleanDatabase)
    after('clean config directory', configHelpers.cleanConfig)

    it('returns the Metadata with the given path', async function() {
      const docPath = 'Notes/Some interesting stuff.cozy-note'
      const filePath = path.join(this.config.syncPath, docPath)

      const builders = new Builders(this)
      const doc = await builders
        .metafile()
        .path(docPath)
        .upToDate()
        .create()

      await should(localDoc(filePath, this)).be.fulfilledWith(doc)
    })

    it('throws a CozyNoteError with code CozyDocumentMissingError if no doc exist with the given path', async function() {
      const docPath = 'Notes/Some interesting stuff.cozy-note'
      const filePath = path.join(this.config.syncPath, docPath)

      await should(localDoc(filePath, this)).be.rejectedWith({
        code: 'CozyDocumentMissingError'
      })
    })

    it('throws a CozyNoteError with code CozyDocumentMissingError if the note is not within the synced folder', async function() {
      const docPath = 'Notes/Some interesting stuff.cozy-note'
      const filePath = path.join(os.tmpdir(), docPath)

      const builders = new Builders(this)
      await builders
        .metafile()
        .path(docPath)
        .upToDate()
        .create()

      await should(localDoc(filePath, this)).be.rejectedWith({
        code: 'CozyDocumentMissingError'
      })
    })
  })

  describe('remoteDoc', () => {
    let builders, remoteHelpers

    before('instanciate config', configHelpers.createConfig)
    before('register cozy client', configHelpers.registerClient)
    beforeEach('instanciate helpers', async function() {
      remoteHelpers = new RemoteTestHelpers(this)
      builders = remoteHelpers.builders
    })

    afterEach('clean remote cozy', () => remoteHelpers.clean())
    after('clean config directory', configHelpers.cleanConfig)

    it('fetches the remote io.cozy.files document associated with the given local doc', async function() {
      const docPath = 'Some interesting stuff.cozy-note'

      const remote = await builders
        .remoteFile()
        .name(docPath)
        .create()
      const doc = await builders
        .metafile()
        .fromRemote(remote)
        .upToDate()
        .build()

      await should(
        remoteDoc(doc, { config: this.config, remote: remoteHelpers.side })
      ).be.fulfilledWith(remote)
    })

    it('throws a CozyNoteError with code CozyDocumentMissingError if no remote doc exist for the given local doc', async function() {
      const docPath = 'Some interesting stuff.cozy-note'

      const doc = await builders
        .metafile()
        .path(docPath)
        .remoteId('3232')
        .upToDate()
        .build()

      await should(
        remoteDoc(doc, { config: this.config, remote: remoteHelpers.side })
      ).be.rejectedWith({ code: 'CozyDocumentMissingError' })
    })

    it('throws a CozyNoteError with code CozyDocumentMissingError if the local doc is not associated with a remote doc', async function() {
      const docPath = 'Some interesting stuff.cozy-note'

      await builders
        .remoteFile()
        .name(docPath)
        .create()
      const doc = await builders
        .metafile()
        .path(docPath)
        .upToDate()
        .build()

      await should(
        remoteDoc(doc, { config: this.config, remote: remoteHelpers.side })
      ).be.rejectedWith({ code: 'CozyDocumentMissingError' })
    })
  })

  describe('findNote', () => {
    let builders, remoteHelpers

    before('instanciate config', configHelpers.createConfig)
    before('register cozy client', configHelpers.registerClient)
    beforeEach('instanciate pouch', pouchHelpers.createDatabase)
    beforeEach('instanciate helpers', async function() {
      remoteHelpers = new RemoteTestHelpers(this)
      builders = remoteHelpers.builders
    })

    afterEach('clean remote cozy', () => remoteHelpers.clean())
    afterEach('clean pouch', pouchHelpers.cleanDatabase)
    after('clean config directory', configHelpers.cleanConfig)

    it('throws an Error when filePath does not correspond to a synced note', async function() {
      const docPath = 'Notes/Some interesting stuff.cozy-note'
      const filePath = path.join(this.config.syncPath, docPath)

      await should(findNote(filePath, this)).be.rejectedWith(
        'could not find local note file'
      )
    })

    it('throws a CozyNoteError with code CozyDocumentMissingError if the synced note does not exist anymore on the Cozy', async function() {
      const docPath = 'Some interesting stuff.cozy-note'
      const filePath = path.join(this.config.syncPath, docPath)

      const localHelpers = new LocalTestHelpers(this)
      await localHelpers.syncDir.outputFile(docPath, 'Note content')
      await builders
        .metafile()
        .path(docPath)
        .remoteId('3232')
        .build()

      await should(findNote(filePath, this)).be.rejectedWith({
        code: 'CozyDocumentMissingError'
      })
    })
  })
})
