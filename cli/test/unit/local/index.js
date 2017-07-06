/* eslint-env mocha */

import Promise from 'bluebird'
import crypto from 'crypto'
import fs from 'fs-extra'
import path from 'path'
import sinon from 'sinon'
import should from 'should'
import { Readable } from 'stream'

import Local from '../../../src/local'
import { TMP_DIR_NAME } from '../../../src/local/constants'
import { PendingMap } from '../../../src/utils/pending'

import MetadataBuilders from '../../builders/metadata'
import configHelpers from '../../helpers/config'
import pouchHelpers from '../../helpers/pouch'

Promise.promisifyAll(fs)

describe('Local', function () {
  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  before('instanciate local', function () {
    this.prep = {}
    this.events = {}
    this.local = new Local(this.config, this.prep, this.pouch, this.events)
    this.local.watcher.pending = new PendingMap()

    // Helpers
    this.path = (doc) => path.join(this.syncPath, doc.path)
    this.exists = (doc) => fs.existsSync(this.path(doc))
    this.writeFile = (doc) => { fs.writeFileSync(this.path(doc), '') }
    this.ensureDir = (doc) => { fs.ensureDirSync(this.path(doc)) }
    this.unlink = (doc) => fs.unlinkSync(this.path(doc))
    this.rmdir = (doc) => fs.rmdirSync(this.path(doc))
  })
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('constructor', function () {
    it('has a base path', function () {
      this.local.syncPath.should.equal(this.syncPath)
    })

    it('has a tmp path', function () {
      let tmpPath = path.join(this.syncPath, TMP_DIR_NAME)
      this.local.tmpPath.should.equal(tmpPath)
    })
  })

  describe('createReadStream', function () {
    it('throws an error if no file for this document', function (done) {
      let doc = {path: 'no-such-file'}
      this.local.createReadStreamAsync(doc).catch((err) => {
        should.exist(err)
        done()
      })
    })

    it('creates a readable stream for the document', function (done) {
      let src = path.join(__dirname, '../../fixtures/chat-mignon.jpg')
      let dst = path.join(this.syncPath, 'read-stream.jpg')
      fs.copySync(src, dst)
      let doc = {
        path: 'read-stream.jpg',
        md5sum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
      }
      this.local.createReadStreamAsync(doc).then((stream) => {
        should.exist(stream)
        let checksum = crypto.createHash('sha1')
        checksum.setEncoding('hex')
        stream.pipe(checksum)
        stream.on('end', function () {
          checksum.end()
          checksum.read().should.equal(doc.md5sum)
          done()
        })
      })
    })
  })

  describe('metadataUpdater', function () {
    it('chmod +x for an executable file', function (done) {
      let date = new Date('2015-11-09T05:06:07Z')
      let filePath = path.join(this.syncPath, 'exec-file')
      fs.ensureFileSync(filePath)
      let updater = this.local.metadataUpdater({
        path: 'exec-file',
        updated_at: date,
        executable: true
      })
      updater(function (err) {
        should.not.exist(err)
        let mode = +fs.statSync(filePath).mode
        if (process.platform === 'win32') {
          (mode & 0o100).should.equal(0)
        } else {
          (mode & 0o100).should.not.equal(0)
        }
        done()
      })
    })

    it('updates mtime for a file', function (done) {
      let date = new Date('2015-10-09T05:06:07Z')
      let filePath = path.join(this.syncPath, 'utimes-file')
      fs.ensureFileSync(filePath)
      let updater = this.local.metadataUpdater({
        path: 'utimes-file',
        updated_at: date
      })
      updater(function (err) {
        should.not.exist(err)
        let mtime = +fs.statSync(filePath).mtime
        mtime.should.equal(+date)
        done()
      })
    })

    it('updates mtime for a directory', function (done) {
      let date = new Date('2015-10-09T05:06:07Z')
      let folderPath = path.join(this.syncPath, 'utimes-folder')
      fs.ensureDirSync(folderPath)
      let updater = this.local.metadataUpdater({
        path: 'utimes-folder',
        updated_at: date
      })
      updater(function (err) {
        should.not.exist(err)
        let mtime = +fs.statSync(folderPath).mtime
        mtime.should.equal(+date)
        done()
      })
    })
  })

  xdescribe('isUpToDate', () =>
    it('says if the local file is up to date', function () {
      let doc = {
        _id: 'foo/bar',
        _rev: '1-0123456',
        path: 'foo/bar',
        docType: 'file',
        md5sum: '22f7aca0d717eb322d5ae1c97d8aa26eb440287b',
        sides: {
          remote: 1
        }
      }
      this.local.isUpToDate(doc).should.be.false()
      doc.sides.local = 2
      doc._rev = '2-0123456'
      this.local.isUpToDate(doc).should.be.true()
      doc.sides.remote = 3
      doc._rev = '3-0123456'
      this.local.isUpToDate(doc).should.be.false()
    })
  )

  describe('fileExistsLocally', () =>
    it('checks file existence as a binary in the db and on disk', function (done) {
      let filePath = path.resolve(this.syncPath, 'folder', 'testfile')
      this.local.fileExistsLocally('deadcafe', (err, exist) => {
        should.not.exist(err)
        exist.should.not.be.ok()
        fs.ensureFileSync(filePath)
        let doc = {
          _id: 'folder/testfile',
          path: 'folder/testfile',
          docType: 'file',
          md5sum: 'deadcafe',
          sides: {
            local: 1
          }
        }
        this.pouch.db.put(doc, err => {
          should.not.exist(err)
          this.local.fileExistsLocally('deadcafe', function (err, exist) {
            should.not.exist(err)
            exist.should.be.equal(filePath)
            done()
          })
        })
      })
    })
  )

  describe('addFile', function () {
    it('creates the file by downloading it', function (done) {
      this.events.emit = sinon.spy()
      let doc = {
        path: 'files/file-from-remote',
        updated_at: new Date('2015-10-09T04:05:06Z'),
        md5sum: 'OFj2IjCsPJFfMAxmQxLGPw=='
      }
      this.local.other = {
        createReadStreamAsync (docToStream) {
          docToStream.should.equal(doc)
          let stream = new Readable()
          stream._read = function () {}
          setTimeout(function () {
            stream.push('foobar')
            stream.push(null)
          }, 100)
          return Promise.resolve(stream)
        }
      }
      let filePath = path.join(this.syncPath, doc.path)
      this.local.addFile(doc, err => {
        this.local.other = null
        should.not.exist(err)
        fs.statSync(filePath).isFile().should.be.true()
        let content = fs.readFileSync(filePath, {encoding: 'utf-8'})
        content.should.equal('foobar')
        let mtime = +fs.statSync(filePath).mtime
        mtime.should.equal(+doc.updated_at)
        done()
      })
    })

    it('creates the file from another file with same checksum', function (done) {
      let doc = {
        path: 'files/file-with-same-checksum',
        updated_at: new Date('2015-10-09T04:05:07Z'),
        md5sum: 'qwesux5JaAGTet+nckJL9w=='
      }
      let alt = path.join(this.syncPath, 'files', 'my-checkum-is-456')
      fs.writeFileSync(alt, 'foo bar baz')
      let stub = sinon.stub(this.local, 'fileExistsLocally').yields(null, alt)
      let filePath = path.join(this.syncPath, doc.path)
      this.local.addFile(doc, function (err) {
        stub.restore()
        stub.calledWith(doc.md5sum).should.be.true()
        should.not.exist(err)
        fs.statSync(filePath).isFile().should.be.true()
        let content = fs.readFileSync(filePath, {encoding: 'utf-8'})
        content.should.equal('foo bar baz')
        let mtime = +fs.statSync(filePath).mtime
        mtime.should.equal(+doc.updated_at)
        done()
      })
    })

    it('can create a file in the root', function (done) {
      let doc = {
        path: 'file-in-root',
        updated_at: new Date('2015-10-09T04:05:19Z'),
        md5sum: 'gDOOedLKm5wJDrqqLvKTxw=='
      }
      this.local.other = {
        createReadStreamAsync (docToStream) {
          docToStream.should.equal(doc)
          let stream = new Readable()
          stream._read = function () {}
          setTimeout(function () {
            stream.push('foobaz')
            stream.push(null)
          }, 100)
          return Promise.resolve(stream)
        }
      }
      let filePath = path.join(this.syncPath, doc.path)
      this.local.addFile(doc, err => {
        this.local.other = null
        should.not.exist(err)
        fs.statSync(filePath).isFile().should.be.true()
        let content = fs.readFileSync(filePath, {encoding: 'utf-8'})
        content.should.equal('foobaz')
        let mtime = +fs.statSync(filePath).mtime
        mtime.should.equal(+doc.updated_at)
        done()
      })
    })

    it('aborts when the download is incorrect', function (done) {
      this.events.emit = sinon.spy()
      let doc = {
        path: 'files/file-from-remote-2',
        updated_at: new Date('2015-10-09T04:05:16Z'),
        md5sum: '8843d7f92416211de9ebb963ff4ce28125932878'
      }
      this.local.other = {
        createReadStreamAsync (docToStream) {
          docToStream.should.equal(doc)
          let stream = new Readable()
          stream._read = function () {}
          setTimeout(function () {
            stream.push('foo')
            stream.push(null)
          }, 100)
          return Promise.resolve(stream)
        }
      }
      let filePath = path.join(this.syncPath, doc.path)
      this.local.addFile(doc, err => {
        this.local.other = null
        should.exist(err)
        err.message.should.equal('Invalid checksum')
        fs.existsSync(filePath).should.be.false()
        done()
      })
    })
  })

  describe('addFolder', function () {
    it('creates the folder', function (done) {
      let doc = {
        path: 'parent/folder-to-create',
        updated_at: new Date('2015-10-09T05:06:08Z')
      }
      let folderPath = path.join(this.syncPath, doc.path)
      this.local.addFolder(doc, function (err) {
        should.not.exist(err)
        fs.statSync(folderPath).isDirectory().should.be.true()
        let mtime = +fs.statSync(folderPath).mtime
        mtime.should.equal(+doc.updated_at)
        done()
      })
    })

    it('updates mtime if the folder already exists', function (done) {
      let doc = {
        path: 'parent/folder-to-create',
        updated_at: new Date('2015-10-09T05:06:08Z')
      }
      let folderPath = path.join(this.syncPath, doc.path)
      fs.ensureDirSync(folderPath)
      this.local.addFolder(doc, function (err) {
        should.not.exist(err)
        fs.statSync(folderPath).isDirectory().should.be.true()
        let mtime = +fs.statSync(folderPath).mtime
        mtime.should.equal(+doc.updated_at)
        done()
      })
    })
  })

  describe('overwriteFile', () => {
    it('writes the new content of a file', function (done) {
      this.events.emit = sinon.spy()
      let doc = {
        path: 'a-file-to-overwrite',
        docType: 'file',
        updated_at: new Date('2015-10-09T05:06:07Z'),
        md5sum: 'PiWWCnnbxptnTNTsZ6csYg=='
      }
      this.local.other = {
        createReadStreamAsync (docToStream) {
          docToStream.should.equal(doc)
          let stream = new Readable()
          stream._read = function () {}
          setTimeout(function () {
            stream.push('Hello world')
            stream.push(null)
          }, 100)
          return Promise.resolve(stream)
        }
      }
      let filePath = path.join(this.syncPath, doc.path)
      fs.writeFileSync(filePath, 'old content')
      this.local.overwriteFileAsync(doc, {}).then(() => {
        this.local.other = null
        fs.statSync(filePath).isFile().should.be.true()
        let content = fs.readFileSync(filePath, {encoding: 'utf-8'})
        content.should.equal('Hello world')
        let mtime = +fs.statSync(filePath).mtime
        mtime.should.equal(+doc.updated_at)
        done()
      })
    })
  })

  describe('updateFileMetadata', () => {
    it('updates metadata', function (done) {
      let doc = {
        path: 'file-to-update',
        docType: 'file',
        updated_at: new Date('2015-11-10T05:06:07Z')
      }
      let filePath = path.join(this.syncPath, doc.path)
      fs.ensureFileSync(filePath)
      this.local.updateFileMetadata(doc, {}, function (err) {
        should.not.exist(err)
        fs.existsSync(filePath).should.be.true()
        let mtime = +fs.statSync(filePath).mtime
        mtime.should.equal(+doc.updated_at)
        done()
      })
    })
  })

  describe('updateFolder', () => {
    it('calls addFolder', function (done) {
      let doc = {
        path: 'a-folder-to-update',
        docType: 'folder',
        updated_at: new Date()
      }
      sinon.stub(this.local, 'addFolderAsync').resolves()
      this.local.updateFolderAsync(doc, {}).then(() => {
        this.local.addFolderAsync.calledWith(doc).should.be.true()
        this.local.addFolderAsync.restore()
        done()
      })
    })
  })

  describe('moveFile', function () {
    it('moves the file', function (done) {
      let old = {
        path: 'old-parent/file-to-move',
        updated_at: new Date('2016-10-08T05:05:09Z')
      }
      let doc = {
        path: 'new-parent/file-moved',
        updated_at: new Date('2015-10-09T05:05:10Z')
      }
      let oldPath = path.join(this.syncPath, old.path)
      let newPath = path.join(this.syncPath, doc.path)
      fs.ensureDirSync(path.dirname(oldPath))
      fs.writeFileSync(oldPath, 'foobar')
      this.local.moveFile(doc, old, function (err) {
        should.not.exist(err)
        fs.existsSync(oldPath).should.be.false()
        fs.statSync(newPath).isFile().should.be.true()
        let mtime = +fs.statSync(newPath).mtime
        mtime.should.equal(+doc.updated_at)
        let enc = {encoding: 'utf-8'}
        fs.readFileSync(newPath, enc).should.equal('foobar')
        done()
      })
    })

    it('creates the file is the current file is missing', function (done) {
      let old = {
        path: 'old-parent/missing-file',
        updated_at: new Date('2016-10-08T05:05:11Z')
      }
      let doc = {
        path: 'new-parent/recreated-file',
        updated_at: new Date('2015-10-09T05:05:12Z')
      }
      let stub = sinon.stub(this.local, 'addFile').yields()
      this.local.moveFile(doc, old, function (err) {
        stub.restore()
        stub.calledWith(doc).should.be.true()
        should.not.exist(err)
        done()
      })
    })

    it('does nothing if the file has already been moved', function (done) {
      let old = {
        path: 'old-parent/already-moved',
        updated_at: new Date('2016-10-08T05:05:11Z')
      }
      let doc = {
        path: 'new-parent/already-here',
        updated_at: new Date('2015-10-09T05:05:12Z')
      }
      let newPath = path.join(this.syncPath, doc.path)
      fs.ensureDirSync(path.dirname(newPath))
      fs.writeFileSync(newPath, 'foobar')
      let stub = sinon.stub(this.local, 'addFile').yields()
      this.local.moveFile(doc, old, function (err) {
        stub.restore()
        stub.calledWith(doc).should.be.false()
        should.not.exist(err)
        let enc = {encoding: 'utf-8'}
        fs.readFileSync(newPath, enc).should.equal('foobar')
        done()
      })
    })

    it('adds the file back when it was restored', async function () {
      const old = {path: '.cozy_trash/restored-file'}
      const doc = {path: 'restored-file'}
      this.local.other = {
        createReadStreamAsync (docToStream) {
          const stream = new Readable()
          stream._read = function () {}
          stream.push(null)
          return Promise.resolve(stream)
        }
      }

      await should(this.local.moveFileAsync(doc, old)).be.fulfilled()

      should(this.exists(old)).be.false()
      should(this.exists(doc)).be.true()

      this.unlink(doc)
    })
  })

  xdescribe('moveFolder', function () {
    it('moves the folder', function (done) {
      let old = {
        path: 'old-parent/folder-to-move',
        docType: 'folder',
        updated_at: new Date('2016-10-08T05:06:09Z')
      }
      let doc = {
        path: 'new-parent/folder-moved',
        docType: 'folder',
        updated_at: new Date('2015-10-09T05:06:10Z')
      }
      let oldPath = path.join(this.syncPath, old.path)
      let folderPath = path.join(this.syncPath, doc.path)
      fs.ensureDirSync(oldPath)
      this.local.moveFolder(doc, old, function (err) {
        should.not.exist(err)
        fs.existsSync(oldPath).should.be.false()
        fs.statSync(folderPath).isDirectory().should.be.true()
        let mtime = +fs.statSync(folderPath).mtime
        mtime.should.equal(+doc.updated_at)
        done()
      })
    })

    it('creates the folder is the current directory is missing', function (done) {
      let old = {
        path: 'old-parent/missing-folder',
        docType: 'folder',
        updated_at: new Date('2016-10-08T05:06:09Z')
      }
      let doc = {
        path: 'new-parent/recreated-folder',
        docType: 'folder',
        updated_at: new Date('2015-10-09T05:06:10Z')
      }
      let folderPath = path.join(this.syncPath, doc.path)
      this.local.moveFolder(doc, old, function (err) {
        should.not.exist(err)
        fs.statSync(folderPath).isDirectory().should.be.true()
        let mtime = +fs.statSync(folderPath).mtime
        mtime.should.equal(+doc.updated_at)
        done()
      })
    })

    it('does nothing if the folder has already been moved', function (done) {
      let old = {
        path: 'old-parent/folder-already-moved',
        updated_at: new Date('2016-10-08T05:05:11Z')
      }
      let doc = {
        path: 'new-parent/folder-already-here',
        updated_at: new Date('2015-10-09T05:05:12Z')
      }
      let newPath = path.join(this.syncPath, doc.path)
      fs.ensureDirSync(newPath)
      let stub = sinon.stub(this.local, 'addFolder').yields()
      this.local.moveFolder(doc, old, function (err) {
        should.not.exist(err)
        stub.restore()
        stub.calledWith(doc).should.be.false()
        fs.statSync(newPath).isDirectory().should.be.true()
        done()
      })
    })

    it('remove the old directory if everything has been moved', function (done) {
      let old = {
        path: 'old-parent/folder-already-moved',
        updated_at: new Date('2016-10-08T05:05:11Z')
      }
      let doc = {
        path: 'new-parent/folder-already-here',
        updated_at: new Date('2015-10-09T05:05:12Z')
      }
      let oldPath = path.join(this.syncPath, old.path)
      let newPath = path.join(this.syncPath, doc.path)
      fs.ensureDirSync(oldPath)
      fs.ensureDirSync(newPath)
      let stub = sinon.stub(this.local, 'addFolder').yields()
      this.local.moveFolder(doc, old, function (err) {
        should.not.exist(err)
        stub.restore()
        stub.calledWith(doc).should.be.false()
        fs.existsSync(oldPath).should.be.false()
        fs.statSync(newPath).isDirectory().should.be.true()
        done()
      })
    })

    it('adds the folder back when it was restored', async function () {
      const old = {path: '.cozy_trash/restored-folder'}
      const doc = {path: 'restored-folder'}

      await should(this.local.moveFolderAsync(doc, old)).be.fulfilled()

      should(this.exists(old)).be.false()
      should(this.exists(doc)).be.true()

      this.rmdir(doc)
    })
  })

  describe('trash', () => {
    it('deletes a file from the local filesystem', function (done) {
      let doc = {
        _id: 'FILE-TO-DELETE',
        path: 'FILE-TO-DELETE',
        docType: 'file'
      }
      let filePath = path.join(this.syncPath, doc.path)
      fs.ensureFileSync(filePath)
      this.pouch.db.put(doc, (err, inserted) => {
        should.not.exist(err)
        doc._rev = inserted.rev
        this.pouch.db.remove(doc, err => {
          should.not.exist(err)
          this.local.trashAsync(doc).then(() => {
            fs.existsSync(filePath).should.be.false()
            done()
          })
        })
      })
    })

    it('deletes a folder from the local filesystem', function (done) {
      let doc = {
        _id: 'FOLDER-TO-DELETE',
        path: 'FOLDER-TO-DELETE',
        docType: 'folder'
      }
      let folderPath = path.join(this.syncPath, doc.path)
      fs.ensureDirSync(folderPath)
      this.pouch.db.put(doc, (err, inserted) => {
        should.not.exist(err)
        doc._rev = inserted.rev
        this.pouch.db.remove(doc, err => {
          should.not.exist(err)
          this.local.trashAsync(doc).then(() => {
            fs.existsSync(folderPath).should.be.false()
            done()
          })
        })
      })
    })
  })

  describe('deleteFolderAsync', () => {
    let builders, fullPath

    beforeEach(function () {
      builders = new MetadataBuilders(this.pouch)
      fullPath = (doc) => path.join(this.syncPath, doc.path)

      this.events.emit = sinon.spy()
      sinon.spy(this.local, 'trashAsync')
    })

    afterEach(function () {
      this.local.trashAsync.restore()
    })

    it('deletes an empty folder', async function () {
      const doc = builders.dirMetadata().build()
      await fs.emptyDirAsync(fullPath(doc))

      await this.local.deleteFolderAsync(doc)

      should(await fs.pathExistsAsync(fullPath(doc))).be.false()
      should(this.events.emit.args).deepEqual([
        ['delete-file', doc]
      ])
    })

    it('trashes a non-empty folder (ENOTEMPTY)', async function () {
      const doc = builders.dirMetadata().build()
      await fs.ensureDirAsync(path.join(fullPath(doc), 'something-inside'))

      await this.local.deleteFolderAsync(doc)

      should(await fs.pathExistsAsync(fullPath(doc))).be.false()
      should(this.local.trashAsync.args).deepEqual([
        [doc]
      ])
    })

    it('does not swallow fs errors', async function () {
      const doc = builders.dirMetadata().build()

      await should(this.local.deleteFolderAsync(doc))
        .be.rejectedWith(/ENOENT/)
    })

    it('throws when given non-folder metadata', async function () {
      // TODO: FileMetadataBuilder
      const doc = {path: 'FILE-TO-DELETE', docType: 'file'}
      await fs.ensureFileAsync(fullPath(doc))

      await should(this.local.deleteFolderAsync(doc))
        .be.rejectedWith(/metadata/)
    })
  })

  describe('resolveConflict', () =>
    it('renames the file', function (done) {
      let src = {
        path: 'conflict/file',
        updated_at: new Date('2015-10-08T05_05_09Z')
      }
      let dst = {
        path: 'conflict/file-conflict-2015-10-09T05_05_10Z',
        updated_at: new Date('2015-10-09T05:05:10Z')
      }
      let srcPath = path.join(this.syncPath, src.path)
      let dstPath = path.join(this.syncPath, dst.path)
      fs.ensureDirSync(path.dirname(srcPath))
      fs.writeFileSync(srcPath, 'foobar')
      this.local.resolveConflict(dst, src, function (err) {
        should.not.exist(err)
        fs.existsSync(srcPath).should.be.false()
        fs.statSync(dstPath).isFile().should.be.true()
        let enc = {encoding: 'utf-8'}
        fs.readFileSync(dstPath, enc).should.equal('foobar')
        done()
      })
    })
  )
})
