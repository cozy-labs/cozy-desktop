/* @flow */
/* eslint-env mocha */

import crypto from 'crypto'
import fs from 'fs'
import sinon from 'sinon'
import should from 'should'

import * as conversion from '../../../src/conversion'
import Prep from '../../../src/prep'
import Remote from '../../../src/remote'
import { TRASH_DIR_ID } from '../../../src/remote/constants'
import timestamp from '../../../src/timestamp'

import type { Metadata } from '../../../src/metadata'
import type { RemoteDoc, JsonApiDoc } from '../../../src/remote/document'

import configHelpers from '../../helpers/config'
import pouchHelpers from '../../helpers/pouch'
import couchHelpers from '../../helpers/v2/couch'
import {
  cozy, COZY_URL, builders, deleteAll, createTheCouchdbFolder
} from '../../helpers/cozy'

describe('Remote', function () {
  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  before('instanciate pouch', pouchHelpers.createDatabase)
  // before('start couch server', couchHelpers.startServer)
  // before('instanciate couch', couchHelpers.createCouchClient)
  before('instanciate remote', function () {
    this.config.cozyUrl = COZY_URL
    this.prep = sinon.createStubInstance(Prep)
    this.events = {}
    this.remote = new Remote(this.config, this.prep, this.pouch)
  })
  beforeEach(deleteAll)
  beforeEach(createTheCouchdbFolder)
  // after('stop couch server', couchHelpers.stopServer)
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('constructor', () =>
    it('has a remoteCozy and a watcher', function () {
      should.exist(this.remote.remoteCozy)
      should.exist(this.remote.watcher)
    })
  )

  describe('createReadStream', () =>
    it('create a readable stream from a remote binary', function (done) {
      this.events.emit = sinon.spy()
      const expectedChecksum = '2NqmrnZqa1zTER40NtPGJg=='
      const fixture = 'test/fixtures/cool-pillow.jpg'

      builders.file().named('pillow.jpg').contentType('image/jpeg')
        .dataFromFile(fixture).build()
        .then(binary => {
          should(binary.md5sum).equal(expectedChecksum)
          this.remote.createReadStream(conversion.createMetadata(binary), function (err, stream) {
            if (err) done(err)
            should.not.exist(err)
            should.exist(stream)
            const checksum = crypto.createHash('md5')
            checksum.setEncoding('base64')
            stream.pipe(checksum)
            stream.on('end', function () {
              checksum.end()
              should.equal(expectedChecksum, checksum.read())
              done()
            })
          })
        })
        .catch(done)
    })
  )

  xdescribe('uploadBinary', function () {
    it('creates a remote binary document', function (done) {
      this.events.emit = sinon.spy()
      let checksum = 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
      let fixture = 'test/fixtures/chat-mignon.jpg'
      let doc = {
        path: 'chat.jpg',
        mime: 'image/jpeg',
        checksum
      }
      this.remote.other = {
        createReadStream (localDoc, callback) {
          localDoc.should.equal(doc)
          let stream = fs.createReadStream(fixture)
          return callback(null, stream)
        }
      }
      return this.remote.uploadBinary(doc, (err, binary) => {
        should.not.exist(err)
        binary._id.should.equal(checksum)
        return this.remote.couch.get(checksum, function (err, binaryDoc) {
          should.not.exist(err)
          binaryDoc.should.have.properties({
            _id: checksum,
            checksum,
            docType: 'Binary'
          })
          should.exist(binaryDoc._attachments)
          binaryDoc._attachments.file.length.should.equal(29865)
          done()
        })
      })
    })

    it('does not reupload an existing file', function (done) {
      let checksum = 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
      let doc = {
        path: 'chat-bis.jpg',
        mime: 'image/jpeg',
        checksum
      }
      return this.remote.uploadBinary(doc, function (err, binary) {
        should.not.exist(err)
        binary._id.should.equal(checksum)
        done()
      })
    })

    it('uploads the file even if a blank binary is present', function (done) {
      let checksum = '988881adc9fc3655077dc2d4d757d480b5ea0e11'
      let fixture = 'test/fixtures/foobar.txt'
      let doc = {
        path: 'foobar.txt',
        mime: 'text/plain',
        checksum
      }
      let binary = {
        _id: checksum,
        docType: 'Binary',
        checksum
      }
      this.remote.other = {
        createReadStream (localDoc, callback) {
          localDoc.should.equal(doc)
          let stream = fs.createReadStream(fixture)
          return callback(null, stream)
        }
      }
      return this.couch.put(binary, (err, created) => {
        should.not.exist(err)
        return this.remote.uploadBinary(doc, err => {
          should.not.exist(err)
          return this.couch.get(created.id, function (err, binaryDoc) {
            should.not.exist(err)
            should.exist(binaryDoc._attachments)
            done()
          })
        })
      })
    })
  })

  xdescribe('createRemoteDoc', function () {
    it('transforms a local file in remote file', function () {
      let local = {
        _id: 'FOO/BAR/BAZ.JPG',
        path: 'foo/bar/baz.jpg',
        docType: 'file',
        lastModification: '2015-11-12T13:14:32.384Z',
        creationDate: '2015-11-12T13:14:32.384Z',
        tags: ['qux'],
        checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30',
        size: 12345,
        class: 'image',
        mime: 'image/jpeg'
      }
      let remote = {
        binary: {
          _id: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30',
          _rev: '2-0123456789'
        }
      }
      let doc = this.remote.createRemoteDoc(local, remote)
      doc.should.have.properties({
        path: '/foo/bar',
        name: 'baz.jpg',
        docType: 'file',
        lastModification: '2015-11-12T13:14:32.384Z',
        creationDate: '2015-11-12T13:14:32.384Z',
        tags: ['qux'],
        checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30',
        size: 12345,
        class: 'image',
        mime: 'image/jpeg',
        binary: {
          file: {
            id: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30',
            rev: '2-0123456789'
          }
        }
      })
    })

    it('transforms a local folder in remote folder', function () {
      let local = {
        path: 'foo/bar/baz',
        docType: 'folder',
        lastModification: '2015-11-12T13:14:33.384Z',
        creationDate: '2015-11-12T13:14:33.384Z',
        tags: ['courge']
      }
      let doc = this.remote.createRemoteDoc(local)
      doc.should.have.properties({
        path: '/foo/bar',
        name: 'baz',
        docType: 'folder',
        lastModification: '2015-11-12T13:14:33.384Z',
        creationDate: '2015-11-12T13:14:33.384Z',
        tags: ['courge']})
    })

    it('has the good path when in root folder', function () {
      let local = {
        path: 'in-root-folder',
        docType: 'folder'
      }
      let doc = this.remote.createRemoteDoc(local)
      doc.should.have.properties({
        path: '',  // not '/' or '.'
        name: 'in-root-folder',
        docType: 'folder'
      })
    })

    it('transforms an existing local file in remote file', function () {
      let local = {
        path: 'foo/bar/baz.jpg',
        docType: 'file',
        lastModification: '2015-11-12T13:14:32.384Z',
        creationDate: '2015-11-12T13:14:32.384Z',
        checksum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
      }
      let remote = {
        _id: 'fc4de46b9b42aaeb23521ff42e23a18e7a812bda',
        _rev: '1-951357',
        binary: {
          _id: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30',
          _rev: '1-456951'
        }
      }
      let doc = this.remote.createRemoteDoc(local, remote)
      doc.should.have.properties({
        _id: remote._id,
        _rev: remote._rev,
        path: '/foo/bar',
        name: 'baz.jpg',
        docType: 'file',
        lastModification: '2015-11-12T13:14:32.384Z',
        creationDate: '2015-11-12T13:14:32.384Z',
        binary: {
          file: {
            id: remote.binary._id,
            rev: remote.binary._rev
          }
        }
      })
    })
  })

  xdescribe('cleanBinary', function () {
    it('deletes the binary if no longer referenced', function (done) {
      let binary = {
        _id: 'binary-5b1b',
        checksum: '5b1baec8306885df52fdf341efb0087f1a8ac81e',
        docType: 'Binary'
      }
      return this.couch.put(binary, (err, created) => {
        should.not.exist(err)
        return this.remote.cleanBinary(binary._id, err => {
          should.not.exist(err)
          return this.couch.get(binary._id, function (err) {
            err.status.should.equal(404)
            done()
          })
        })
      })
    })

    it('keeps the binary if referenced by a file', function (done) {
      let binary = {
        _id: 'binary-b410',
        checksum: 'b410ffdd571d6e86bb8e8bdd054df91e16dfa75e',
        docType: 'Binary'
      }
      let file = {
        _id: 'A-FILE-WITH-B410',
        path: 'A-FILE-WITH-B410',
        docType: 'file',
        checksum: 'b410ffdd571d6e86bb8e8bdd054df91e16dfa75e',
        remote: {
          id: 'remote-file-b410',
          rev: '1-123456',
          binary: {
            _id: 'binary-410',
            _rev: '1-123456'
          }
        }
      }
      this.pouch.db.put(file, err => {
        should.not.exist(err)
        return this.couch.put(binary, err => {
          should.not.exist(err)
          return this.remote.cleanBinary(binary._id, err => {
            should.not.exist(err)
            return this.couch.get(binary._id, function (err, doc) {
              should.not.exist(err)
              doc._id.should.equal(binary._id)
              doc.checksum.should.equal(binary.checksum)
              done()
            })
          })
        })
      })
    })
  })

  xdescribe('isUpToDate', () =>
    it('says if the remote file is up to date', function () {
      let doc: Object = {
        _id: 'foo/bar',
        _rev: '1-0123456',
        path: 'foo/bar',
        docType: 'file',
        checksum: '22f7aca0d717eb322d5ae1c97d8aa26eb440287b',
        sides: {
          local: 1
        }
      }
      this.remote.isUpToDate(doc).should.be.false()
      doc.sides.remote = 2
      doc._rev = '2-0123456'
      this.remote.isUpToDate(doc).should.be.true()
      doc.sides.local = 3
      doc._rev = '3-0123456'
      this.remote.isUpToDate(doc).should.be.false()
    })
  )

  describe('addFileAsync', function () {
    it('adds a file to the remote Cozy', async function () {
      const doc: Object = {
        _id: 'cat2.jpg',
        path: 'cat2.jpg',
        docType: 'file',
        checksum: 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df',
        class: 'image',
        creationDate: timestamp.current(),
        executable: true,
        lastModification: timestamp.current(),
        mime: 'image/jpg',
        size: 36901,
        sides: {
          local: 1
        }
      }
      await this.pouch.db.put(doc)

      this.remote.other = {
        createReadStreamAsync (localDoc) {
          const stream = fs.createReadStream('test/fixtures/chat-mignon-mod.jpg')
          return Promise.resolve(stream)
        }
      }

      const created = await this.remote.addFileAsync(doc)
      should.exist(doc.remote._id)
      should.exist(doc.remote._rev)

      const file = await cozy.files.statById(created._id)
      should(file.attributes).have.properties({
        created_at: timestamp.stringify(doc.creationDate),
        dir_id: 'io.cozy.files.root-dir',
        executable: true,
        mime: 'image/jpg',
        name: 'cat2.jpg',
        size: '36901',
        type: 'file',
        updated_at: timestamp.stringify(doc.lastModification)
      })
    })

    it('does not reupload an existing file', async function () {
      const backupDir = await builders.dir().named('backup').inRootDir().build()
      await builders.dir().named('ORIGINAL').inRootDir().build()
      let checksum = 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
      let doc: Object = {
        _id: 'backup/cat3.jpg',
        path: 'backup/cat3.jpg',
        docType: 'file',
        checksum,
        creationDate: timestamp.current(),
        lastModification: timestamp.current(),
        size: 36901,
        sides: {
          local: 1
        }
      }
      let same = {
        _id: 'ORIGINAL/CAT3.JPG',
        path: 'ORIGINAL/CAT3.JPG',
        docType: 'file',
        checksum,
        creationDate: timestamp.current(),
        lastModification: timestamp.current(),
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

      const created = await this.remote.addFileAsync(doc)

      should.exist(doc.remote._id)
      should.exist(doc.remote._rev)
      const file = await cozy.files.statById(created._id)
      should(file.attributes).have.properties({
        dir_id: backupDir._id,
        name: 'cat3.jpg',
        type: 'file',
        created_at: timestamp.stringify(doc.creationDate),
        updated_at: timestamp.stringify(doc.lastModification),
        size: '36901'
      })
    })
  })

  describe('addFolder', () =>
    it('adds a folder to couchdb', function (done) {
      const dateString = '2017-02-14T15:03:27Z'
      let doc: Object = {
        path: 'couchdb-folder/folder-1',
        docType: 'folder',
        creationDate: dateString,
        lastModification: dateString
      }
      this.remote.addFolder(doc, (err, created: RemoteDoc) => {
        should.not.exist(err)
        should.exist(doc.remote._id)
        should.exist(doc.remote._rev)

        cozy.files.statById(created._id)
          .then(folder => {
            should(folder.attributes).have.properties({
              path: '/couchdb-folder/folder-1',
              name: 'folder-1',
              type: 'directory',
              created_at: dateString,
              updated_at: dateString
            })
            done()
          })
          .catch(done)
      })
    })
  )

  describe('overwriteFileAsync', function () {
    it('overwrites the binary content', async function () {
      const created = await builders.file().data('foo').timestamp(2015, 11, 16, 16, 12, 1).build()
      const old = conversion.createMetadata(created)
      const doc: Metadata = {
        ...old,
        _id: created._id,
        checksum: 'N7UdGUp1E+RbVvZSTy1R8g==',
        lastModification: timestamp.stringify(timestamp.build(2015, 11, 16, 16, 12, 1)),
        sides: {
          local: 1
        }
      }
      await this.pouch.db.put(doc)
      this.remote.other = {
        createReadStreamAsync (localDoc) {
          localDoc.should.equal(doc)
          const stream = builders.stream().push('bar').build()
          return Promise.resolve(stream)
        }
      }

      await this.remote.overwriteFileAsync(doc, old)

      const file = await cozy.files.statById(doc.remote._id)
      should(file.attributes).have.properties({
        type: 'file',
        dir_id: created.dir_id,
        name: created.name,
        updated_at: '2015-11-16T16:12:01Z'
      })
      should(doc.remote._rev).equal(file._rev)
    })

    it('throws an error if the checksum is invalid', async function () {
      const created = await builders.file().data('foo').build()
      const old = conversion.createMetadata(created)
      const doc = {
        ...old,
        checksum: 'Invalid///////////////=='
      }
      this.remote.other = {
        createReadStreamAsync (localDoc) {
          const stream = builders.stream().push('bar').build()
          return Promise.resolve(stream)
        }
      }

      await should(this.remote.overwriteFileAsync(doc, old))
        .be.rejectedWith({status: 412})

      const file = await cozy.files.statById(doc.remote._id)
      should(file.attributes).have.properties({
        md5sum: old.checksum
      })
    })
  })

  describe('updateFileMetadataAsync', () =>
    it('updates the lastModification', async function () {
      const dir = await builders.dir().named('dir').build()
      const created = await builders.file()
        .named('file-7')
        .inDir(dir)
        .data('foo')
        .timestamp(2015, 11, 16, 16, 13, 1)
        .build()

      const doc: Object = {
        path: 'dir/file-7',
        docType: 'file',
        checksum: 'N7UdGUp1E+RbVvZSTy1R8g==', // foo
        lastModification: '2015-11-16T16:13:01.001Z'
      }
      const old = {
        path: 'dir/file-7',
        docType: 'file',
        checksum: 'N7UdGUp1E+RbVvZSTy1R8g==',
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
        updated_at: '2015-11-16T16:13:01Z'
      })
      should(doc.remote._rev).equal(file._rev)
    })
  )

  describe('updateFolder', function () {
    it('updates the metadata of a folder', async function () {
      const created: RemoteDoc = await builders.dir()
        .named('old-name')
        .build()
      const old: Metadata = conversion.createMetadata(created)
      const newParentDir: RemoteDoc = await builders.dir()
        .named('new-parent-dir')
        .inRootDir()
        .build()
      const doc: Metadata = {
        ...old,
        path: `new-parent-dir/new-name`,
        updated_at: new Date() // TODO
      }

      const updated: Metadata = await this.remote.updateFolderAsync(doc, old)

      const folder: JsonApiDoc = await cozy.files.statById(updated.remote._id)
      should(folder.attributes).have.properties({
        path: '/new-parent-dir/new-name',
        type: 'directory',
        dir_id: newParentDir._id,
        updated_at: doc.lastModification
      })
      should(doc.remote).have.properties({
        _id: old.remote._id,
        _rev: folder._rev
      })
    })

    xit('adds a folder to couchdb if the folder does not exist', function (done) {
      let doc = {
        path: 'couchdb-folder/folder-3',
        docType: 'folder',
        creationDate: new Date(),
        lastModification: new Date()
      }
      return this.remote.updateFolder(doc, {}, (err, created) => {
        should.not.exist(err)
        return this.couch.get(created.id, function (err, folder) {
          should.not.exist(err)
          folder.should.have.properties({
            path: '/couchdb-folder',
            name: 'folder-3',
            docType: 'folder',
            creationDate: doc.creationDate.toISOString(),
            lastModification: doc.lastModification.toISOString()
          })
          done()
        })
      })
    })
  })

  describe('moveFile', () => {
    it('moves the file', async function () {
      const remoteDoc: RemoteDoc = await builders
        .file()
        .named('cat6.jpg')
        .data('meow')
        .build()
      const old: Metadata = conversion.createMetadata(remoteDoc)
      const doc: Metadata = {
        ...old,
        path: 'moved-to/cat7.jpg',
        name: 'cat7.jpg',
        remote: undefined
      }
      const newDir: RemoteDoc = await builders.dir()
        .named('moved-to')
        .inRootDir()
        .build()

      const moved: Metadata = await this.remote.moveFileAsync(doc, old)

      should(moved.remote._id).equal(old.remote._id)
      should(moved.remote._rev).not.equal(old.remote._rev)
      should(doc.remote).have.properties(moved.remote)
      const file = await cozy.files.statById(moved.remote._id)
      should(file).have.properties({
        _id: old.remote._id,
        _rev: moved.remote._rev
      })
      should(file.attributes).have.properties({
        dir_id: newDir._id,
        name: 'cat7.jpg',
        type: 'file',
        updated_at: doc.lastModification,
        size: '4'
      })
    })
  })

  xdescribe('moveFolder', function () {
    it('moves the folder in couchdb', function (done) {
      return couchHelpers.createFolder(this.couch, 4, (_, created) => {
        let doc = {
          path: 'couchdb-folder/folder-5',
          docType: 'folder',
          creationDate: new Date(),
          lastModification: new Date(),
          remote: {
            _id: created.id,
            _rev: created.rev
          }
        }
        let old = {
          path: 'couchdb-folder/folder-4',
          docType: 'folder',
          remote: {
            _id: created.id,
            _rev: created.rev
          }
        }
        return this.remote.moveFolder(doc, old, (err, created) => {
          should.not.exist(err)
          return this.couch.get(created.id, function (err, folder) {
            should.not.exist(err)
            folder.should.have.properties({
              path: '/couchdb-folder',
              name: 'folder-5',
              docType: 'folder',
              lastModification: doc.lastModification.toISOString()
            })
            done()
          })
        })
      })
    })

    it('adds a folder to couchdb if the folder does not exist', function (done) {
      let doc = {
        path: 'couchdb-folder/folder-7',
        docType: 'folder',
        creationDate: new Date(),
        lastModification: new Date()
      }
      let old = {
        path: 'couchdb-folder/folder-6',
        docType: 'folder'
      }
      return this.remote.moveFolder(doc, old, (err, created) => {
        should.not.exist(err)
        return this.couch.get(created.id, function (err, folder) {
          should.not.exist(err)
          folder.should.have.properties({
            path: '/couchdb-folder',
            name: 'folder-7',
            docType: 'folder',
            creationDate: doc.creationDate.toISOString(),
            lastModification: doc.lastModification.toISOString()
          })
          done()
        })
      }
            )
    })
  })

  describe('destroy', function () {
    it('deletes a file in couchdb', async function () {
      const file = await builders.file().build()
      const doc = conversion.createMetadata(file)

      await this.remote.destroyAsync(doc)
        .should.be.fulfilled()

      await cozy.files.statById(doc.remote._id)
        .should.be.rejectedWith({status: 404})
    })
  })

  describe('trash', () =>
    it('moves the file or folder to the Cozy trash', async function () {
      const folder = await builders.dir().build()
      const doc = conversion.createMetadata(folder)

      await this.remote.trashAsync(doc)

      const trashed = await cozy.files.statById(doc.remote._id)
      should(trashed).have.propertyByPath('attributes', 'dir_id').eql(TRASH_DIR_ID)
    })
  )

  xdescribe('resolveConflict', () =>
    it('renames the file/folder', function (done) {
      let checksum = 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
      let binary = {
        _id: checksum,
        _rev: '1-0123456789'
      }
      let src: Object = {
        path: 'cat9.jpg',
        docType: 'file',
        checksum,
        creationDate: new Date().toISOString(),
        lastModification: new Date().toISOString(),
        size: 36901
      }
      let dst = {
        path: 'cat-conflict-2015-12-01T01:02:03Z.jpg',
        docType: 'file',
        checksum,
        creationDate: src.creationDate,
        lastModification: src.lastModification,
        size: 36901
      }
      let remoteDoc = this.remote.createRemoteDoc(src, {binary})
      return this.couch.put(remoteDoc, (err, created) => {
        should.not.exist(err)
        src.remote = {
          _id: created.id,
          _rev: created.rev,
          binary: {
            _id: checksum,
            _rev: binary._rev
          }
        }
        return this.remote.resolveConflict(dst, src, (err, moved) => {
          should.not.exist(err)
          return this.couch.get(moved.id, function (err, file) {
            should.not.exist(err)
            file.should.have.properties({
              path: '',
              name: dst.path,
              docType: 'file',
              lastModification: dst.lastModification,
              size: 36901,
              binary: {
                file: {
                  id: binary._id,
                  rev: binary._rev
                }
              }
            })
            done()
          })
        })
      })
    })
  )
})
