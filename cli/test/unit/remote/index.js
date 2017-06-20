/* @flow */
/* eslint-env mocha */

import crypto from 'crypto'
import EventEmitter from 'events'
import fs from 'fs'
import path from 'path'
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
import {
  cozy, builders, deleteAll, createTheCouchdbFolder
} from '../../helpers/cozy'

describe('Remote', function () {
  if (process.env.APPVEYOR) {
    it('is unstable on AppVeyor')
    return
  }

  before('instanciate config', configHelpers.createConfig)
  before('register OAuth client', configHelpers.registerClient)
  before('instanciate pouch', pouchHelpers.createDatabase)
  before('instanciate remote', function () {
    this.prep = sinon.createStubInstance(Prep)
    this.events = new EventEmitter()
    this.remote = new Remote(this.config, this.prep, this.pouch, this.events)
  })
  beforeEach(deleteAll)
  beforeEach(createTheCouchdbFolder)
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
      const expectedChecksum = '2NqmrnZqa1zTER40NtPGJg=='
      const fixture = 'test/fixtures/cool-pillow.jpg'

      builders.remoteFile().named('pillow.jpg').contentType('image/jpeg')
        .dataFromFile(fixture).create()
        .then(binary => {
          should(binary.md5sum).equal(expectedChecksum)
          this.remote.createReadStreamAsync(conversion.createMetadata(binary)).then((stream) => {
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
      let md5sum = 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
      let fixture = 'test/fixtures/chat-mignon.jpg'
      let doc = {
        path: 'chat.jpg',
        mime: 'image/jpeg',
        md5sum
      }
      this.remote.other = {
        createReadStreamAsync (localDoc) {
          localDoc.should.equal(doc)
          let stream = fs.createReadStream(fixture)
          return Promise.resolve(stream)
        }
      }
      return this.remote.uploadBinary(doc, (err, binary) => {
        should.not.exist(err)
        binary._id.should.equal(md5sum)
        return this.remote.couch.get(md5sum, function (err, binaryDoc) {
          should.not.exist(err)
          binaryDoc.should.have.properties({
            _id: md5sum,
            md5sum,
            docType: 'Binary'
          })
          should.exist(binaryDoc._attachments)
          binaryDoc._attachments.file.length.should.equal(29865)
          done()
        })
      })
    })

    it('does not reupload an existing file', function (done) {
      let md5sum = 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
      let doc = {
        path: 'chat-bis.jpg',
        mime: 'image/jpeg',
        md5sum
      }
      return this.remote.uploadBinary(doc, function (err, binary) {
        should.not.exist(err)
        binary._id.should.equal(md5sum)
        done()
      })
    })

    it('uploads the file even if a blank binary is present', function (done) {
      let md5sum = '988881adc9fc3655077dc2d4d757d480b5ea0e11'
      let fixture = 'test/fixtures/foobar.txt'
      let doc = {
        path: 'foobar.txt',
        mime: 'text/plain',
        md5sum
      }
      let binary = {
        _id: md5sum,
        docType: 'Binary',
        md5sum
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
        updated_at: '2015-11-12T13:14:32.384Z',
        tags: ['qux'],
        md5sum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30',
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
        updated_at: '2015-11-12T13:14:32.384Z',
        tags: ['qux'],
        md5sum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30',
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
        updated_at: '2015-11-12T13:14:33.384Z',
        tags: ['courge']
      }
      let doc = this.remote.createRemoteDoc(local)
      doc.should.have.properties({
        path: '/foo/bar',
        name: 'baz',
        docType: 'folder',
        updated_at: '2015-11-12T13:14:33.384Z',
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
        updated_at: '2015-11-12T13:14:32.384Z',
        md5sum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
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
        updated_at: '2015-11-12T13:14:32.384Z',
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
        md5sum: '5b1baec8306885df52fdf341efb0087f1a8ac81e',
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
        md5sum: 'b410ffdd571d6e86bb8e8bdd054df91e16dfa75e',
        docType: 'Binary'
      }
      let file = {
        _id: 'A-FILE-WITH-B410',
        path: 'A-FILE-WITH-B410',
        docType: 'file',
        md5sum: 'b410ffdd571d6e86bb8e8bdd054df91e16dfa75e',
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
              doc.md5sum.should.equal(binary.md5sum)
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
        md5sum: '22f7aca0d717eb322d5ae1c97d8aa26eb440287b',
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
        md5sum: 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df',
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
        createReadStreamAsync (localDoc) {
          const stream = fs.createReadStream('test/fixtures/chat-mignon-mod.jpg')
          return Promise.resolve(stream)
        }
      }

      const created = await this.remote.addFileAsync(doc)
      should.exist(doc.remote._id)
      should.exist(doc.remote._rev)

      const file = await cozy.files.statById(created.remote._id)
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

    it('does not reupload an existing file', async function () {
      const backupDir = await builders.remoteDir().named('backup').inRootDir().create()
      await builders.remoteDir().named('ORIGINAL').inRootDir().create()
      let md5sum = 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
      let doc: Object = {
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

      const created = await this.remote.addFileAsync(doc)

      should.exist(doc.remote._id)
      should.exist(doc.remote._rev)
      const file = await cozy.files.statById(created.remote._id)
      should(file.attributes).have.properties({
        dir_id: backupDir._id,
        name: 'cat3.jpg',
        type: 'file',
        updated_at: timestamp.stringify(doc.updated_at),
        size: '36901'
      })
    })
  })

  describe('addFolderAsync', () => {
    it('adds a folder to couchdb', async function () {
      const dateString = '2017-02-14T15:03:27Z'
      let doc: Object = {
        path: path.normalize('couchdb-folder/folder-1'),
        docType: 'folder',
        updated_at: dateString
      }
      const created: Metadata = await this.remote.addFolderAsync(doc)
      should.exist(doc.remote._id)
      should.exist(doc.remote._rev)

      const folder = await cozy.files.statById(created.remote._id)
      should(folder.attributes).have.properties({
        path: '/couchdb-folder/folder-1',
        name: 'folder-1',
        type: 'directory',
        updated_at: dateString
      })
    })

    it('does nothing when the folder already exists', async function () {
      const remoteDir: RemoteDoc = await builders.remoteDir().create()
      const metadata: Metadata = {...conversion.createMetadata(remoteDir), remote: undefined}

      const result: Metadata = await this.remote.addFolderAsync(metadata)

      const folder: JsonApiDoc = await cozy.files.statById(result.remote._id)
      const {path, name, type, updated_at} = remoteDir
      should(folder.attributes).have.properties({path, name, type, updated_at})
      should(metadata.remote).have.properties({
        _id: remoteDir._id,
        _rev: remoteDir._rev
      })
    })
  })

  describe('overwriteFileAsync', function () {
    it('overwrites the binary content', async function () {
      const created = await builders.remoteFile().data('foo').timestamp(2015, 11, 16, 16, 12, 1).create()
      const old = conversion.createMetadata(created)
      const doc: Metadata = {
        ...old,
        _id: created._id,
        md5sum: 'N7UdGUp1E+RbVvZSTy1R8g==',
        updated_at: timestamp.stringify(timestamp.build(2015, 11, 16, 16, 12, 1)),
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
      const created = await builders.remoteFile().data('foo').create()
      const old = conversion.createMetadata(created)
      const doc = {
        ...old,
        md5sum: 'Invalid///////////////=='
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
        md5sum: old.md5sum
      })
    })
  })

  describe('updateFileMetadataAsync', () =>
    xit('updates the updated_at', async function () {
      const dir = await builders.remoteDir().named('dir').create()
      const created = await builders.remoteFile()
        .named('file-7')
        .inDir(dir)
        .data('foo')
        .timestamp(2015, 11, 16, 16, 13, 1)
        .create()

      const doc: Object = {
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
        updated_at: '2015-11-16T16:13:01Z'
      })
      should(doc.remote._rev).equal(file._rev)
    })
  )

  describe('updateFolder', function () {
    it('updates the metadata of a folder', async function () {
      const created: RemoteDoc = await builders.remoteDir()
        .named('old-name')
        .create()
      const old: Metadata = conversion.createMetadata(created)
      const newParentDir: RemoteDoc = await builders.remoteDir()
        .named('new-parent-dir')
        .inRootDir()
        .create()
      const doc: Metadata = {
        ...old,
        path: path.normalize('new-parent-dir/new-name'),
        updated_at: '2017-11-16T16:14:45Z'
      }

      const updated: Metadata = await this.remote.updateFolderAsync(doc, old)

      const folder: JsonApiDoc = await cozy.files.statById(updated.remote._id)
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

    it('creates the dir if it does not exist', async function () {
      const parentDir: RemoteDoc = await builders.remoteDir()
        .named('parent-dir')
        .create()
      const deletedDir: RemoteDoc = await builders.remoteDir()
        .named('deleted-dir')
        .inDir(parentDir)
        .timestamp(2016, 1, 2, 3, 4, 5)
        .create()
      const oldMetadata: Metadata = conversion.createMetadata(deletedDir)
      const newMetadata: Metadata = {
        ...oldMetadata,
        name: 'new-dir-name',
        path: path.normalize('parent-dir/new-dir-name')
      }
      await cozy.files.destroyById(deletedDir._id)

      await this.remote.updateFolderAsync(newMetadata, oldMetadata)

      const created: JsonApiDoc = await cozy.files.statByPath('/parent-dir/new-dir-name')
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

    it('creates the dir if it has no remote info', async function () {
      const oldMetadata: Metadata = {
        ...conversion.createMetadata(builders.remoteDir().named('foo').build()),
        remote: undefined,
        updated_at: timestamp.stringify(timestamp.build(2015, 1, 1, 1, 1, 1))
      }
      const newMetadata: Metadata = {
        ...oldMetadata,
        updated_at: timestamp.stringify(timestamp.build(2015, 2, 2, 2, 2, 2))
      }

      const created: Metadata = await this.remote.updateFolderAsync(newMetadata, oldMetadata)

      const folder: JsonApiDoc = await cozy.files.statById(created.remote._id)
      should(folder.attributes).have.properties({
        type: 'directory',
        name: 'foo',
        dir_id: 'io.cozy.files.root-dir',
        updated_at: newMetadata.updated_at,
        tags: newMetadata.tags
      })
    })
  })

  describe('moveFile', () => {
    it('moves the file', async function () {
      const remoteDoc: RemoteDoc = await builders
        .remoteFile()
        .named('cat6.jpg')
        .data('meow')
        .create()
      const old: Metadata = conversion.createMetadata(remoteDoc)
      const doc: Metadata = {
        ...old,
        path: path.normalize('moved-to/cat7.jpg'),
        name: 'cat7.jpg',
        remote: undefined
      }
      const newDir: RemoteDoc = await builders.remoteDir()
        .named('moved-to')
        .inRootDir()
        .create()

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
        updated_at: doc.updated_at,
        size: '4'
      })
    })
  })

  xdescribe('moveFolder', function () {
    // it('moves the folder in couchdb', function (done) {
    //   return couchHelpers.createFolder(this.couch, 4, (_, created) => {
    //     let doc = {
    //       path: 'couchdb-folder/folder-5',
    //       docType: 'folder',
    //       updated_at: new Date(),
    //       remote: {
    //         _id: created.id,
    //         _rev: created.rev
    //       }
    //     }
    //     let old = {
    //       path: 'couchdb-folder/folder-4',
    //       docType: 'folder',
    //       remote: {
    //         _id: created.id,
    //         _rev: created.rev
    //       }
    //     }
    //     return this.remote.moveFolder(doc, old, (err, created) => {
    //       should.not.exist(err)
    //       return this.couch.get(created.id, function (err, folder) {
    //         should.not.exist(err)
    //         folder.should.have.properties({
    //           path: '/couchdb-folder',
    //           name: 'folder-5',
    //           docType: 'folder',
    //           updated_at: doc.updated_at.toISOString()
    //         })
    //         done()
    //       })
    //     })
    //   })
    // })

    it('adds a folder to couchdb if the folder does not exist', function (done) {
      let doc = {
        path: 'couchdb-folder/folder-7',
        docType: 'folder',
        updated_at: new Date()
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
            updated_at: doc.updated_at.toISOString()
          })
          done()
        })
      }
            )
    })
  })

  describe('trash', () =>
    it('moves the file or folder to the Cozy trash', async function () {
      const folder = await builders.remoteDir().create()
      const doc = conversion.createMetadata(folder)

      await this.remote.trashAsync(doc)

      const trashed = await cozy.files.statById(doc.remote._id)
      should(trashed).have.propertyByPath('attributes', 'dir_id').eql(TRASH_DIR_ID)
    })
  )

  describe('deleteFolderAsync', () => {
    it('deletes permanently an empty folder', async function () {
      const folder = await builders.remoteDir().create()
      const doc = conversion.createMetadata(folder)

      await this.remote.deleteFolderAsync(doc)

      await should(cozy.files.statById(doc.remote._id))
        .be.rejectedWith({status: 404})
    })

    it('trashes a non-empty folder', async function () {
      const dir = await builders.remoteDir().create()
      const doc = conversion.createMetadata(dir)
      await builders.remoteDir().inDir(dir).create()

      await this.remote.deleteFolderAsync(doc)

      const trashed = await cozy.files.statById(doc.remote._id)
      should(trashed).have.propertyByPath('attributes', 'dir_id').eql(TRASH_DIR_ID)
    })

    it('does not swallow other trash errors', async function () {
      const doc = {path: 'whatever', remote: {_id: 'missing'}}

      await should(this.remote.deleteFolderAsync(doc))
        .be.rejectedWith({status: 404})
    })
  })

  xdescribe('resolveConflict', () =>
    it('renames the file/folder', function (done) {
      let md5sum = 'fc7e0b72b8e64eb05e05aef652d6bbed950f85df'
      let binary = {
        _id: md5sum,
        _rev: '1-0123456789'
      }
      let src: Object = {
        path: 'cat9.jpg',
        docType: 'file',
        md5sum,
        updated_at: new Date().toISOString(),
        size: 36901
      }
      let dst = {
        path: 'cat-conflict-2015-12-01T01:02:03Z.jpg',
        docType: 'file',
        md5sum,
        updated_at: src.updated_at,
        size: 36901
      }
      let remoteDoc = this.remote.createRemoteDoc(src, {binary})
      return this.couch.put(remoteDoc, (err, created) => {
        should.not.exist(err)
        src.remote = {
          _id: created.id,
          _rev: created.rev,
          binary: {
            _id: md5sum,
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
              updated_at: dst.updated_at,
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
