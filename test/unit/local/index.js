/* eslint-env mocha */

const Promise = require('bluebird')
const crypto = require('crypto')
const fs = require('fs-extra')
const path = require('path')
const sinon = require('sinon')
const should = require('should')
const { Readable } = require('stream')

const Local = require('../../../core/local')
const { TMP_DIR_NAME } = require('../../../core/local/constants')
const { PendingMap } = require('../../../core/utils/pending')

const MetadataBuilders = require('../../support/builders/metadata')
const StreamBuilder = require('../../support/builders/stream')
const configHelpers = require('../../support/helpers/config')
const { ContextDir } = require('../../support/helpers/context_dir')
const pouchHelpers = require('../../support/helpers/pouch')

Promise.promisifyAll(fs)

describe('Local', function () {
  let syncDir

  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  before('instanciate local', function () {
    this.prep = {}
    this.events = {}
    this.local = new Local(this.config, this.prep, this.pouch, this.events)
    this.local.watcher.pending = new PendingMap()

    syncDir = new ContextDir(this.syncPath)
  })
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('constructor', function () {
    it('has a base path', function () {
      this.local.syncPath.should.equal(this.syncPath)
    })

    it('has a tmp path', function () {
      let tmpPath = syncDir.abspath(TMP_DIR_NAME)
      this.local.tmpPath.should.equal(tmpPath)
    })
  })

  describe('createReadStream', function () {
    it('throws an error if no file for this document', async function () {
      let doc = {path: 'no-such-file'}
      await should(this.local.createReadStreamAsync(doc)).be.rejectedWith(/ENOENT/)
    })

    it('creates a readable stream for the document', function (done) {
      let src = path.join(__dirname, '../../fixtures/chat-mignon.jpg')
      let dst = syncDir.abspath('read-stream.jpg')
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
      let filePath = syncDir.abspath('exec-file')
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
      let filePath = syncDir.abspath('utimes-file')
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
      let folderPath = syncDir.abspath('utimes-folder')
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

  describe('inodeSetter', () => {
    let fullPath

    beforeEach(() => {
      fullPath = (doc) => syncDir.abspath(doc.path)
    })

    it('sets ino for a file', function (done) {
      const doc = {path: 'file-needs-ino'}
      fs.ensureFileSync(fullPath(doc))
      const inodeSetter = this.local.inodeSetter(doc)
      inodeSetter(err => {
        should.not.exist(err)
        should(doc.ino).be.a.Number()
        done()
      })
    })

    it('sets ino for a directory', function (done) {
      const doc = {path: 'dir-needs-ino'}
      fs.ensureDirSync(fullPath(doc))
      const inodeSetter = this.local.inodeSetter(doc)
      inodeSetter(err => {
        should.not.exist(err)
        should(doc.ino).be.a.Number()
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
    it('checks file existence as a binary in the db and on disk', async function () {
      let filePath = path.resolve(this.syncPath, 'folder', 'testfile')
      let exist = await this.local.fileExistsLocallyAsync('deadcafe')
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
      this.pouch.db.put(doc)
      exist = await this.local.fileExistsLocallyAsync('deadcafe')
      exist.should.be.equal(filePath)
    })
  )

  describe('addFile', function () {
    it('creates the file by downloading it', async function () {
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
      let filePath = syncDir.abspath(doc.path)
      await this.local.addFileAsync(doc)
      this.local.other = null
      fs.statSync(filePath).isFile().should.be.true()
      let content = fs.readFileSync(filePath, {encoding: 'utf-8'})
      content.should.equal('foobar')
      let mtime = +fs.statSync(filePath).mtime
      mtime.should.equal(+doc.updated_at)
      should(doc.ino).be.a.Number()
    })

    it('creates the file from another file with same checksum', async function () {
      let doc = {
        path: 'files/file-with-same-checksum',
        updated_at: new Date('2015-10-09T04:05:07Z'),
        md5sum: 'qwesux5JaAGTet+nckJL9w=='
      }
      let alt = syncDir.abspath('files/my-checkum-is-456')
      fs.writeFileSync(alt, 'foo bar baz')
      let stub = sinon.stub(this.local, 'fileExistsLocally').yields(null, alt)
      let filePath = syncDir.abspath(doc.path)
      await this.local.addFileAsync(doc)
      stub.restore()
      stub.calledWith(doc.md5sum).should.be.true()
      fs.statSync(filePath).isFile().should.be.true()
      let content = fs.readFileSync(filePath, {encoding: 'utf-8'})
      content.should.equal('foo bar baz')
      let mtime = +fs.statSync(filePath).mtime
      mtime.should.equal(+doc.updated_at)
    })

    it('can create a file in the root', async function () {
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
      let filePath = syncDir.abspath(doc.path)
      await this.local.addFileAsync(doc)
      this.local.other = null
      fs.statSync(filePath).isFile().should.be.true()
      let content = fs.readFileSync(filePath, {encoding: 'utf-8'})
      content.should.equal('foobaz')
      let mtime = +fs.statSync(filePath).mtime
      mtime.should.equal(+doc.updated_at)
    })

    it('aborts when the download is incorrect', async function () {
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
      let filePath = syncDir.abspath(doc.path)
      await should(this.local.addFileAsync(doc))
        .be.rejectedWith('Invalid checksum')
      this.local.other = null
      fs.existsSync(filePath).should.be.false()
    })
  })

  describe('addFolder', function () {
    it('creates the folder', async function () {
      let doc = {
        path: 'parent/folder-to-create',
        updated_at: new Date('2015-10-09T05:06:08Z')
      }
      let folderPath = syncDir.abspath(doc.path)
      await this.local.addFolderAsync(doc)
      fs.statSync(folderPath).isDirectory().should.be.true()
      let mtime = +fs.statSync(folderPath).mtime
      mtime.should.equal(+doc.updated_at)
      should(doc.ino).be.a.Number()
    })

    it('updates mtime if the folder already exists', async function () {
      let doc = {
        path: 'parent/folder-to-create',
        updated_at: new Date('2015-10-09T05:06:08Z')
      }
      let folderPath = syncDir.abspath(doc.path)
      fs.ensureDirSync(folderPath)
      await this.local.addFolderAsync(doc)
      fs.statSync(folderPath).isDirectory().should.be.true()
      let mtime = +fs.statSync(folderPath).mtime
      mtime.should.equal(+doc.updated_at)
    })
  })

  describe('overwriteFile', () => {
    it('writes the new content of a file', async function () {
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
      let filePath = syncDir.abspath(doc.path)
      fs.writeFileSync(filePath, 'old content')
      await this.local.overwriteFileAsync(doc, {})
      this.local.other = null
      fs.statSync(filePath).isFile().should.be.true()
      let content = fs.readFileSync(filePath, {encoding: 'utf-8'})
      content.should.equal('Hello world')
      let mtime = +fs.statSync(filePath).mtime
      mtime.should.equal(+doc.updated_at)
    })
  })

  describe('updateFileMetadata', () => {
    it('updates metadata', async function () {
      let doc = {
        path: 'file-to-update',
        docType: 'file',
        updated_at: new Date('2015-11-10T05:06:07Z')
      }
      let filePath = syncDir.abspath(doc.path)
      fs.ensureFileSync(filePath)
      await this.local.updateFileMetadataAsync(doc, {})
      fs.existsSync(filePath).should.be.true()
      let mtime = +fs.statSync(filePath).mtime
      mtime.should.equal(+doc.updated_at)
    })
  })

  describe('updateFolder', () => {
    it('calls addFolder', async function () {
      let doc = {
        path: 'a-folder-to-update',
        docType: 'folder',
        updated_at: new Date()
      }
      sinon.stub(this.local, 'addFolderAsync').resolves()
      await this.local.updateFolderAsync(doc, {})
      this.local.addFolderAsync.calledWith(doc).should.be.true()
      this.local.addFolderAsync.restore()
    })
  })

  describe('moveFile', function () {
    it('moves the file', async function () {
      let old = {
        path: 'old-parent/file-to-move',
        updated_at: new Date('2016-10-08T05:05:09Z')
      }
      let doc = {
        path: 'new-parent/file-moved',
        updated_at: new Date('2015-10-09T05:05:10Z')
      }
      let oldPath = syncDir.abspath(old.path)
      let newPath = syncDir.abspath(doc.path)
      fs.ensureDirSync(path.dirname(oldPath))
      fs.writeFileSync(oldPath, 'foobar')
      await this.local.moveFileAsync(doc, old)
      fs.existsSync(oldPath).should.be.false()
      fs.statSync(newPath).isFile().should.be.true()
      let mtime = +fs.statSync(newPath).mtime
      mtime.should.equal(+doc.updated_at)
      let enc = {encoding: 'utf-8'}
      fs.readFileSync(newPath, enc).should.equal('foobar')
    })

    it('also updates it when md5sum has changed', async function () {
      const old = {
        path: 'meow.txt',
        md5sum: 'SkvkDJasYxTpHZPzgEOmNA=='
      }
      await syncDir.outputFile(old, 'meow')
      const doc = {
        path: 'woof.txt',
        md5sum: 'j9tggB6dOaUoaqAd0fT08w=='
      }
      this.local.other = {
        async createReadStreamAsync (doc) {
          return new StreamBuilder().push('woof').build()
        }
      }

      await this.local.moveFileAsync(doc, old)

      should(syncDir.existsSync(old)).be.false()
      should(syncDir.existsSync(doc)).be.true()
      should(await syncDir.readFile(doc)).equal('woof')

      syncDir.unlink(doc)
    })

    it('creates the file is the current file is missing', async function () {
      let old = {
        path: 'old-parent/missing-file',
        updated_at: new Date('2016-10-08T05:05:11Z')
      }
      let doc = {
        path: 'new-parent/recreated-file',
        updated_at: new Date('2015-10-09T05:05:12Z')
      }
      let stub = sinon.stub(this.local, 'addFile').yields()
      await this.local.moveFileAsync(doc, old)
      stub.restore()
      stub.calledWith(doc).should.be.true()
    })

    it('does nothing if the file has already been moved', async function () {
      let old = {
        path: 'old-parent/already-moved',
        updated_at: new Date('2016-10-08T05:05:11Z')
      }
      let doc = {
        path: 'new-parent/already-here',
        updated_at: new Date('2015-10-09T05:05:12Z')
      }
      let newPath = syncDir.abspath(doc.path)
      fs.ensureDirSync(path.dirname(newPath))
      fs.writeFileSync(newPath, 'foobar')
      let stub = sinon.stub(this.local, 'addFile').yields()
      await this.local.moveFileAsync(doc, old)
      stub.restore()
      stub.calledWith(doc).should.be.false()
      let enc = {encoding: 'utf-8'}
      fs.readFileSync(newPath, enc).should.equal('foobar')
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

      should(syncDir.existsSync(old)).be.false()
      should(syncDir.existsSync(doc)).be.true()

      syncDir.unlink(doc)
    })
  })

  describe('moveFolder', function () {
    it('moves the folder', async function () {
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
      let oldPath = syncDir.abspath(old.path)
      let folderPath = syncDir.abspath(doc.path)
      fs.ensureDirSync(oldPath)
      await this.local.moveFolderAsync(doc, old)
      fs.existsSync(oldPath).should.be.false()
      fs.statSync(folderPath).isDirectory().should.be.true()
      let mtime = +fs.statSync(folderPath).mtime
      mtime.should.equal(+doc.updated_at)
    })

    it('creates the folder is the current directory is missing', async function () {
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
      let folderPath = syncDir.abspath(doc.path)
      await this.local.moveFolderAsync(doc, old)
      fs.statSync(folderPath).isDirectory().should.be.true()
      let mtime = +fs.statSync(folderPath).mtime
      mtime.should.equal(+doc.updated_at)
    })

    it('does nothing if the folder has already been moved', async function () {
      let old = {
        path: 'old-parent/folder-already-moved',
        updated_at: new Date('2016-10-08T05:05:11Z')
      }
      let doc = {
        path: 'new-parent/folder-already-here',
        updated_at: new Date('2015-10-09T05:05:12Z')
      }
      let newPath = syncDir.abspath(doc.path)
      fs.ensureDirSync(newPath)
      let stub = sinon.stub(this.local, 'addFolder').yields()
      await this.local.moveFolderAsync(doc, old)
      stub.restore()
      stub.calledWith(doc).should.be.false()
      fs.statSync(newPath).isDirectory().should.be.true()
    })

    it('remove the old directory if everything has been moved', async function () {
      let old = {
        path: 'old-parent/folder-already-moved',
        updated_at: new Date('2016-10-08T05:05:11Z')
      }
      let doc = {
        path: 'new-parent/folder-already-here',
        updated_at: new Date('2015-10-09T05:05:12Z')
      }
      let oldPath = syncDir.abspath(old.path)
      let newPath = syncDir.abspath(doc.path)
      fs.ensureDirSync(oldPath)
      fs.ensureDirSync(newPath)
      let stub = sinon.stub(this.local, 'addFolder').yields()
      await this.local.moveFolderAsync(doc, old)
      stub.restore()
      stub.calledWith(doc).should.be.false()
      fs.existsSync(oldPath).should.be.false()
      fs.statSync(newPath).isDirectory().should.be.true()
    })

    // FIXME
    xit('adds the folder back when it was restored', async function () {
      const old = {path: '.cozy_trash/restored-folder'}
      const doc = {path: 'restored-folder'}

      await should(this.local.moveFolderAsync(doc, old)).be.fulfilled()

      fs.existsSync(syncDir.abspath(old)).should.be.false()
      fs.existsSync(syncDir.abspath(doc)).should.be.true()

      syncDir.rmdir(doc)
    })
  })

  describe('trash', () => {
    it('deletes a file from the local filesystem', async function () {
      let doc = {
        _id: 'FILE-TO-DELETE',
        path: 'FILE-TO-DELETE',
        docType: 'file'
      }
      let filePath = syncDir.abspath(doc.path)
      fs.ensureFileSync(filePath)
      const inserted = await this.pouch.db.put(doc)
      doc._rev = inserted.rev
      await this.pouch.db.remove(doc)
      await this.local.trashAsync(doc)
      fs.existsSync(filePath).should.be.false()
    })

    it('deletes a folder from the local filesystem', async function () {
      let doc = {
        _id: 'FOLDER-TO-DELETE',
        path: 'FOLDER-TO-DELETE',
        docType: 'folder'
      }
      let folderPath = syncDir.abspath(doc.path)
      fs.ensureDirSync(folderPath)
      const inserted = await this.pouch.db.put(doc)
      doc._rev = inserted.rev
      await this.pouch.db.remove(doc)
      await this.local.trashAsync(doc)
      fs.existsSync(folderPath).should.be.false()
    })
  })

  describe('deleteFolderAsync', () => {
    let builders, fullPath

    beforeEach(function () {
      builders = new MetadataBuilders(this.pouch)
      fullPath = (doc) => syncDir.abspath(doc.path)

      this.events.emit = sinon.spy()
      sinon.spy(this.local, 'trashAsync')
    })

    afterEach(function () {
      this.local.trashAsync.restore()
    })

    it('deletes an empty folder', async function () {
      const doc = builders.dir().build()
      await fs.emptyDirAsync(fullPath(doc))

      await this.local.deleteFolderAsync(doc)

      should(await fs.pathExistsAsync(fullPath(doc))).be.false()
      should(this.events.emit.args).deepEqual([
        ['delete-file', doc]
      ])
    })

    it('trashes a non-empty folder (ENOTEMPTY)', async function () {
      const doc = builders.dir().build()
      await fs.ensureDirAsync(path.join(fullPath(doc), 'something-inside'))

      await this.local.deleteFolderAsync(doc)

      should(await fs.pathExistsAsync(fullPath(doc))).be.false()
      should(this.local.trashAsync.args).deepEqual([
        [doc]
      ])
    })

    it('does not swallow fs errors', async function () {
      const doc = builders.dir().build()

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

  describe('renameConflictingDoc', () =>
    it('renames the file', async function () {
      let doc = {
        path: 'conflict/file',
        updated_at: new Date('2015-10-08T05_05_09Z')
      }
      let newPath = 'conflict/file-conflict-2015-10-09T05_05_10Z'
      let srcPath = syncDir.abspath(doc.path)
      let dstPath = syncDir.abspath(newPath)
      fs.ensureDirSync(path.dirname(srcPath))
      fs.writeFileSync(srcPath, 'foobar')
      await this.local.renameConflictingDocAsync(doc, newPath)
      fs.existsSync(srcPath).should.be.false()
      fs.statSync(dstPath).isFile().should.be.true()
      let enc = {encoding: 'utf-8'}
      fs.readFileSync(dstPath, enc).should.equal('foobar')
    })
  )
})
