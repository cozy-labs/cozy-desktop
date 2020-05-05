/* @flow */
/* eslint-env mocha */

const Promise = require('bluebird')
const crypto = require('crypto')
const EventEmitter = require('events')
const fse = require('fs-extra')
const _ = require('lodash')
const { pick } = _
const path = require('path')
const sinon = require('sinon')
const should = require('should')
const stream = require('stream')

const { withContentLength } = require('../../../core/reader')
const checksumer = require('../../../core/local/checksumer')
const metadata = require('../../../core/metadata')
const { ensureValidPath } = metadata
const Prep = require('../../../core/prep')
const remote = require('../../../core/remote')
const { Remote } = remote
const { DirectoryNotFound } = require('../../../core/remote/cozy')
const {
  TRASH_DIR_ID,
  NOTE_MIME_TYPE
} = require('../../../core/remote/constants')
const timestamp = require('../../../core/utils/timestamp')

const configHelpers = require('../../support/helpers/config')
const pouchHelpers = require('../../support/helpers/pouch')
const {
  cozy,
  builders,
  deleteAll,
  createTheCouchdbFolder
} = require('../../support/helpers/cozy')

/*::
import type { Metadata } from '../../../core/metadata'
import type { RemoteDoc, JsonApiDoc } from '../../../core/remote/document'
*/
const CHAT_MIGNON_MOD_PATH = 'test/fixtures/chat-mignon-mod.jpg'

