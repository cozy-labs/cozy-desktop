/* @flow */
/* eslint-env mocha */

const should = require('should')
const path = require('path')
const os = require('os')

const configHelpers = require('../../../support/helpers/config')
const pouchHelpers = require('../../../support/helpers/pouch')
const cozyHelpers = require('../../../support/helpers/cozy')
const { RemoteTestHelpers } = require('../../../support/helpers/remote')
const Builders = require('../../../support/builders')

const { localDoc, remoteDoc, openNote } = require('../../../../gui/notes')
const { CozyDocumentMissingError } = require('../../../../core/remote/errors')

const cozy = cozyHelpers.cozy

describe('gui/notes/index', () => {
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

    it('throws a CozyDocumentMissingError if no doc exist with the given path', async function() {
      const docPath = 'Notes/Some interesting stuff.cozy-note'
      const filePath = path.join(this.config.syncPath, docPath)

      await should(localDoc(filePath, this)).be.rejectedWith(
        CozyDocumentMissingError
      )
    })

    it('throws a CozyDocumentMissingError if the note is not within the synced folder', async function() {
      const docPath = 'Notes/Some interesting stuff.cozy-note'
      const filePath = path.join(os.tmpdir(), docPath)

      const builders = new Builders(this)
      await builders
        .metafile()
        .path(docPath)
        .upToDate()
        .create()

      await should(localDoc(filePath, this)).be.rejectedWith(
        CozyDocumentMissingError
      )
    })
  })

  describe('remoteDoc', () => {
    before('instanciate config', configHelpers.createConfig)
    before('register cozy client', configHelpers.registerClient)
    beforeEach('clean remote cozy', cozyHelpers.deleteAll)
    after('clean config directory', configHelpers.cleanConfig)

    it('fetches the remote io.cozy.files document associated with the given local doc', async function() {
      const docPath = 'Some interesting stuff.cozy-note'

      const remoteHelpers = new RemoteTestHelpers(this)
      const builders = new Builders({ cozy })
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

    it('throws a CozyDocumentMissingError if no remote doc exist for the given local doc', async function() {
      const docPath = 'Some interesting stuff.cozy-note'

      const remoteHelpers = new RemoteTestHelpers(this)
      const builders = new Builders({ cozy })
      const doc = await builders
        .metafile()
        .path(docPath)
        .remoteId('3232')
        .upToDate()
        .build()

      await should(
        remoteDoc(doc, { config: this.config, remote: remoteHelpers.side })
      ).be.rejectedWith(CozyDocumentMissingError)
    })

    it('throws a CozyDocumentMissingError if the local doc is not associated with a remote doc', async function() {
      const docPath = 'Some interesting stuff.cozy-note'

      const remoteHelpers = new RemoteTestHelpers(this)
      const builders = new Builders({ cozy })
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
      ).be.rejectedWith(CozyDocumentMissingError)
    })
  })

  describe('openNote', () => {
    before('instanciate config', configHelpers.createConfig)
    before('register cozy client', configHelpers.registerClient)
    beforeEach('clean remote cozy', cozyHelpers.deleteAll)
    beforeEach('instanciate pouch', pouchHelpers.createDatabase)
    afterEach('clean pouch', pouchHelpers.cleanDatabase)
    after('clean config directory', configHelpers.cleanConfig)

    it('throws a CozyDocumentMissingError when filePath does not correspond to a synced note', async function() {
      const docPath = 'Notes/Some interesting stuff.cozy-note'
      const filePath = path.join(this.config.syncPath, docPath)

      await should(
        openNote(filePath, { shell: {}, desktop: this })
      ).be.rejectedWith(CozyDocumentMissingError)
    })

    it('thows a CozyDocumentMissingError if the synced note does not exist anymore on the Cozy', async function() {
      const docPath = 'Some interesting stuff.cozy-note'

      const builders = new Builders({ cozy })
      await builders
        .metafile()
        .path(docPath)
        .remoteId('3232')
        .build()

      await should(
        openNote(docPath, { shell: {}, desktop: this })
      ).be.rejectedWith(CozyDocumentMissingError)
    })
  })
})
