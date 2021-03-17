/* eslint-env mocha */
/* @flow */

const Promise = require('bluebird')
const crypto = require('crypto')
const fse = require('fs-extra')
const path = require('path')
const sinon = require('sinon')
const should = require('should')

const { Local } = require('../../../core/local')
const { TMP_DIR_NAME } = require('../../../core/local/constants')
const timestamp = require('../../../core/utils/timestamp')
const { sendToTrash } = require('../../../core/utils/fs')

const Builders = require('../../support/builders')
const configHelpers = require('../../support/helpers/config')
const { ContextDir } = require('../../support/helpers/context_dir')
const { WINDOWS_DEFAULT_MODE } = require('../../support/helpers/platform')
const pouchHelpers = require('../../support/helpers/pouch')

const streamer = (doc, content, err) => ({
  createReadStreamAsync(docToStream) {
    docToStream.should.equal(doc)
    const stream = new Builders()
      .stream()
      .push(content)
      .error(err)
      .build()
    return Promise.resolve(stream)
  }
})

describe('Local', function() {
  let builders, syncDir

  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  before('instanciate local', function() {
    this.prep = {}
    this.events = { emit: () => {} }
    this.local = new Local({ ...this, sendToTrash })

    builders = new Builders({ pouch: this.pouch })
    syncDir = new ContextDir(this.syncPath)
  })
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('constructor', function() {
    it('has a base path', function() {
      this.local.syncPath.should.equal(this.syncPath)
    })

    it('has a tmp path', function() {
      let tmpPath = syncDir.abspath(TMP_DIR_NAME)
      this.local.tmpPath.should.equal(tmpPath)
    })
  })

  describe('createReadStream', function() {
    it('throws an error if no file for this document', async function() {
      let doc = { path: 'no-such-file' }
      await should(this.local.createReadStreamAsync(doc)).be.rejectedWith(
        /ENOENT/
      )
    })

    it('creates a readable stream for the document', function(done) {
      let src = path.join(__dirname, '../../fixtures/chat-mignon.jpg')
      let dst = syncDir.abspath('read-stream.jpg')
      fse.copySync(src, dst)
      let doc = {
        path: 'read-stream.jpg',
        md5sum: 'bf268fcb32d2fd7243780ad27af8ae242a6f0d30'
      }
      this.local.createReadStreamAsync(doc).then(stream => {
        should.exist(stream)
        let checksum = crypto.createHash('sha1')
        checksum.setEncoding('hex')
        stream.pipe(checksum)
        stream.on('end', function() {
          checksum.end()
          should(checksum.read()).equal(doc.md5sum)
          done()
        })
      })
    })
  })

  describe('updateMetadataAsync', () => {
    it('chmod -x for a non-executable file', async function() {
      const doc = {
        docType: 'file',
        path: 'non-exec-file'
      }
      await syncDir.ensureFileMode(doc.path, 0o777)

      await this.local.updateMetadataAsync(doc)

      should(await syncDir.octalMode(doc)).equal(
        process.platform === 'win32' ? WINDOWS_DEFAULT_MODE : '644'
      )
    })
  })

  // TODO: Port to updateMetadataAsync()
  describe('metadataUpdater', function() {
    it('chmod +x for an executable file', function(done) {
      let date = new Date('2015-11-09T05:06:07Z')
      let filePath = syncDir.abspath('exec-file')
      fse.ensureFileSync(filePath)
      let updater = this.local.metadataUpdater({
        docType: 'file',
        path: 'exec-file',
        updated_at: date,
        executable: true
      })
      updater(function(err) {
        should.not.exist(err)
        const mode = +fse.statSync(filePath).mode
        if (process.platform === 'win32') {
          should(mode & 0o100).equal(0)
        } else {
          should(mode & 0o100).not.equal(0)
        }
        done()
      })
    })

    it('updates mtime for a file', function(done) {
      let date = new Date('2015-10-09T05:06:07Z')
      let filePath = syncDir.abspath('utimes-file')
      fse.ensureFileSync(filePath)
      let updater = this.local.metadataUpdater({
        path: 'utimes-file',
        updated_at: date
      })
      updater(function(err) {
        should.not.exist(err)
        const mtime = +fse.statSync(filePath).mtime
        should(mtime).equal(+date)
        done()
      })
    })

    it('updates mtime for a directory', function(done) {
      let date = new Date('2015-10-09T05:06:07Z')
      let folderPath = syncDir.abspath('utimes-folder')
      fse.ensureDirSync(folderPath)
      let updater = this.local.metadataUpdater({
        path: 'utimes-folder',
        updated_at: date
      })
      updater(function(err) {
        should.not.exist(err)
        const mtime = +fse.statSync(folderPath).mtime
        should(mtime).equal(+date)
        done()
      })
    })
  })

  describe('inodeSetter', () => {
    let fullPath

    beforeEach(() => {
      fullPath = doc => syncDir.abspath(doc.path)
    })

    it('sets ino for a file', function(done) {
      const doc /*: { path: string, ino?: number } */ = {
        path: 'file-needs-ino'
      }
      fse.ensureFileSync(fullPath(doc))
      const inodeSetter = this.local.inodeSetter(doc)
      inodeSetter(err => {
        should.not.exist(err)
        should(doc.ino).be.a.Number()
        done()
      })
    })

    it('sets ino for a directory', function(done) {
      const doc /*: { path: string, ino?: number } */ = {
        path: 'dir-needs-ino'
      }
      fse.ensureDirSync(fullPath(doc))
      const inodeSetter = this.local.inodeSetter(doc)
      inodeSetter(err => {
        should.not.exist(err)
        should(doc.ino).be.a.Number()
        done()
      })
    })
  })

  describe('fileExistsLocally', () => {
    it('checks file existence as a binary in the db and on disk', async function() {
      const filePath = path.resolve(this.syncPath, 'folder', 'testfile')
      await should(this.local.fileExistsLocally('deadcafe')).be.fulfilledWith(
        false
      )
      fse.ensureFileSync(filePath)
      const doc = {
        _id: 'folder/testfile',
        path: 'folder/testfile',
        docType: 'file',
        md5sum: 'deadcafe',
        sides: {
          target: 1,
          local: 1
        }
      }
      this.pouch.db.put(doc)
      await should(this.local.fileExistsLocally('deadcafe')).be.fulfilledWith(
        filePath
      )
    })
  })

  describe('addFile', function() {
    beforeEach(function() {
      sinon.spy(this.events, 'emit')
    })
    afterEach(function() {
      this.events.emit.restore()
    })

    it('creates the file by downloading it', async function() {
      const content = 'foobar'
      const doc = builders
        .metafile()
        .path('files/file-from-remote')
        .updatedAt(new Date('2015-10-09T04:05:06Z'))
        .data(content)
        .build()
      this.local.other = streamer(doc, content)

      try {
        await this.local.addFileAsync(doc)

        const filePath = syncDir.abspath(doc.path)
        const stats = await fse.stat(filePath)
        should(stats.isFile()).be.true()
        should(+stats.mtime).equal(new Date(doc.updated_at).getTime())
        await should(
          fse.readFile(filePath, { encoding: 'utf-8' })
        ).be.fulfilledWith(content)
        should(doc.ino).be.a.Number()
      } finally {
        this.local.other = null
      }
    })

    it('creates the file from another file with same checksum', async function() {
      sinon.spy(this.local, 'fileExistsLocally')

      const content = 'foo bar baz'

      const other = await builders
        .metafile()
        .path('files/my-checkum-is-456')
        .data(content)
        .create()
      await syncDir.outputFile(other.path, content)

      const doc = builders
        .metafile()
        .path('files/file-with-same-checksum')
        .updatedAt('2015-10-09T04:05:07Z')
        .data(content)
        .build()

      try {
        await this.local.addFileAsync(doc)

        should(this.local.fileExistsLocally).have.been.calledWith(doc.md5sum)

        const filePath = syncDir.abspath(doc.path)
        const stats = await fse.stat(filePath)
        should(stats.isFile()).be.true()
        should(+stats.mtime).equal(new Date(doc.updated_at).getTime())
        await should(
          fse.readFile(filePath, { encoding: 'utf-8' })
        ).be.fulfilledWith('foo bar baz')
      } finally {
        this.local.fileExistsLocally.restore()
      }
    })

    it('can create a file in the root', async function() {
      const content = 'foobaz'
      const doc = builders
        .metafile()
        .path('file-in-root')
        .updatedAt(new Date('2015-10-09T04:05:19Z'))
        .data(content)
        .build()
      this.local.other = streamer(doc, content)

      try {
        await this.local.addFileAsync(doc)

        const filePath = syncDir.abspath(doc.path)
        const stats = await fse.stat(filePath)
        should(stats.isFile()).be.true()
        should(+stats.mtime).equal(new Date(doc.updated_at).getTime())
        await should(
          fse.readFile(filePath, { encoding: 'utf-8' })
        ).be.fulfilledWith(content)
      } finally {
        this.local.other = null
      }
    })

    it('aborts when the download is incorrect', async function() {
      const content = 'foo'
      const invalidContent = 'bar'
      const doc = builders
        .metafile()
        .path('files/file-from-remote-2')
        .updatedAt(new Date('2015-10-09T04:05:16Z'))
        .data(content)
        .build()
      this.local.other = streamer(doc, invalidContent)

      try {
        await should(this.local.addFileAsync(doc)).be.rejectedWith(
          'Invalid checksum'
        )
        const filePath = syncDir.abspath(doc.path)
        await should(fse.exists(filePath)).be.fulfilledWith(false)
      } finally {
        this.local.other = null
      }
    })

    it('adds write permission to existing read-only Cozy Note', async function() {
      const doc = {
        docType: 'file',
        mime: 'text/vnd.cozy.note+markdown',
        path: 'my-note.cozy-note',
        updated_at: new Date('2015-10-09T04:05:19Z'),
        md5sum: 'gDOOedLKm5wJDrqqLvKTxw=='
      }

      await syncDir.outputFile(doc.path, 'initial content')
      await syncDir.ensureFileMode(doc.path, 0o444)

      this.local.other = streamer(doc, 'foobaz')
      await this.local.addFileAsync(doc)
      this.local.other = null

      const filePath = syncDir.abspath(doc.path)
      should(fse.statSync(filePath).isFile()).be.true()
      should(fse.readFileSync(filePath, { encoding: 'utf-8' })).equal('foobaz')
      should(fse.statSync(filePath)).have.property('mtime', doc.updated_at)

      should(await syncDir.octalMode(doc)).equal(
        process.platform === 'win32' ? WINDOWS_DEFAULT_MODE : '644'
      )
    })

    describe('when md5sum matches but size does not', () => {
      const message = 'Invalid size'
      const corruptData = 'hell'
      const validData = corruptData + 'o'
      let doc

      beforeEach('set up doc', () => {
        doc = builders
          .metafile()
          .data(corruptData)
          .build()
        doc.size = validData.length
      })

      beforeEach('stub #createReadStreamAsync() on the other side', function() {
        this.local.other = streamer(doc, corruptData)
      })

      afterEach(
        'restore #createReadStreamAsync() on the other side',
        function() {
          this.local.other = null
        }
      )

      it('rejects', async function() {
        await should(this.local.addFileAsync(doc)).be.rejectedWith(message)
      })

      const addFileRejection = async function() {
        await this.local.addFileAsync(doc).catch({ message }, () => {})
      }

      describe('existing local file with valid data', () => {
        beforeEach(() => syncDir.outputFile(doc, validData))
        afterEach(() => syncDir.unlink(doc))
        beforeEach(addFileRejection)

        it('is not overridden to prevent valid data loss', async function() {
          await should(syncDir.readFile(doc)).be.fulfilledWith(validData)
        })
      })

      describe('missing local file', () => {
        beforeEach(addFileRejection)

        it('is not downloaded to prevent confusion', async function() {
          await should(syncDir.exists(doc)).be.fulfilledWith(false)
        })
      })
    })

    describe('when we encounter a network error during the download', () => {
      const message = 'ERR_CONNECTION_RESET'
      const data = 'hello'
      let doc

      beforeEach('set up doc', () => {
        doc = builders
          .metafile()
          .data(data)
          .build()
      })

      beforeEach('stub #createReadStreamAsync() on the other side', function() {
        this.local.other = streamer(doc, data, new Error(message))
      })

      afterEach(
        'restore #createReadStreamAsync() on the other side',
        function() {
          this.local.other = null
        }
      )

      it('rejects', async function() {
        await should(this.local.addFileAsync(doc)).be.rejectedWith(message)
      })
    })
  })

  describe('addFolder', function() {
    it('creates the folder', async function() {
      const doc = builders
        .metadir()
        .path('parent/folder-to-create')
        .updatedAt(new Date('2015-10-09T05:06:08Z'))
        .build()
      const folderPath = syncDir.abspath(doc.path)

      await this.local.addFolderAsync(doc)

      const stats = await fse.stat(folderPath)
      should(stats.isDirectory()).be.true()
      should(+stats.mtime).equal(new Date(doc.updated_at).getTime())
      should(doc.ino).be.a.Number()
    })

    it('updates mtime if the folder already exists', async function() {
      const doc = builders
        .metadir()
        .path('parent/folder-to-create')
        .updatedAt(new Date('2015-10-09T05:06:08Z'))
        .build()
      const folderPath = syncDir.abspath(doc.path)
      fse.ensureDirSync(folderPath)

      await this.local.addFolderAsync(doc)

      const stats = await fse.stat(folderPath)
      should(stats.isDirectory()).be.true()
      should(+stats.mtime).equal(new Date(doc.updated_at).getTime())
    })
  })

  describe('overwriteFile', () => {
    it('writes the new content of a file', async function() {
      const newContent = 'Hello world'
      const doc = builders
        .metafile()
        .path('a-file-to-overwrite')
        .data(newContent)
        .updatedAt(new Date('2015-10-09T05:06:07Z'))
        .build()
      this.local.other = streamer(doc, newContent)

      const filePath = syncDir.abspath(doc.path)
      fse.writeFileSync(filePath, 'old content')

      try {
        await this.local.overwriteFileAsync(doc, {})

        const stats = await fse.stat(filePath)
        should(stats.isFile()).be.true()
        should(+stats.mtime).equal(new Date(doc.updated_at).getTime())
        await should(
          fse.readFile(filePath, { encoding: 'utf-8' })
        ).be.fulfilledWith(newContent)
      } finally {
        this.local.other = null
      }
    })
  })

  describe('updateFileMetadata', () => {
    it('updates metadata', async function() {
      const doc = builders
        .metafile()
        .path('file-to-update')
        .updatedAt('2015-11-10T05:06:07Z')
        .build()
      const filePath = syncDir.abspath(doc.path)
      await fse.ensureFile(filePath)
      await this.local.updateFileMetadataAsync(doc)
      await should(fse.exists(filePath)).be.fulfilledWith(true)
      should(+(await fse.stat(filePath)).mtime).equal(+new Date(doc.updated_at))
    })
  })

  describe('updateFolder', () => {
    it('calls addFolder', async function() {
      const doc = builders
        .metadir()
        .path('a-folder-to-update')
        .build()
      sinon.stub(this.local, 'addFolderAsync').resolves()
      await this.local.updateFolderAsync(doc)
      should(this.local.addFolderAsync).be.calledWith(doc)
      this.local.addFolderAsync.restore()
    })
  })

  describe('move', function() {
    context('with file', function() {
      let dstFile, srcFile

      beforeEach(async () => {
        srcFile = builders
          .metafile()
          .path('src/file')
          .build()
        dstFile = builders
          .metafile()
          .path('dst/file')
          .olderThan(srcFile)
          .build()

        await fse.emptyDir(syncDir.root)
      })

      it('moves the file and updates its mtime', async function() {
        await syncDir.outputFile(srcFile, 'foobar')
        await syncDir.ensureParentDir(dstFile)

        await this.local.moveAsync(dstFile, srcFile)

        should(await syncDir.tree()).deepEqual(['dst/', 'dst/file', 'src/'])
        should((await syncDir.mtime(dstFile)).getTime()).equal(
          process.platform === 'win32'
            ? timestamp.fromDate(dstFile.updated_at).getTime()
            : new Date(dstFile.updated_at).getTime()
        )
        should(await syncDir.readFile(dstFile)).equal('foobar')
      })

      it('throws ENOENT on missing source', async function() {
        await syncDir.emptyDir(path.dirname(srcFile.path))
        await syncDir.emptyDir(path.dirname(dstFile.path))

        await should(this.local.moveAsync(dstFile, srcFile)).be.rejectedWith({
          code: 'ENOENT'
        })

        should(await syncDir.tree()).deepEqual(['dst/', 'src/'])
      })

      it('throws ENOENT on missing destination parent', async function() {
        await syncDir.outputFile(srcFile, 'foobar')
        await syncDir.removeParentDir(dstFile)

        await should(this.local.moveAsync(dstFile, srcFile)).be.rejectedWith({
          code: 'ENOENT'
        })

        should(await syncDir.tree()).deepEqual(['src/', 'src/file'])
      })

      it('throws a custom Error on existing destination', async function() {
        await syncDir.outputFile(srcFile, 'src/file content')
        await syncDir.outputFile(dstFile, 'dst/file content')

        await should(this.local.moveAsync(dstFile, srcFile)).be.rejectedWith(
          /already exists/
        )

        should(await syncDir.tree()).deepEqual([
          'dst/',
          'dst/file',
          'src/',
          'src/file'
        ])
      })

      it('throws a custom Error on existing destination (and missing source)', async function() {
        await syncDir.ensureParentDir(srcFile)
        await syncDir.outputFile(dstFile, 'dst/file content')

        await should(this.local.moveAsync(dstFile, srcFile)).be.rejectedWith(
          /already exists/
        )

        should(await syncDir.tree()).deepEqual(['dst/', 'dst/file', 'src/'])
      })
    })

    context('with folder', function() {
      let dstDir, srcDir

      beforeEach(async () => {
        srcDir = builders
          .metadir()
          .path('src/dir')
          .build()
        dstDir = builders
          .metadir()
          .path('dst/dir')
          .olderThan(srcDir)
          .build()

        await fse.emptyDir(syncDir.root)
      })

      it('moves the folder and updates its mtime', async function() {
        await syncDir.ensureDir(srcDir)
        await syncDir.ensureParentDir(dstDir)

        await this.local.moveAsync(dstDir, srcDir)

        should(await syncDir.tree()).deepEqual(['dst/', 'dst/dir/', 'src/'])
        should((await syncDir.mtime(dstDir)).getTime()).equal(
          process.platform === 'win32'
            ? timestamp.fromDate(dstDir.updated_at).getTime()
            : new Date(dstDir.updated_at).getTime()
        )
      })

      it('throws ENOENT on missing source', async function() {
        await syncDir.ensureParentDir(srcDir)
        await syncDir.ensureParentDir(dstDir)

        await should(this.local.moveAsync(dstDir, srcDir)).be.rejectedWith({
          code: 'ENOENT'
        })

        should(await syncDir.tree()).deepEqual(['dst/', 'src/'])
      })

      it('throws ENOENT on missing destination parent', async function() {
        await syncDir.ensureDir(srcDir)

        await should(this.local.moveAsync(dstDir, srcDir)).be.rejectedWith({
          code: 'ENOENT'
        })

        should(await syncDir.tree()).deepEqual(['src/', 'src/dir/'])
      })

      it('throws a custom Error on existing destination', async function() {
        await syncDir.ensureDir(srcDir)
        await syncDir.ensureDir(dstDir)

        await should(this.local.moveAsync(dstDir, srcDir)).be.rejectedWith(
          /already exists/
        )

        should(await syncDir.tree()).deepEqual([
          'dst/',
          'dst/dir/',
          'src/',
          'src/dir/'
        ])
      })

      it('throws a custom Error on existing destination (and missing source)', async function() {
        await syncDir.ensureParentDir(srcDir)
        await syncDir.ensureDir(dstDir)

        await should(this.local.moveAsync(dstDir, srcDir)).be.rejectedWith(
          /already exists/
        )

        should(await syncDir.tree()).deepEqual(['dst/', 'dst/dir/', 'src/'])
      })
    })
  })

  describe('trash', () => {
    it('deletes a file from the local filesystem', async function() {
      const doc = await builders
        .metafile()
        .path('FILE-TO-DELETE')
        .create()
      const filePath = syncDir.abspath(doc.path)
      fse.ensureFileSync(filePath)

      await this.pouch.db.remove(doc)
      await this.local.trashAsync(doc)
      await should(fse.exists(filePath)).be.fulfilledWith(false)
    })

    it('deletes a folder from the local filesystem', async function() {
      const doc = await builders
        .metadir()
        .path('FOLDER-TO-DELETE')
        .create()
      const folderPath = syncDir.abspath(doc.path)
      fse.ensureDirSync(folderPath)

      await this.pouch.db.remove(doc)
      await this.local.trashAsync(doc)
      await should(fse.exists(folderPath)).be.fulfilledWith(false)
    })
  })

  describe('deleteFolderAsync', () => {
    let fullPath

    beforeEach(function() {
      fullPath = doc => syncDir.abspath(doc.path)

      sinon.spy(this.events, 'emit')
      sinon.spy(this.local, 'trashAsync')
    })

    afterEach(function() {
      this.events.emit.restore()
      this.local.trashAsync.restore()
    })

    it('deletes an empty folder', async function() {
      const doc = builders.metadir().build()
      await fse.emptyDir(fullPath(doc))

      await this.local.deleteFolderAsync(doc)

      should(await fse.pathExists(fullPath(doc))).be.false()
    })

    it('trashes a non-empty folder (ENOTEMPTY)', async function() {
      const doc = builders.metadir().build()
      await fse.ensureDir(path.join(fullPath(doc), 'something-inside'))

      await this.local.deleteFolderAsync(doc)

      should(await fse.pathExists(fullPath(doc))).be.false()
      should(this.local.trashAsync.args).deepEqual([[doc]])
    })

    it('does nothing if the folder is missing (ENOENT)', async function() {
      const doc = builders.metadir().build()

      await should(this.local.deleteFolderAsync(doc)).be.fulfilled()
    })

    it('throws when given folder metadata points to a file', async function() {
      const doc = builders
        .metadir()
        .path('FILE-TO-DELETE')
        .build()
      await fse.ensureFile(fullPath(doc))

      if (process.platform === 'win32') {
        await should(this.local.deleteFolderAsync(doc)).be.rejectedWith(
          /ENOENT/
        )
      } else {
        await should(this.local.deleteFolderAsync(doc)).be.rejectedWith(
          /ENOTDIR/
        )
      }
    })

    it('throws when given non-folder metadata', async function() {
      const doc = builders
        .metafile()
        .path('FILE-TO-DELETE')
        .build()
      await fse.ensureFile(fullPath(doc))

      await should(this.local.deleteFolderAsync(doc)).be.rejectedWith(
        /metadata/
      )
    })
  })
})