describe('remote.Remote', function() {
  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  before('instanciate pouch', pouchHelpers.createDatabase)
  before('instanciate remote', function() {
    this.prep = sinon.createStubInstance(Prep)
    this.events = new EventEmitter()
    this.remote = new Remote(this)
  })
  beforeEach(deleteAll)
  beforeEach(createTheCouchdbFolder)
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('constructor', () => {
    it('has a remoteCozy and a watcher', function() {
      should.exist(this.remote.remoteCozy)
      should.exist(this.remote.watcher)
    })
  })

  describe('createReadStream', () => {
    it('create a readable stream from a remote binary', async function() {
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
      const checksum = crypto.createHash('md5')
      checksum.setEncoding('base64')
      stream.pipe(checksum)

      await new Promise(resolve => {
        stream.on('end', function() {
          checksum.end()
          should.equal(expectedChecksum, checksum.read())
          resolve()
        })
      })
    })
  })

  describe('addFileAsync', function() {
    it('adds a file to the remote Cozy', async function() {
      const doc /*: Object */ = {
        _id: 'cat2.jpg',
        path: 'cat2.jpg',
        docType: 'file',
        md5sum: await checksumer.computeChecksumAsync(CHAT_MIGNON_MOD_PATH),
        class: 'image',
        executable: true,
        updated_at: timestamp.current(),
        mime: 'image/jpg',
        size: 36901,
        sides: {
          local: 1
        }
      }
      await this.pouch.db.put(doc)

      this.remote.other = {
        createReadStreamAsync() {
          const stream = fse.createReadStream(CHAT_MIGNON_MOD_PATH)
          return Promise.resolve(stream)
        }
      }

      await this.remote.addFileAsync(doc)
      should.exist(doc.remote._id)
      should.exist(doc.remote._rev)

      const file = await cozy.files.statById(doc.remote._id)
      should(file.attributes).have.properties({
        dir_id: 'io.cozy.files.root-dir',
        executable: true,
        mime: 'image/jpg',
        name: 'cat2.jpg',
        size: '36901',
        type: 'file',
        updated_at: timestamp.stringify(doc.updated_at)
      })
    })

    it('does not reupload an existing file', async function() {
      const backupDir = await builders
        .remoteDir()
        .name('backup')
        .inRootDir()
        .create()
      await builders
        .remoteDir()
        .name('ORIGINAL')
        .inRootDir()
        .create()
      let md5sum = await checksumer.computeChecksumAsync(CHAT_MIGNON_MOD_PATH)
      let doc /*: Object */ = {
        _id: path.normalize('backup/cat3.jpg'),
        path: path.normalize('backup/cat3.jpg'),
        docType: 'file',
        md5sum,
        updated_at: timestamp.current(),
        size: 36901,
        sides: {
          local: 1
        }
      }
      let same = {
        _id: path.normalize('ORIGINAL/CAT3.JPG'),
        path: path.normalize('ORIGINAL/CAT3.JPG'),
        docType: 'file',
        md5sum,
        updated_at: timestamp.current(),
        size: 36901,
        remote: {
          _id: '05161241-ca73',
          _rev: '1-abcdef'
        },
        sides: {
          local: 1,
          remote: 1
        }
      }
      await this.pouch.db.put(doc)
      await this.pouch.db.put(same)

      await this.remote.addFileAsync(doc)

      should.exist(doc.remote._id)
      should.exist(doc.remote._rev)
      const file = await cozy.files.statById(doc.remote._id)
      should(file.attributes).have.properties({
        dir_id: backupDir._id,
        name: 'cat3.jpg',
        type: 'file',
        updated_at: timestamp.stringify(doc.updated_at),
        size: '36901'
      })
    })

    it('fails if the md5sum does not match the content', async function() {
      const doc /*: Object */ = {
        _id: 'cat2b.jpg',
        path: 'cat2b.jpg',
        docType: 'file',
        md5sum: 'BADBEEF',
        class: 'image',
        executable: true,
        updated_at: timestamp.current(),
        mime: 'image/jpg',
        size: 36901,
        sides: {
          local: 1
        }
      }
      await this.pouch.db.put(doc)

      this.remote.other = {
        createReadStreamAsync() {
          const stream = fse.createReadStream(CHAT_MIGNON_MOD_PATH)
          return Promise.resolve(stream)
        }
      }
      await should(this.remote.addFileAsync(doc)).be.rejectedWith({
        status: 422
      })
    })

    it('creates the parent folder when missing', async function() {
      const doc /*: Metadata */ = builders
        .metafile()
        .path(path.join('foo', 'bar', 'qux'))
        .build()
      this.remote.other = {
        createReadStreamAsync() {
          const empty = withContentLength(
            new stream.Readable({
              read: function() {
                this.push(null)
              }
            }),
            0
          )
          return empty
        }
      }
      await this.remote.addFileAsync(doc)
      await should(cozy.files.statByPath('/foo/bar')).be.fulfilled()
    })

    it('does not throw if the file does not exists locally anymore', async function() {
      const doc /*: Metadata */ = builders
        .metafile()
        .path('foo')
        .build()
      this.remote.other = {
        createReadStreamAsync() {
          return fse.readFile('/path/do/not/exists')
        }
      }
      await this.remote.addFileAsync(doc)
      should.exist(doc.remote._id)
      should.exist(doc.remote._rev)
      should.exist(doc.deleted)
    })
  })

  describe('addFolderAsync', () => {
    it('adds a folder to couchdb', async function() {
      const dateString = '2017-02-14T15:03:27Z'
      let doc /*: Object */ = {
        path: path.normalize('couchdb-folder/folder-1'),
        docType: 'folder',
        updated_at: dateString
      }
      await this.remote.addFolderAsync(doc)
      should.exist(doc.remote._id)
      should.exist(doc.remote._rev)

      const folder = await cozy.files.statById(doc.remote._id)
      should(folder.attributes).have.properties({
        path: '/couchdb-folder/folder-1',
        name: 'folder-1',
        type: 'directory',
        updated_at: dateString
      })
    })

    it('does nothing when the folder already exists', async function() {
      const parentDir /*: RemoteDoc */ = await builders.remoteDir().create()
      const remoteDir /*: RemoteDoc */ = await builders
        .remoteDir()
        .inDir(parentDir)
        .create()
      const doc /*: Metadata */ = _.merge(
        { remote: undefined },
        metadata.fromRemoteDoc(remoteDir)
      )
      ensureValidPath(doc)

      await this.remote.addFolderAsync(doc)

      const folder /*: JsonApiDoc */ = await cozy.files.statById(doc.remote._id)
      const { path, name, type, updated_at } = remoteDir
      should(folder.attributes).have.properties({
        path,
        name,
        type,
        updated_at
      })
      should(doc.remote).have.properties({
        _id: remoteDir._id,
        _rev: remoteDir._rev
      })
    })

    it('throws an error if the parent folder is missing', async function() {
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
    describe('overwriteFileAsync', function() {
      it('overwrites the binary content', async function() {
        const created = await builders
          .remoteFile()
          .data('foo')
          .timestamp(2015, 11, 16, 16, 12, 1)
          .create()
        const old = metadata.fromRemoteDoc(created)
        const doc /*: Metadata */ = _.defaults(
          {
            _id: created._id,
            md5sum: 'N7UdGUp1E+RbVvZSTy1R8g==',
            updated_at: timestamp.stringify(
              timestamp.build(2015, 12, 16, 16, 12, 1)
            ),
            sides: {
              local: 1
            }
          },
          old
        )
        await this.pouch.db.put(doc)
        this.remote.other = {
          createReadStreamAsync(localDoc) {
            localDoc.should.equal(doc)
            const stream = builders
              .stream()
              .push('bar')
              .build()
            return Promise.resolve(stream)
          }
        }

        await this.remote.overwriteFileAsync(doc, old)

        const file = await cozy.files.statById(doc.remote._id)
        should(file.attributes).have.properties({
          type: 'file',
          dir_id: created.dir_id,
          name: created.name,
          md5sum: 'N7UdGUp1E+RbVvZSTy1R8g==',
          updated_at: '2015-12-16T16:12:01Z'
        })
        should(doc.remote._rev).equal(file._rev)
      })

      it('throws an error if the checksum is invalid', async function() {
        const created = await builders
          .remoteFile()
          .data('foo')
          .create()
        const old = metadata.fromRemoteDoc(created)
        const doc = _.defaults({ md5sum: 'Invalid///////////////==' }, old)
        this.remote.other = {
          createReadStreamAsync() {
            const stream = builders
              .stream()
              .push('bar')
              .build()
            return Promise.resolve(stream)
          }
        }

        await should(this.remote.overwriteFileAsync(doc, old)).be.rejectedWith({
          status: 412
        })

        const file = await cozy.files.statById(doc.remote._id)
        should(file.attributes).have.properties({
          md5sum: old.md5sum
        })
      })

      it('does not throw if the file does not exists locally anymore', async function() {
        const doc /*: Metadata */ = builders
          .metafile()
          .path('foo')
          .build()
        this.remote.other = {
          createReadStreamAsync() {
            return fse.readFile('/path/do/not/exists')
          }
        }
        await this.remote.overwriteFileAsync(doc)
        should.exist(doc.remote._id)
        should.exist(doc.remote._rev)
        should.exist(doc.deleted)
      })

      it('does not send any request if the file is a Cozy Note', async function() {
        const created = await builders
          .remoteFile()
          .name('My Note.cozy-note')
          .contentType(NOTE_MIME_TYPE)
          .data('foo')
          .timestamp(2015, 11, 16, 16, 12, 1)
          .create()
        const old = metadata.fromRemoteDoc(created)
        const doc /*: Metadata */ = _.defaults(
          {
            _id: created._id,
            md5sum: 'N7UdGUp1E+RbVvZSTy1R8g==',
            updated_at: timestamp.stringify(
              timestamp.build(2015, 12, 16, 16, 12, 1)
            ),
            sides: {
              local: 1
            }
          },
          old
        )
        await this.pouch.db.put(doc)
        this.remote.other = {
          createReadStreamAsync(localDoc) {
            localDoc.should.equal(doc)
            const stream = builders
              .stream()
              .push('bar')
              .build()
            return Promise.resolve(stream)
          }
        }

        await this.remote.overwriteFileAsync(_.cloneDeep(doc), old)

        const file = await cozy.files.statById(doc.remote._id)
        should(file.attributes).have.properties({
          type: 'file',
          dir_id: created.dir_id,
          name: created.name,
          md5sum: 'rL0Y20zC+Fzt72VPzMSk2A==',
          updated_at: '2015-11-16T16:12:01Z'
        })
        should(doc.remote._rev).equal(file._rev)
      })
    })
  }

  describe('updateFileMetadataAsync', () => {
    it('makes the remote file executable when the local one was made too', async function() {
      const oldRemote = await builders
        .remoteFile()
        .executable(false)
        .create()
      const old = metadata.fromRemoteDoc(oldRemote)
      const doc = _.defaults({ executable: true }, old)

      await this.remote.updateFileMetadataAsync(doc, old)

      should(doc)
        .have.propertyByPath('remote', '_rev')
        .not.eql(old.remote._rev)
      const newRemote = await cozy.files.statById(oldRemote._id)
      should(newRemote)
        .have.propertyByPath('attributes', 'executable')
        .eql(true)
    })

    it('makes the remote file non-executable when the local one is not anymore', async function() {
      const oldRemote = await builders
        .remoteFile()
        .executable(true)
        .create()
      const old = metadata.fromRemoteDoc(oldRemote)
      const doc = _.clone(old)
      delete doc.executable

      await this.remote.updateFileMetadataAsync(doc, old)

      should(doc)
        .have.propertyByPath('remote', '_rev')
        .not.eql(old.remote._rev)
      const newRemote = await cozy.files.statById(oldRemote._id)
      should(newRemote)
        .have.propertyByPath('attributes', 'executable')
        .eql(false)
    })

    it('updates the last modification date of the remote file', async function() {
      const dir = await builders
        .remoteDir()
        .name('dir')
        .create()
      const created = await builders
        .remoteFile()
        .name('file-7')
        .inDir(dir)
        .data('foo')
        .timestamp(2015, 11, 16, 16, 13, 1)
        .create()

      const doc /*: Object */ = {
        path: 'dir/file-7',
        docType: 'file',
        md5sum: 'N7UdGUp1E+RbVvZSTy1R8g==', // foo
        updated_at: '2015-11-16T16:13:01.001Z'
      }
      const old = {
        path: 'dir/file-7',
        docType: 'file',
        md5sum: 'N7UdGUp1E+RbVvZSTy1R8g==',
        remote: {
          _id: created._id,
          _rev: created._rev
        }
      }

      await this.remote.updateFileMetadataAsync(doc, old)

      const file = await cozy.files.statById(doc.remote._id)
      should(file.attributes).have.properties({
        type: 'file',
        dir_id: dir._id,
        name: 'file-7',
        updated_at: '2015-11-16T16:13:01.001Z'
      })
      should(doc.remote._rev).equal(file._rev)
    })
  })

  describe('updateFolder', function() {
    it('updates the metadata of a folder', async function() {
      const created /*: RemoteDoc */ = await builders
        .remoteDir()
        .name('old-name')
        .timestamp(2017, 11, 15, 8, 12, 9)
        .create()
      const old /*: Metadata */ = metadata.fromRemoteDoc(created)
      const newParentDir /*: RemoteDoc */ = await builders
        .remoteDir()
        .name('new-parent-dir')
        .inRootDir()
        .create()
      const doc /*: Metadata */ = _.defaults(
        {
          path: path.normalize('new-parent-dir/new-name'),
          updated_at: '2017-11-16T16:14:45Z'
        },
        old
      )

      await this.remote.updateFolderAsync(doc, old)

      const folder /*: JsonApiDoc */ = await cozy.files.statById(doc.remote._id)
      should(folder.attributes).have.properties({
        path: '/new-parent-dir/new-name',
        type: 'directory',
        dir_id: newParentDir._id,
        updated_at: doc.updated_at
      })
      should(doc.remote).have.properties({
        _id: old.remote._id,
        _rev: folder._rev
      })
    })

    it('creates the dir if it does not exist', async function() {
      const parentDir /*: RemoteDoc */ = await builders
        .remoteDir()
        .name('parent-dir')
        .create()
      const deletedDir /*: RemoteDoc */ = await builders
        .remoteDir()
        .name('deleted-dir')
        .inDir(parentDir)
        .timestamp(2016, 1, 2, 3, 4, 5)
        .create()
      const oldMetadata /*: Metadata */ = metadata.fromRemoteDoc(deletedDir)
      const newMetadata /*: Metadata */ = _.defaults(
        {
          name: 'new-dir-name',
          path: path.normalize('parent-dir/new-dir-name')
        },
        oldMetadata
      )
      await cozy.files.destroyById(deletedDir._id)

      await this.remote.updateFolderAsync(newMetadata, oldMetadata)

      const created /*: JsonApiDoc */ = await cozy.files.statByPath(
        '/parent-dir/new-dir-name'
      )
      should(created.attributes).have.properties({
        type: 'directory',
        name: 'new-dir-name',
        dir_id: deletedDir.dir_id,
        updated_at: newMetadata.updated_at,
        tags: newMetadata.tags
      })
      should(newMetadata.remote).have.properties({
        _id: created._id,
        _rev: created._rev
      })
    })

    it('creates the dir if it has no remote info', async function() {
      const oldMetadata /*: Metadata */ = _.defaults(
        {
          remote: undefined,
          updated_at: timestamp.stringify(timestamp.build(2015, 1, 1, 1, 1, 1))
        },
        metadata.fromRemoteDoc(
          builders
            .remoteDir()
            .name('foo')
            .build()
        )
      )
      const newMetadata /*: Metadata */ = _.defaults(
        {
          updated_at: timestamp.stringify(timestamp.build(2015, 2, 2, 2, 2, 2))
        },
        oldMetadata
      )

      await this.remote.updateFolderAsync(newMetadata, oldMetadata)

      const folder /*: JsonApiDoc */ = await cozy.files.statById(
        newMetadata.remote._id
      )
      should(folder.attributes).have.properties({
        type: 'directory',
        name: 'foo',
        dir_id: 'io.cozy.files.root-dir',
        updated_at: newMetadata.updated_at,
        tags: newMetadata.tags
      })
    })
  })

  describe('moveAsync', () => {
    context('with a file', () => {
      let old /*: Metadata */
      let doc /*: Metadata */
      let newDir /*: RemoteDoc */

      beforeEach(async () => {
        const remoteDoc /*: RemoteDoc */ = await builders
          .remoteFile()
          .name('cat6.jpg')
          .data('meow')
          .create()
        old = metadata.fromRemoteDoc(remoteDoc)
        doc = _.defaults(
          {
            path: path.normalize('moved-to/cat7.jpg'),
            name: 'cat7.jpg',
            remote: undefined
          },
          old
        )
        newDir = await builders
          .remoteDir()
          .name('moved-to')
          .inRootDir()
          .create()
      })

      it('moves the file', async function() {
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
          updated_at: doc.updated_at,
          size: '4'
        })
      })
    })

    context('with a folder', function() {
      it('moves the folder in the Cozy', async function() {
        const couchdbFolder = await cozy.files.statByPath('/couchdb-folder')
        const created = await cozy.files.createDirectory({
          name: 'folder-4',
          dirID: couchdbFolder._id,
          lastModifiedDate: '2018-01-02T05:31:30.564Z'
        })
        let doc = {
          path: path.join('couchdb-folder', 'folder-5'),
          docType: 'folder',
          updated_at: new Date('2018-07-31T05:37:43.770Z'),
          remote: {
            _id: created._id,
            _rev: created._rev
          }
        }
        let old = {
          path: path.join('couchdb-folder', 'folder-4'),
          docType: 'folder',
          remote: {
            _id: created._id,
            _rev: created._rev
          }
        }
        await this.remote.moveAsync(doc, old)
        const folder = await cozy.files.statById(doc.remote._id)
        should(folder.attributes).have.properties({
          dir_id: couchdbFolder._id,
          name: 'folder-5',
          type: 'directory',
          updated_at: '2018-07-31T05:37:43.77Z' // No ms
        })
      })

      it('adds a folder to the Cozy if the folder does not exist', async function() {
        const couchdbFolder = await cozy.files.statByPath('/couchdb-folder')
        const created = await cozy.files.createDirectory({
          name: 'folder-6',
          dirID: couchdbFolder._id,
          lastModifiedDate: '2018-01-02T05:31:30.564Z'
        })
        let doc = {
          path: path.join('couchdb-folder', 'folder-7'),
          docType: 'folder',
          updated_at: new Date('2018-07-31T05:37:43.770Z')
        }
        let old = {
          path: path.join('couchdb-folder', 'folder-6'),
          docType: 'folder',
          remote: {
            _id: created._id,
            _rev: created._rev
          }
        }
        await this.remote.moveAsync(doc, old)
        // $FlowFixMe
        const folder = await cozy.files.statById(doc.remote._id)
        should(folder.attributes).have.properties({
          dir_id: couchdbFolder._id,
          name: 'folder-7',
          type: 'directory',
          updated_at: '2018-07-31T05:37:43.77Z' // No ms
        })
      })
    })
  })

  describe('trash', () => {
    it('moves the file or folder to the Cozy trash', async function() {
      const folder = await builders.remoteDir().create()
      const doc = metadata.fromRemoteDoc(folder)

      await this.remote.trashAsync(doc)

      const trashed = await cozy.files.statById(doc.remote._id)
      should(trashed)
        .have.propertyByPath('attributes', 'dir_id')
        .eql(TRASH_DIR_ID)
    })

    it('does nothing when file or folder does not exist anymore', async function() {
      const folder = await builders.remoteDir().build()
      const doc = metadata.fromRemoteDoc(folder)

      await this.remote.trashAsync(doc)

      await should(cozy.files.statById(doc.remote._id)).be.rejectedWith({
        status: 404
      })
    })
  })

  describe('deleteFolderAsync', () => {
    it('deletes permanently an empty folder', async function() {
      const folder = await builders.remoteDir().create()
      const doc = metadata.fromRemoteDoc(folder)

      await this.remote.deleteFolderAsync(doc)

      await should(cozy.files.statById(doc.remote._id)).be.rejectedWith({
        status: 404
      })
    })

    it('trashes a non-empty folder', async function() {
      const dir = await builders.remoteDir().create()
      const doc = metadata.fromRemoteDoc(dir)
      await builders
        .remoteDir()
        .inDir(dir)
        .create()

      await this.remote.deleteFolderAsync(doc)

      const trashed = await cozy.files.statById(doc.remote._id)
      should(trashed)
        .have.propertyByPath('attributes', 'dir_id')
        .eql(TRASH_DIR_ID)
    })

    it('resolves when folder does not exist anymore', async function() {
      const dir = await builders.remoteDir().build()
      const doc = metadata.fromRemoteDoc(dir)

      await this.remote.deleteFolderAsync(doc)

      await should(cozy.files.statById(doc.remote._id)).be.rejectedWith({
        status: 404
      })
    })

    it('resolves when folder is being deleted (race condition)', async function() {
      const dir = await builders.remoteDir().create()
      const doc = metadata.fromRemoteDoc(dir)
      sinon.stub(this.remote.remoteCozy, 'isEmpty').callsFake(async id => {
        await cozy.files.destroyById(id)
        return true
      })

      try {
        await should(this.remote.deleteFolderAsync(doc)).be.fulfilled()
      } finally {
        this.remote.remoteCozy.isEmpty.restore()
      }
    })

    it('does not swallow trashing errors', async function() {
      const dir = await builders
        .remoteDir()
        .trashed()
        .create()
      const doc = metadata.fromRemoteDoc(dir)
      await should(this.remote.deleteFolderAsync(doc)).be.rejected()
    })

    it('does not swallow emptiness check errors', async function() {
      const file = await builders.remoteFile().create()
      const doc = metadata.fromRemoteDoc(file)
      await should(this.remote.deleteFolderAsync(doc)).be.rejected()
    })

    it('does not swallow destroy errors', async function() {
      const dir = await builders.remoteDir().create()
      const doc = metadata.fromRemoteDoc(dir)
      sinon.stub(this.remote.remoteCozy, 'destroyById').rejects('whatever')
      await should(this.remote.deleteFolderAsync(doc)).be.rejected()
    })
  })

  describe('assignNewRev', () => {
    it('updates the rev of a moved file', async function() {
      const remote = { src: {}, dst: {} }

      remote.src.dir = await builders
        .remoteDir()
        .name('src-dir')
        .inRootDir()
        .create()
      remote.src.foo = await builders
        .remoteFile()
        .name('foo')
        .inDir(remote.src.dir)
        .create()
      remote.dst.dir = await this.remote.remoteCozy.updateAttributesById(
        remote.src.dir._id,
        { name: 'dst-dir' }
      )
      remote.dst.foo = await this.remote.remoteCozy.find(remote.src.foo._id)

      const doc /*: Metadata */ = metadata.fromRemoteDoc(remote.src.foo)
      doc.path = 'dst-dir/foo' // File metadata was updated as part of the move
      await this.remote.assignNewRev(doc)
      should(doc).deepEqual(metadata.fromRemoteDoc(remote.dst.foo))
    })
  })

  describe('renameConflictingDocAsync', () => {
    it('renames the file/folder', async function() {
      const remoteDoc /*: RemoteDoc */ = await builders
        .remoteFile()
        .name('cat9')
        .create()
      const src /*: Metadata */ = metadata.fromRemoteDoc(remoteDoc)
      ensureValidPath(src)
      const newPath = 'cat9-conflict-2015-12-01T01:02:03Z.jpg'
      await this.remote.renameConflictingDocAsync(src, newPath)
      const file /*: JsonApiDoc */ = await cozy.files.statById(remoteDoc._id)
      should(file.attributes).have.properties(
        _.merge(
          {
            name: newPath
          },
          pick(remoteDoc, ['dir_id', 'type', 'updated_at', 'size', 'md5sum'])
        )
      )
    })
  })
})

describe('remote', function() {
  describe('.dirAndName()', () => {
    it('returns the remote path and name', function() {
      let [dir, name] = remote.dirAndName('foo')
      should(dir).equal('/')
      should(name).equal('foo')
      ;[dir, name] = remote.dirAndName(path.normalize('foo/bar'))
      should(dir).equal('/foo')
      should(name).equal('bar')
      ;[dir, name] = remote.dirAndName(path.normalize('foo/bar/baz'))
      should(dir).equal('/foo/bar')
      should(name).equal('baz')
    })
  })
})
