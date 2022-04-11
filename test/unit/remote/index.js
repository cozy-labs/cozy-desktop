/* @flow */
/* eslint-env mocha */

const Promise = require('bluebird')
const EventEmitter = require('events')
const fse = require('fs-extra')
const _ = require('lodash')
const path = require('path')
const sinon = require('sinon')
const should = require('should')

const metadata = require('../../../core/metadata')
const Prep = require('../../../core/prep')
const remote = require('../../../core/remote')
const { DirectoryNotFound } = require('../../../core/remote/errors')
const { ROOT_DIR_ID, TRASH_DIR_ID } = require('../../../core/remote/constants')
const { FetchError } = require('../../../core/remote/cozy')
const { remoteJsonToRemoteDoc } = require('../../../core/remote/document')
const timestamp = require('../../../core/utils/timestamp')
const { CONFLICT_REGEXP } = require('../../../core/utils/conflicts')

const configHelpers = require('../../support/helpers/config')
const pouchHelpers = require('../../support/helpers/pouch')
const { cozy, deleteAll } = require('../../support/helpers/cozy')
const Builders = require('../../support/builders')

/*::
import type { Metadata, SavedMetadata } from '../../../core/metadata'
import type { RemoteDoc, RemoteJsonDoc } from '../../../core/remote/document'
*/
const CHAT_MIGNON_MOD_PATH = 'test/fixtures/chat-mignon-mod.jpg'

