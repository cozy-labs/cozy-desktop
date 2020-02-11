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

const {
  localDoc,
  remoteDoc,
  computeNoteURL,
  openNote
} = require('../../../../gui/notes')
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
        .build()

      await should(
        remoteDoc(doc, { config: this.config, remote: remoteHelpers.side })
      ).be.rejectedWith(CozyDocumentMissingError)
    })
  })

  describe('computeNoteURL', () => {
    const myName = 'alice'
    const myNoteId = '1234'
    const herNoteId = '2343829043232'
    const sharecode = '84930290432'
    const myCozy = 'alice.mycozy.cloud'
    const herCozy = 'bob.other.domain'

    const flat = instance => {
      const parts = instance.split('.')
      return `${parts[0]}-notes.${parts[1]}.${parts[2]}`
    }
    const nested = instance => `notes.${instance}`
    const stubClient = (
      { isMine, flat = true } /*: { isMine: boolean, flat?: boolean } */
    ) => ({
      getStackClient: () => ({
        collection: docType => ({
          fetchURL: async ({ _id }) => {
            if (docType !== 'io.cozy.notes') throw new Error('wrong doctype')
            return {
              _id,
              _type: 'io.cozy.notes.url',
              id: _id,
              type: 'io.cozy.notes.url',
              data: {
                note_id: isMine ? _id : herNoteId,
                subdomain: flat ? 'flat' : 'nested',
                protocol: 'https',
                instance: isMine ? myCozy : herCozy,
                sharecode: isMine ? undefined : sharecode,
                public_name: myName
              }
            }
          }
        })
      })
    })

    context('when the note is mine', () => {
      const client = stubClient({ isMine: true, flat: true })

      it('returns an url pointing to my cozy if the note is mine', async function() {
        should(await computeNoteURL(myNoteId, client)).containEql(flat(myCozy))
      })

      it('does not point to the public notes view', async function() {
        should(await computeNoteURL(myNoteId, client)).not.containEql('public')
      })

      it('does not include any share code', async function() {
        should(await computeNoteURL(myNoteId, client)).not.containEql(
          'sharecode'
        )
      })

      it('uses my note id', async function() {
        should(await computeNoteURL(myNoteId, client)).not.containEql(herNoteId)
        should(await computeNoteURL(myNoteId, client)).containEql(
          `id=${myNoteId}`
        )
      })

      it('contains my user name', async function() {
        should(await computeNoteURL(myNoteId, client)).containEql(
          `username=${myName}`
        )
      })
    })

    context('when the note is not mine', () => {
      const client = stubClient({ isMine: false, flat: false })

      it('returns an url pointing to the cozy of the owner', async function() {
        should(await computeNoteURL(myNoteId, client)).containEql(
          nested(herCozy)
        )
      })

      it('points to the public notes view', async function() {
        should(await computeNoteURL(myNoteId, client)).containEql('public/')
      })

      it('includes the appropriate share code', async function() {
        should(await computeNoteURL(myNoteId, client)).containEql(
          `sharecode=${sharecode}`
        )
      })

      it('uses the owner note id', async function() {
        should(await computeNoteURL(myNoteId, client)).not.containEql(myNoteId)
        should(await computeNoteURL(myNoteId, client)).containEql(
          `id=${herNoteId}`
        )
      })

      it('contains my user name', async function() {
        should(await computeNoteURL(myNoteId, client)).containEql(
          `username=${myName}`
        )
      })
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