describe('remote.Remote', function () {
  let builders, couchdbFolder

  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('prepare builders', function () {
    builders = new Builders({ cozy, pouch: this.pouch })
  })
  beforeEach('instanciate remote', function () {
    this.prep = sinon.createStubInstance(Prep)
    this.events = new EventEmitter()
    this.remote = new remote.Remote(this)
    // TODO: find out why the client built by `new Remote()` doesn't behave
    // correctly (i.e. its auth isn't totally set and we can end up getting
    // errors from `cozy-client-js` because it's missing a `client_secret`).
    this.remote.remoteCozy.client = cozy
  })
  beforeEach(deleteAll)
  beforeEach('create the couchdb folder', async function () {
    couchdbFolder = await builders
      .remoteDir()
      .name('couchdb-folder')
      .inRootDir()
      .create()
    await builders.metadir().fromRemote(couchdbFolder).upToDate().create()
  })
  afterEach('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('constructor', () => {
    it('has a remoteCozy and a watcher', function () {
      should.exist(this.remote.remoteCozy)
      should.exist(this.remote.watcher)
    })

    it('has a side name', function () {
      should(this.remote.name).eql('remote')
    })
  })

  describe('createReadStream', () => {
    it('create a readable stream from a remote binary', async function () {
      const expectedChecksum = '2NqmrnZqa1zTER40NtPGJg=='
      const fixture = 'test/fixtures/cool-pillow.jpg'

      const binary = await builders
        .remoteFile()
        .name('pillow.jpg')
        .contentType('image/jpeg')
        .dataFromFile(fixture)
        .create()
      should(binary.md5sum).equal(expectedChecksum)

      const stream = await this.remote.createReadStreamAsync(
        metadata.fromRemoteDoc(binary)
      )
      should.exist(stream)
      await should(builders.checksum(stream).create()).be.fulfilledWith(
        expectedChecksum
      )
    })
  })

  describe('addFileAsync', function () {
    let image
    before('read image', async () => {
      image = await fse.readFile(CHAT_MIGNON_MOD_PATH)
    })

    it('adds a file to the remote Cozy', async function () {
      const doc = await builders
        .metafile()
        .path('cat2.jpg')
        .data(image)
        .type('image/jpg')
        .executable(true)
        .sides({ local: 1 })
        .create()

      this.remote.other = {
        createReadStreamAsync() {
          return fse.createReadStream(CHAT_MIGNON_MOD_PATH)
        }
      }

      await this.remote.addFileAsync(doc)

      should(doc).have.propertyByPath('remote', '_id')

      const file = await cozy.files.statById(doc.remote._id)
      should(file.attributes).have.properties({
        dir_id: 'io.cozy.files.root-dir',
        executable: true,
        mime: 'image/jpg',
        name: 'cat2.jpg',
        size: '36901',
        type: 'file'
      })
      should(timestamp.roundedRemoteDate(file.attributes.updated_at)).equal(
        doc.updated_at
      )
    })

    it('fails if the md5sum does not match the content', async function () {
      const doc = await builders
        .metafile()
        .path('cat2b.jpg')
        .data('BADBEEF')
        .size(36901) // XXX: size of CHAT_MIGNON_MOD_PATH
        .type('image/jpg')
        .executable(true)
        .sides({ local: 1 })
        .create()

      this.remote.other = {
        createReadStreamAsync() {
          const stream = fse.createReadStream(CHAT_MIGNON_MOD_PATH)
          return Promise.resolve(stream)
        }
      }
      await should(this.remote.addFileAsync(doc)).be.rejectedWith({
        status: 412
      })
    })

    it('does not throw if the file does not exists locally anymore', async function () {
      const doc /*: Metadata */ = builders
        .metafile()
        .path('foo')
        .sides({ local: 1 })
        .build()
      this.remote.other = {
        createReadStreamAsync() {
          return fse.readFile('/path/do/not/exists')
        }
      }
      await this.remote.addFileAsync(doc)
      should(doc).have.property('trashed').and.not.have.property('remote')
    })

    it('rejects with a DirectoryNotFound error if its parent is missing on the Cozy', async function () {
      const doc /*: Metadata */ = builders
        .metafile()
        .path('dir/foo')
        .sides({ local: 1 })
        .build()
      this.remote.other = {
        createReadStreamAsync() {
          // XXX: we should not care if the file exists locally or not
          return fse.readFile('dir/foo')
        }
      }
      await should(this.remote.addFileAsync(doc)).be.rejectedWith(
        DirectoryNotFound
      )
    })

    it('rejects if there is not enough space on the Cozy', async function () {
      sinon
        .stub(this.remote.remoteCozy, 'createFile')
        .rejects(
          new FetchError({ status: 413 }, 'Not enough space left on Cozy')
        )

      const doc = await builders
        .metafile()
        .path('cat2.jpg')
        .data(image)
        .type('image/jpg')
        .executable(true)
        .sides({ local: 1 })
        .create()

      this.remote.other = {
        createReadStreamAsync() {
          const stream = fse.createReadStream(CHAT_MIGNON_MOD_PATH)
          return Promise.resolve(stream)
        }
      }

      try {
        await should(this.remote.addFileAsync(doc)).be.rejectedWith({
          name: 'FetchError',
          status: 413
        })
      } finally {
        this.remote.remoteCozy.createFile.restore()
      }
    })
  })

  describe('addFolderAsync', () => {
    it('adds a folder on the remote Cozy', async function () {
      const doc = builders
        .metadir()
        .path('folder-1')
        .sides({ local: 1 })
        .updatedAt(timestamp.build(2017, 2, 14, 15, 3, 27))
        .build()

      await this.remote.addFolderAsync(doc)

      should(doc).have.propertyByPath('remote', '_id')

      const folder = await cozy.files.statById(doc.remote._id)
      should(folder.attributes).have.properties({
        path: '/folder-1',
        name: 'folder-1',
        type: 'directory'
      })
      should(timestamp.roundedRemoteDate(folder.attributes.updated_at)).equal(
        doc.updated_at
      )
    })

    it('throws an error if a conflicting folder exists', async function () {
      const remoteDir = await builders
        .remoteDir()
        .inRootDir()
        .createdAt(2017, 2, 14, 15, 3, 27)
        .updatedAt(2017, 2, 14, 15, 3, 27)
        .create()
      const doc = builders
        .metadir()
        .fromRemote(remoteDir)
        .sides({ local: 1 })
        .updatedAt(new Date().toISOString())
        .build()

      await should(this.remote.addFolderAsync(doc)).be.rejectedWith(/Conflict/)
    })

    it('throws an error if the parent folder is missing', async function () {
      const doc /*: Metadata */ = builders
        .metadir()
        .path(path.join('foo', 'bar', 'qux'))
        .build()
      await should(this.remote.addFolderAsync(doc)).be.rejectedWith(
        DirectoryNotFound
      )
    })
  })

  if (process.platform === 'win32' && process.env.CI) {
    it.skip('overwrites the binary content (unstable on AppVeyor)', () => {})
  } else {
    describe('overwriteFileAsync', function () {
      it('overwrites the binary content', async function () {
        const created = await builders
          .remoteFile()
          .data('foo')
          .createdAt(2015, 11, 16, 16, 12, 1)
          .create()
        const old = await builders
          .metafile()
          .fromRemote(created)
          .upToDate()
          .create()
        const doc = await builders
          .metafile(old)
          .overwrite(old)
          .data('bar')
          .changedSide('local')
          .updatedAt(timestamp.build(2015, 12, 16, 16, 12, 1).toISOString())
          .noRecord() // XXX: Prevent Pouch conflict from reusing `old`'s _id
          .create()

        this.remote.other = {
          createReadStreamAsync(localDoc) {
            localDoc.should.equal(doc)
            const stream = builders.stream().push('bar').build()
            return Promise.resolve(stream)
          }
        }

        await this.remote.overwriteFileAsync(doc)

        const file = await cozy.files.statById(doc.remote._id)
        should(file.attributes).have.properties({
          type: 'file',
          dir_id: created.dir_id,
          name: created.name,
          md5sum: 'N7UdGUp1E+RbVvZSTy1R8g=='
        })
        should(timestamp.roundedRemoteDate(file.attributes.updated_at)).equal(
          doc.updated_at
        )
        should(doc.remote._rev).equal(file._rev)
      })

      it('throws an error if the checksum is invalid', async function () {
        const created = await builders.remoteFile().data('foo').create()
        const old = await builders
          .metafile()
          .fromRemote(created)
          .upToDate()
          .create()
        const doc = builders
          .metafile(old)
          .overwrite(old)
          .md5sum('Invalid///////////////==')
          .changedSide('local')
          .build()

        this.remote.other = {
          createReadStreamAsync() {
            const stream = builders.stream().push('bar').build()
            return Promise.resolve(stream)
          }
        }

        await should(this.remote.overwriteFileAsync(doc)).be.rejectedWith({
          status: 412
        })

        const file = await cozy.files.statById(doc.remote._id)
        should(file.attributes).have.properties({
          md5sum: old.md5sum
        })
      })

      it('does not throw if the file does not exists locally anymore', async function () {
        const doc /*: Metadata */ = builders
          .metafile()
          .path('foo')
          .changedSide('local')
          .build()
        this.remote.other = {
          createReadStreamAsync() {
            return fse.readFile('/path/do/not/exists')
          }
        }
        await this.remote.overwriteFileAsync(doc)

        should(doc)
          .have.property('trashed')
          .and.not.have.propertyByPath('remote')
      })

      it('sends a request if the file is a Cozy Note', async function () {
        const created = await builders
          .remoteNote()
          .name('My Note.cozy-note')
          .data('foo')
          .createdAt(2015, 11, 16, 16, 12, 1)
          .create()
        const old = await builders
          .metafile()
          .fromRemote(created)
          .upToDate()
          .create()
        const doc = await builders
          .metafile(old)
          .data('bar')
          .updatedAt(new Date())
          .changedSide('local')
          .create()

        this.remote.other = {
          createReadStreamAsync(localDoc) {
            should(localDoc).deepEqual(doc)
            const stream = builders.stream().push('bar').build()
            return Promise.resolve(stream)
          }
        }

        await this.remote.overwriteFileAsync(_.cloneDeep(doc))

        const file = await cozy.files.statById(doc.remote._id)
        should(file.attributes).have.properties({
          type: 'file',
          dir_id: created.dir_id,
          name: created.name,
          md5sum: doc.md5sum
        })
        should(timestamp.roundedRemoteDate(file.attributes.updated_at)).equal(
          doc.updated_at
        )
        should(metadata.extractRevNumber(file)).equal(
          metadata.extractRevNumber(doc.remote) + 1
        )
      })

      it('rejects if there is not enough space on the Cozy', async function () {
        sinon
          .stub(this.remote.remoteCozy, 'updateFileById')
          .rejects(
            new FetchError({ status: 413 }, 'Not enough space left on Cozy')
          )

        const created = await builders
          .remoteFile()
          .data('foo')
          .createdAt(2015, 11, 16, 16, 12, 1)
          .create()
        const old = await builders
          .metafile()
          .fromRemote(created)
          .upToDate()
          .create()
        const doc = await builders
          .metafile(old)
          .overwrite(old)
          .data('bar')
          .changedSide('local')
          .updatedAt(timestamp.build(2015, 12, 16, 16, 12, 1).toISOString())
          .noRecord() // XXX: Prevent Pouch conflict from reusing `old`'s _id
          .create()

        this.remote.other = {
          createReadStreamAsync(localDoc) {
            localDoc.should.equal(doc)
            const stream = builders.stream().push('bar').build()
            return Promise.resolve(stream)
          }
        }

        try {
          await should(this.remote.overwriteFileAsync(doc)).be.rejectedWith({
            name: 'FetchError',
            status: 413
          })
        } finally {
          this.remote.remoteCozy.updateFileById.restore()
        }
      })

      it('sends the most recent modification date', async function () {
        const created = await builders
          .remoteFile()
          .data('foo')
          .createdAt(2015, 11, 16, 16, 12, 1)
          .create()
        const old = await builders
          .metafile()
          .fromRemote(created)
          .upToDate()
          .create()

        // Request with local modification date older than remote one
        const doc1 = await builders
          .metafile(old)
          .overwrite(old)
          .data('bar')
          .changedSide('local')
          .updatedAt(timestamp.build(2015, 10, 16, 16, 12, 1).toISOString())
          .noRecord() // XXX: Prevent Pouch conflict from reusing `old`'s _id
          .create()

        this.remote.other = {
          createReadStreamAsync(localDoc) {
            localDoc.should.equal(doc1)
            const stream = builders.stream().push('bar').build()
            return Promise.resolve(stream)
          }
        }

        await this.remote.overwriteFileAsync(doc1)

        const update1 = await cozy.files.statById(doc1.remote._id)
        should(
          timestamp.roundedRemoteDate(update1.attributes.updated_at)
        ).equal(timestamp.roundedRemoteDate(created.updated_at))
        should(doc1.remote._rev).equal(update1._rev)

        // Request with remote modification date older than local one
        const doc2 = await builders
          .metafile(doc1)
          .overwrite(doc1)
          .data('baz')
          .changedSide('local')
          .updatedAt(timestamp.build(2016, 10, 16, 16, 12, 1).toISOString())
          .noRecord() // XXX: Prevent Pouch conflict from reusing `doc1`'s _id
          .create()

        this.remote.other = {
          createReadStreamAsync(localDoc) {
            localDoc.should.equal(doc2)
            const stream = builders.stream().push('baz').build()
            return Promise.resolve(stream)
          }
        }

        await this.remote.overwriteFileAsync(doc2)

        const update2 = await cozy.files.statById(doc2.remote._id)
        should(
          timestamp.roundedRemoteDate(update2.attributes.updated_at)
        ).equal(doc2.local.updated_at)
        should(doc2.remote._rev).equal(update2._rev)

        // Request without remote modification date. Old PouchDB records might
        // not have any.
        let doc3 = await builders
          .metafile(doc2)
          .overwrite(doc2)
          .data('boom')
          .changedSide('local')
          .updatedAt(timestamp.build(2017, 10, 16, 16, 12, 1).toISOString())
          .noRecord() // XXX: Prevent Pouch conflict from reusing `doc2`'s _id
          .create()
        doc3 = {
          ...doc3,
          remote: {
            path: doc3.remote.path,
            _id: doc3.remote._id,
            _rev: doc3.remote._rev
          }
        }
        // Fake old PouchDB record
        const { rev } = await this.pouch.put(doc3)
        doc3._rev = rev

        this.remote.other = {
          createReadStreamAsync(localDoc) {
            localDoc.should.equal(doc3)
            const stream = builders.stream().push('boom').build()
            return Promise.resolve(stream)
          }
        }

        await this.remote.overwriteFileAsync(doc3)

        const update3 = await cozy.files.statById(doc3.remote._id)
        should(
          timestamp.roundedRemoteDate(update3.attributes.updated_at)
        ).equal(doc3.local.updated_at)
        should(doc3.remote._rev).equal(update3._rev)
      })
    })
  }

  describe('updateFileMetadataAsync', () => {
    it('makes the remote file executable when the local one was made too', async function () {
      const oldRemote = await builders.remoteFile().executable(false).create()
      const doc = builders
        .metafile()
        .fromRemote(oldRemote)
        .executable(true)
        .changedSide('local')
        .build()

      await this.remote.updateFileMetadataAsync(doc)

      should(doc).have.propertyByPath('remote', '_rev').not.eql(oldRemote._rev)
      const newRemote = await cozy.files.statById(oldRemote._id)
      should(newRemote)
        .have.propertyByPath('attributes', 'executable')
        .eql(true)
    })

    it('makes the remote file non-executable when the local one is not anymore', async function () {
      const oldRemote = await builders.remoteFile().executable(true).create()
      const doc = builders
        .metafile()
        .fromRemote(oldRemote)
        .executable(false)
        .changedSide('local')
        .build()

      await this.remote.updateFileMetadataAsync(doc)

      should(doc).have.propertyByPath('remote', '_rev').not.eql(oldRemote._rev)
      const newRemote = await cozy.files.statById(oldRemote._id)
      should(newRemote)
        .have.propertyByPath('attributes', 'executable')
        .eql(false)
    })

    it('updates the last modification date of the remote file', async function () {
      const dir = await builders.remoteDir().name('dir').create()
      const created = await builders
        .remoteFile()
        .name('file-7')
        .inDir(dir)
        .data('foo')
        .createdAt(2015, 11, 16, 16, 13, 1)
        .create()

      const doc = builders
        .metafile()
        .fromRemote(created)
        .updatedAt('2015-11-17T16:13:01.001Z')
        .changedSide('local')
        .build()

      await this.remote.updateFileMetadataAsync(doc)

      const file = await cozy.files.statById(doc.remote._id)
      should(file.attributes).have.properties({
        type: 'file',
        dir_id: dir._id,
        name: 'file-7',
        updated_at: '2015-11-17T16:13:01.001Z'
      })
      should(doc.remote._rev).equal(file._rev)
    })
  })

  describe('updateFolder', function () {
    it('updates the metadata of a folder', async function () {
      const created = await builders
        .remoteDir()
        .inRootDir()
        .name('created')
        .createdAt(2017, 11, 15, 8, 12, 9)
        .updatedAt(2017, 11, 15, 8, 12, 9)
        .create()
      const doc = builders
        .metadir()
        .fromRemote(created)
        .updatedAt('2017-11-16T16:14:45.123Z')
        .changedSide('local')
        .build()

      await this.remote.updateFolderAsync(doc)

      const folder /*: RemoteJsonDoc */ = await cozy.files.statById(
        doc.remote._id
      )
      should(folder.attributes).have.properties({
        path: '/created',
        type: 'directory',
        dir_id: ROOT_DIR_ID,
        updated_at: doc.updated_at
      })
      should(doc.remote).have.properties({
        _id: created._id,
        _rev: folder._rev
      })
    })

    it('throws an error if the directory does not exist', async function () {
      const deletedDir = await builders
        .remoteDir()
        .name('deleted-dir')
        .inRootDir()
        .createdAt(2016, 1, 2, 3, 4, 5)
        .create()
      await cozy.files.destroyById(deletedDir._id)
      const doc = builders
        .metadir()
        .fromRemote(deletedDir)
        .updatedAt(new Date().toISOString())
        .build()

      await should(this.remote.updateFolderAsync(doc)).be.rejectedWith(
        /does not exist/
      )
    })

    it('throws an error if it has no remote info', async function () {
      const remoteDir = await builders
        .remoteDir()
        .name('foo')
        .createdAt(2015, 2, 2, 2, 2, 2)
        .updatedAt(2015, 2, 2, 2, 2, 2)
        .create()
      const was = await builders
        .metadir()
        .fromRemote(remoteDir)
        .upToDate()
        .create()
      const doc = builders
        .metadir(was)
        .updatedAt('2015-02-03T02:02:02.000Z')
        .sides({ local: 1 })
        .build()

      await should(this.remote.updateFolderAsync(doc)).be.rejectedWith(
        /Conflict/
      )
    })
  })

  describe('moveAsync', () => {
    context('with a file', () => {
      let old /*: Metadata */
      let doc /*: Metadata */
      let newDir /*: RemoteDoc */

      beforeEach(async () => {
        newDir = await builders
          .remoteDir()
          .name('moved-to')
          .inRootDir()
          .create()
        await builders.metadir().fromRemote(newDir).upToDate().create()
        const remoteDoc = await builders
          .remoteFile()
          .name('cat6.jpg')
          .data('meow')
          .create()
        old = builders
          .metafile()
          .fromRemote(remoteDoc)
          .changedSide('local')
          .build()
        doc = builders
          .metafile()
          .moveFrom(old)
          .path('moved-to/cat7.jpg')
          .build()
      })

      it('moves the file', async function () {
        await this.remote.moveAsync(doc, old)

        const file = await cozy.files.statById(doc.remote._id)
        should(file).have.properties({
          _id: old.remote._id,
          _rev: doc.remote._rev
        })
        should(file.attributes).have.properties({
          dir_id: newDir._id,
          name: 'cat7.jpg',
          type: 'file',
          size: '4'
        })
        should(timestamp.roundedRemoteDate(file.attributes.updated_at)).equal(
          doc.updated_at
        )
      })
    })

    context('with a folder', function () {
      it('moves the folder in the Cozy', async function () {
        const created = await builders
          .remoteDir()
          .name('folder-4')
          .inDir(couchdbFolder)
          .createdAt(2018, 1, 2, 5, 31, 30, 564)
          .updatedAt(2018, 1, 2, 5, 31, 30, 564)
          .create()
        const old = await builders
          .metadir()
          .fromRemote(created)
          .changedSide('local')
          .create()
        const doc = await builders
          .metadir()
          .moveFrom(old)
          .path('couchdb-folder/folder-5')
          .updatedAt('2018-07-31T05:37:43.770Z')
          .create()

        await this.remote.moveAsync(doc, old)

        const folder = await cozy.files.statById(doc.remote._id)
        should(folder.attributes).have.properties({
          dir_id: couchdbFolder._id,
          name: 'folder-5',
          type: 'directory'
        })
        should(timestamp.roundedRemoteDate(folder.attributes.updated_at)).equal(
          doc.updated_at
        )
      })
    })

    context(
      'when the remote updated_at value is more recent than the local one',
      () => {
        // It can happen when trying to move an image that was never modified
        // after being uploaded to the remote Cozy and which has an EXIF date more
        // recent than its filesystem modification date.
        //
        // To simplify the test we'll fake this by creating a remote document
        // without specifying the updatedAt field so that the Cozy will use the
        // current time as value.
        let remoteFile, file
        beforeEach(async () => {
          remoteFile = await builders
            .remoteFile()
            .inRootDir()
            .name('cat.jpg')
            .data('maow')
            .createdAt(2018, 1, 2, 6, 31, 30, 564)
            .updatedAt(2018, 1, 2, 6, 31, 30, 564)
            .create()
          // We create the local doc from the remote one but in reality this
          // would be the opposite. Our data builders give us this opportunity.
          file = await builders
            .metafile()
            .fromRemote(remoteFile)
            .updatedAt('2018-01-02T05:31:30.504Z') // 1 hour before the remote creation date
            .upToDate()
            .create()
        })

        it('moves the file on the Cozy', async function () {
          const old = builders.metafile(file).changedSide('local').build()
          const doc = builders
            .metafile()
            .moveFrom(old)
            .path('My Cat.jpg')
            .build()

          await this.remote.moveAsync(doc, old)

          const movedFile = await cozy.files.statById(doc.remote._id)
          should(movedFile).have.properties({
            _id: old.remote._id,
            _rev: doc.remote._rev
          })
          should(movedFile.attributes).have.property('name', 'My Cat.jpg')
          // The `remote` attribute of the PouchDB record is updated
          should(doc.remote).have.property(
            'updated_at',
            timestamp.roundedRemoteDate(movedFile.attributes.updated_at)
          )
        })
      }
    )

    context(
      'when the remote created_at value is more recent than updated_at',
      () => {
        // It can happen when trying to move an image that was never modified
        // after being uploaded to the remote Cozy and which has an EXIF date more
        // recent than its filesystem modification date.
        let remoteFile, file
        beforeEach(async () => {
          remoteFile = await builders
            .remoteFile()
            .inRootDir()
            .name('cat.jpg')
            .data('maow')
            .createdAt(2018, 1, 2, 7, 31, 30, 564)
            .updatedAt(2018, 1, 2, 6, 31, 30, 564) // 1 hour before the creation date
            .create()
          // We create the local doc from the remote one but in reality this
          // would be the opposite. Our data builders give us this opportunity.
          file = await builders
            .metafile()
            .fromRemote(remoteFile)
            .updatedAt(timestamp.roundedRemoteDate(remoteFile.updated_at))
            .upToDate()
            .create()
        })

        it('moves the file on the Cozy', async function () {
          const doc = builders
            .metafile(file) // XXX: Necessary to replace the default updated_at
            .moveFrom(file)
            .path('My Cat.jpg')
            .changedSide('local')
            .build()

          await this.remote.moveAsync(doc, file)

          const movedFile = await cozy.files.statById(doc.remote._id)
          should(movedFile).have.properties({
            _id: file.remote._id,
            _rev: doc.remote._rev
          })
          should(movedFile.attributes).have.property('name', 'My Cat.jpg')
          // The `remote` attribute of the PouchDB record is updated
          should(doc.remote).have.property(
            'updated_at',
            timestamp.roundedRemoteDate(movedFile.attributes.created_at)
          )
        })
      }
    )

    context('when overwriting an existing file', function () {
      const existingRefs = [{ _id: 'blah', _type: 'io.cozy.photos.albums' }]

      let existingRemote
      let existing /*: SavedMetadata */
      let old /*:SavedMetadata */
      let doc /*: Metadata */
      let newDir /*: RemoteDoc */

      beforeEach(async () => {
        newDir = await builders
          .remoteDir()
          .name('moved-to')
          .inRootDir()
          .create()
        await builders.metadir().fromRemote(newDir).upToDate().create()

        existingRemote = await builders
          .remoteFile()
          .inDir(newDir)
          .name('cat7.jpg')
          .data('woof')
          .referencedBy(existingRefs)
          .create()

        const remote2 = await builders
          .remoteFile()
          .name('cat6.jpg')
          .data('meow')
          .create()
        old = await builders.metafile().fromRemote(remote2).upToDate().create()
      })

      const saveMetadata = async () => {
        existing = await builders
          .metafile()
          .fromRemote(existingRemote)
          .upToDate()
          .create()

        // For whatever reason, the creation date of `remote2` is ahead of new Date() !!!
        const updatedAt = new Date(new Date().getTime() + 1000).toISOString()
        doc = builders
          .metafile()
          .moveFrom(old)
          .path('moved-to/cat7.jpg')
          .overwrite(existing)
          .updatedAt(updatedAt)
          .changedSide('local')
          .build()
      }

      it('moves the file', async function () {
        await saveMetadata()

        await this.remote.moveAsync(doc, old)

        should(doc.remote._id).equal(old.remote._id)
        should(doc.remote._rev).not.equal(old.remote._rev)
        const file = await cozy.files.statById(doc.remote._id)
        should(file).have.properties({
          _id: old.remote._id,
          _rev: doc.remote._rev
        })
        should(file.attributes).have.properties({
          dir_id: newDir._id,
          name: 'cat7.jpg',
          type: 'file',
          size: '4'
        })
        should(timestamp.roundedRemoteDate(file.attributes.updated_at)).equal(
          doc.updated_at
        )
      })

      it('trashes the existing file at target location', async function () {
        await saveMetadata()

        await this.remote.moveAsync(doc, old)

        should(await cozy.files.statById(existing.remote._id))
          .have.propertyByPath('attributes', 'trashed')
          .be.true()
      })

      it('transfers the existing file references to the moved one', async function () {
        await saveMetadata()

        await this.remote.moveAsync(doc, old)

        should(await cozy.files.statById(doc.remote._id))
          .have.propertyByPath('relationships', 'referenced_by', 'data')
          .eql(existingRefs.map(ref => ({ id: ref._id, type: ref._type })))
      })

      it('updates the remote attribute', async function () {
        await saveMetadata()

        await this.remote.moveAsync(doc, old)

        const udpatedFile = await this.remote.remoteCozy.find(doc.remote._id)

        should(doc.remote).deepEqual({
          ...udpatedFile,
          created_at: timestamp.roundedRemoteDate(udpatedFile.created_at),
          updated_at: timestamp.roundedRemoteDate(udpatedFile.updated_at)
        })
      })

      context('when the overwritten file is already in the Trash', () => {
        beforeEach(async () => {
          existingRemote = await builders
            .remoteFile(existingRemote)
            .trashed()
            .update()
        })

        it('successfuly moves the file', async function () {
          await saveMetadata()

          await this.remote.moveAsync(doc, old)

          should(doc.remote._id).equal(old.remote._id)
          const file = await cozy.files.statById(doc.remote._id)
          should(file).have.properties({
            _id: old.remote._id,
            _rev: doc.remote._rev
          })
          should(file.attributes).have.properties({
            dir_id: newDir._id,
            name: 'cat7.jpg'
          })
        })

        it('transfers the existing file references to the moved one', async function () {
          await saveMetadata()

          await this.remote.moveAsync(doc, old)

          should(await cozy.files.statById(doc.remote._id))
            .have.propertyByPath('relationships', 'referenced_by', 'data')
            .eql(existingRefs.map(ref => ({ id: ref._id, type: ref._type })))
        })
      })

      context('when the overwritten file does not exist anymore', () => {
        beforeEach(async function () {
          await cozy.files.destroyById(existingRemote._id)
        })

        it('successfuly moves the file', async function () {
          await saveMetadata()

          await this.remote.moveAsync(doc, old)

          should(doc.remote._id).equal(old.remote._id)
          const file = await cozy.files.statById(doc.remote._id)
          should(file).have.properties({
            _id: old.remote._id,
            _rev: doc.remote._rev
          })
          should(file.attributes).have.properties({
            dir_id: newDir._id,
            name: 'cat7.jpg'
          })
        })

        it('does not transfer the deleted file references', async function () {
          await saveMetadata()

          await this.remote.moveAsync(doc, old)

          should(await cozy.files.statById(doc.remote._id))
            .have.propertyByPath('relationships', 'referenced_by', 'data')
            .be.null()
        })
      })
    })
  })

  describe('trash', () => {
    it('moves the file or folder to the Cozy trash', async function () {
      const folder = await builders.remoteDir().create()
      const doc = builders
        .metadir()
        .fromRemote(folder)
        .changedSide('local')
        .build()

      await this.remote.trashAsync(doc)

      const trashed = await cozy.files.statById(doc.remote._id)
      should(trashed)
        .have.propertyByPath('attributes', 'dir_id')
        .eql(TRASH_DIR_ID)
    })

    it('does nothing when file or folder does not exist anymore', async function () {
      const folder = await builders.remoteDir().build()
      const doc = builders
        .metadir()
        .fromRemote(folder)
        .changedSide('local')
        .build()

      await this.remote.trashAsync(doc)

      await should(cozy.files.statById(doc.remote._id)).be.rejectedWith({
        status: 404
      })
    })
  })

  describe('assignNewRemote', () => {
    it('updates the remote attribute of a moved document', async function () {
      const remoteSrc = await builders
        .remoteDir()
        .name('src-dir')
        .inRootDir()
        .create()
      const remoteFile = await builders
        .remoteFile()
        .name('foo')
        .inDir(remoteSrc)
        .create()
      const file = builders.metafile().fromRemote(remoteFile).upToDate().build()
      const remoteDir = await builders
        .remoteDir()
        .name('foo-dir')
        .inDir(remoteSrc)
        .create()
      const dir = builders.metadir().fromRemote(remoteDir).upToDate().build()

      await this.remote.remoteCozy.updateAttributesById(remoteSrc._id, {
        name: 'dst-dir'
      })

      const movedFile = await this.remote.remoteCozy.find(remoteFile._id)
      await this.remote.assignNewRemote(file)
      should(file.remote).deepEqual({
        ...movedFile,
        created_at: timestamp.roundedRemoteDate(movedFile.created_at),
        updated_at: timestamp.roundedRemoteDate(movedFile.updated_at)
      })

      const movedDir = await this.remote.remoteCozy.find(remoteDir._id)
      await this.remote.assignNewRemote(dir)
      should(dir.remote).deepEqual({
        ...movedDir,
        created_at: timestamp.roundedRemoteDate(movedDir.created_at),
        updated_at: timestamp.roundedRemoteDate(movedDir.updated_at)
      })
    })
  })

  describe('ping', () => {
    beforeEach(function () {
      sinon.stub(this.remote.remoteCozy, 'diskUsage')
    })
    afterEach(function () {
      this.remote.remoteCozy.diskUsage.restore()
    })

    it('resolves to true if we can successfuly fetch the remote disk usage', async function () {
      this.remote.remoteCozy.diskUsage.resolves()
      await should(this.remote.ping()).be.fulfilledWith(true)
    })

    it('resolves to false if we cannot successfuly fetch the remote disk usage', async function () {
      this.remote.remoteCozy.diskUsage.rejects()
      await should(this.remote.ping()).be.fulfilledWith(false)
    })
  })

  describe('findDirectoryByPath', () => {
    let oldRemoteDir, newRemoteDir, oldDir, dir
    beforeEach(async function () {
      oldRemoteDir = await builders.remoteDir().name('old').create()
      oldDir = await builders
        .metadir()
        .fromRemote(oldRemoteDir)
        .upToDate()
        .create()
      dir = await builders
        .metadir()
        .moveFrom(oldDir)
        .path('dir')
        .changedSide('local')
        .create()
      newRemoteDir = await builders.remoteDir().name('dir').create()
    })

    it('returns the directory metadata saved in PouchDB', async function () {
      await should(this.remote.findDirectoryByPath('dir')).be.fulfilledWith(
        metadata.serializableRemote(dir.remote)
      )
      should(dir.remote).have.properties({
        _id: oldRemoteDir._id,
        _rev: oldRemoteDir._rev
      })
      should(dir.remote).not.have.properties({
        _id: newRemoteDir._id,
        _rev: newRemoteDir._rev
      })
    })

    it('handles different local and remote paths formats', async function () {
      // XXX: The synced path of this directory on Windows will be
      // `whatever\childDir` and since we search by synced path, this tests that
      // we handle the conversion.
      const childDir = await builders
        .metadir()
        .path('whatever/childDir')
        .upToDate()
        .create()

      await should(
        this.remote.findDirectoryByPath('whatever/childDir')
      ).be.fulfilledWith(childDir.remote)
    })

    it('returns the remote root directory for path .', async function () {
      // $FlowFixMe Root is a directory
      const root /*: RemoteDir */ = remoteJsonToRemoteDoc(
        // XXX: We call the cozy-client-js method directly to increase the
        // likelyhood that the remote document is unaltered.
        await this.remote.remoteCozy.client.files.statById(ROOT_DIR_ID)
      )

      should(await this.remote.findDirectoryByPath('.')).have.properties({
        _id: root._id,
        name: root.name,
        path: root.path,
        dir_id: root.dir_id,
        type: root.type
      })
    })

    it('returns a DirectoryNotFound error if the directory cannot be found in PouchDB', async function () {
      await builders.remoteDir().name('missing').create()

      await should(this.remote.findDirectoryByPath('missing')).be.rejectedWith(
        DirectoryNotFound
      )
    })

    it('returns a DirectoryNotFound error if the local document is not a directory', async function () {
      await builders.metafile().path('wrong-type').upToDate().create()

      await should(
        this.remote.findDirectoryByPath('wrong-type')
      ).be.rejectedWith(DirectoryNotFound)
    })

    it('returns a DirectoryNotFound error if the directory has no remote side', async function () {
      await builders.metadir().path('no-remote').sides({ local: 1 }).create()

      await should(
        this.remote.findDirectoryByPath('no-remote')
      ).be.rejectedWith(DirectoryNotFound)
    })
  })

  describe('resolveConflict', () => {
    let remoteFile, file
    beforeEach(async function () {
      remoteFile = await builders.remoteFile().name('file.txt').create()
      file = await builders
        .metafile()
        .fromRemote(remoteFile)
        .upToDate()
        .create()
    })

    it('fails if there are no remote documents with the given path', async function () {
      await this.remote.remoteCozy.destroyById(remoteFile._id)

      await should(this.remote.resolveConflict(file)).be.rejected()
    })

    it('renames the remote document with a conflict suffix', async function () {
      await this.remote.resolveConflict(file)
      should(await this.remote.remoteCozy.find(remoteFile._id))
        .have.property('name')
        .match(CONFLICT_REGEXP)
    })

    it('fails with a 412 error if file changes on remote Cozy during the call', async function () {
      await builders.remoteFile(remoteFile).data('update').update()

      await should(this.remote.resolveConflict(file)).be.rejectedWith({
        name: 'FetchError',
        status: 412
      })
    })
  })
})

describe('remote', function () {
  describe('.dirAndName()', () => {
    it('returns the remote path and name', function () {
      should(remote.dirAndName('foo')).deepEqual(['.', 'foo'])
      should(remote.dirAndName(path.normalize('foo/bar'))).deepEqual([
        'foo',
        'bar'
      ])
      should(remote.dirAndName(path.normalize('foo/bar/baz'))).deepEqual([
        'foo/bar',
        'baz'
      ])
    })
  })
})
