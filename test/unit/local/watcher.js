/* eslint-env mocha */

const fs = require('fs-extra')
const path = require('path')
const sinon = require('sinon')
const should = require('should')

const { TMP_DIR_NAME } = require('../../../core/local/constants')
const Watcher = require('../../../core/local/watcher')
const metadata = require('../../../core/metadata')

const MetadataBuilders = require('../../support/builders/metadata')
const configHelpers = require('../../support/helpers/config')
const { ContextDir } = require('../../support/helpers/context_dir')
const { onPlatforms } = require('../../support/helpers/platform')
const pouchHelpers = require('../../support/helpers/pouch')

const { TRAVIS } = process.env
const { platform } = process

describe('LocalWatcher Tests', function () {
  let builders

  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('instanciate local watcher', function () {
    builders = new MetadataBuilders(this.pouch)
    this.prep = {}
    const events = {emit: sinon.stub()}
    this.watcher = new Watcher(this.syncPath, this.prep, this.pouch, events)
  })
  afterEach('stop watcher and clean path', function (done) {
    this.watcher.stop(true)
    this.watcher.checksumer.kill()
    fs.emptyDir(this.syncPath, done)
  })
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('start', function () {
    it('calls the callback when initial scan is done', function () {
      this.watcher.start()
    })

    it('calls addFile/putFolder for files that are aleady here', async function () {
      fs.ensureDirSync(path.join(this.syncPath, 'aa'))
      fs.ensureFileSync(path.join(this.syncPath, 'aa/ab'))
      this.prep.putFolderAsync = sinon.stub().resolves()
      this.prep.addFileAsync = sinon.stub().resolves()
      await this.watcher.start()
      this.prep.putFolderAsync.called.should.be.true()
      this.prep.putFolderAsync.args[0][0].should.equal('local')
      this.prep.putFolderAsync.args[0][1].path.should.equal('aa')
      this.prep.addFileAsync.called.should.be.true()
      this.prep.addFileAsync.args[0][0].should.equal('local')
      this.prep.addFileAsync.args[0][1].path.should.equal(path.normalize('aa/ab'))
    })

    it('only recomputes checksums of changed files', async function () {
      const unchangedFilename = 'unchanged-file.txt'
      const changedFilename = 'changed-file.txt'
      const unchangedPath = path.join(this.syncPath, unchangedFilename)
      const changedPath = path.join(this.syncPath, changedFilename)
      const unchangedData = 'Unchanged file content'
      const changedData = 'Changed file initial content'
      await fs.outputFile(unchangedPath, unchangedData)
      await fs.outputFile(changedPath, changedData)
      const unchangedStats = await fs.stat(unchangedPath)
      const {ino: changedIno} = await fs.stat(changedPath)
      const unchangedDoc = await builders.file()
        .upToDate()
        .path(unchangedFilename)
        .data(unchangedData)
        .stats(unchangedStats)
        .create()
      const changedDoc = await builders.file()
        .upToDate()
        .path(changedFilename)
        .data(changedData)
        .ino(changedIno)
        .updatedAt(new Date('2017-03-19T16:44:39.102Z'))
        .create()

      await fs.outputFile(changedPath, 'Changed file NEW content')
      this.prep.addFileAsync = sinon.stub().resolves()
      sinon.spy(this.watcher, 'checksum')

      try {
        await this.watcher.start()

        should(this.watcher.checksum.args).deepEqual([[changedFilename]])
        should(await this.pouch.db.get(unchangedDoc._id)).have.properties(unchangedDoc)
        should(await this.pouch.db.get(changedDoc._id)).have.properties(changedDoc)
      } finally {
        await this.pouch.db.remove(unchangedDoc)
        await this.pouch.db.remove(changedDoc)
      }
    })

    it('ignores the temporary directory', async function () {
      fs.ensureDirSync(path.join(this.syncPath, TMP_DIR_NAME))
      fs.ensureFileSync(path.join(this.syncPath, TMP_DIR_NAME, 'ac'))
      this.prep.putFolder = sinon.spy()
      this.prep.addFile = sinon.spy()
      this.prep.updateFile = sinon.spy()
      await this.watcher.start()
      this.prep.putFolder.called.should.be.false()
      this.prep.addFile.called.should.be.false()
      this.prep.updateFile.called.should.be.false()
    })
  })

  describe('checksum', () => {
    const relpath = 'foo.txt'
    let abspath

    beforeEach(function () {
      abspath = path.join(this.syncPath, relpath)
    })

    it('resolves with the md5sum for the given relative path', async function () {
      await fs.outputFile(abspath, 'foo')
      await should(this.watcher.checksum(relpath))
        .be.fulfilledWith('rL0Y20zC+Fzt72VPzMSk2A==') // foo
    })

    it('does not swallow errors', async function () {
      await should(this.watcher.checksum(relpath))
        .be.rejectedWith({code: 'ENOENT'})
    })
  })

  describe('#oldMetadata()', () => {
    it('resolves with the metadata whose id matches the event path', async function () {
      const old = await builders.whatever().create()
      const resultByEventType = {}
      for (let type of ['add', 'addDir', 'change', 'unlink', 'unlinkDir']) {
        resultByEventType[type] = await this.watcher.oldMetadata({type, path: old.path})
      }
      should(resultByEventType).deepEqual({
        add: old,
        addDir: old,
        change: old,
        unlink: old,
        unlinkDir: old
      })
    })
  })

  describe('onAddFile', () => {
    if (process.env.APPVEYOR) {
      it('is unstable on AppVeyor')
      return
    }

    it('detects when a file is created', function (done) {
      this.watcher.start().then(() => {
        this.prep.addFileAsync = function (side, doc) {
          side.should.equal('local')
          doc.should.have.properties({
            path: 'aaa.jpg',
            docType: 'file',
            md5sum: '+HBGS7uN4XdB0blqLv5tFQ==',
            size: 29865
          })
          done()
          return Promise.resolve()
        }
        let src = path.join(__dirname, '../../fixtures/chat-mignon.jpg')
        let dst = path.join(this.syncPath, 'aaa.jpg')
        fs.copySync(src, dst)
      })
    })

    onPlatforms('win32', 'darwin', () => {
      it('does not skip checksum computation when an identity conflict could occur during initial scan', async function () {
        const syncDir = new ContextDir(this.syncPath)
        const existing = await builders.file().path('Alfred').data('Alfred content').sides({remote: 1}).create()
        this.prep.addFileAsync = sinon.stub().resolves()

        await syncDir.outputFile('alfred', 'alfred content')
        await this.watcher.start()
        await this.watcher.stop()

        should(this.prep.addFileAsync).have.been.calledOnce()
        const doc = this.prep.addFileAsync.args[0][1]
        should(doc.md5sum).not.equal(existing.md5sum)
      })
    })
  })

  describe('onAddDir', function () {
    if (process.env.APPVEYOR) {
      it('is unstable on AppVeyor')
      return
    }

    it('detects when a folder is created', function (done) {
      this.watcher.start().then(() => {
        this.prep.putFolderAsync = function (side, doc) {
          side.should.equal('local')
          doc.should.have.properties({
            path: 'aba',
            docType: 'folder'
          })
          doc.should.have.properties([
            'updated_at',
            'ino'
          ])
          done()
          return Promise.resolve()
        }
        fs.mkdirSync(path.join(this.syncPath, 'aba'))
        return Promise.resolve()
      })
    })

    it('detects when a sub-folder is created', function (done) {
      this.watcher.start().then(() => {
        this.prep.putFolderAsync = () => {  // For abb folder
          this.prep.putFolderAsync = function (side, doc) {
            side.should.equal('local')
            doc.should.have.properties({
              path: path.normalize('abb/abc'),
              docType: 'folder'
            })
            doc.should.have.properties([
              'updated_at'
            ])
            done()
            return Promise.resolve()
          }
          fs.mkdirSync(path.join(this.syncPath, 'abb/abc'))
          return Promise.resolve()
        }
        fs.mkdirSync(path.join(this.syncPath, 'abb'))
      })
    })
  })

  describe('onUnlinkFile', () => {
    if (process.env.APPVEYOR) {
      it('is unstable on AppVeyor')
      return
    }

    it.skip('detects when a file is deleted', function (done) {
      // This test does not create the file in pouchdb.
      // the watcher will not find a inode number for the unlink
      // and therefore discard it.
      fs.ensureFileSync(path.join(this.syncPath, 'aca'))
      this.prep.addFileAsync = () => {  // For aca file
        this.prep.trashFileAsync = function (side, doc) {
          side.should.equal('local')
          doc.should.have.properties({
            path: 'aca'})
          done()
          return Promise.resolve()
        }
        fs.unlinkSync(path.join(this.syncPath, 'aca'))
        return Promise.resolve()
      }
      this.watcher.start()
    })
  })

  describe('onUnlinkDir', () => {
    if (process.env.APPVEYOR) {
      it('is unstable on AppVeyor')
      return
    }

    it.skip('detects when a folder is deleted', function (done) {
      // This test does not create the file in pouchdb.
      // the watcher will not find a inode number for the unlink
      // and therefore discard it.
      fs.mkdirSync(path.join(this.syncPath, 'ada'))
      this.prep.putFolderAsync = () => {  // For ada folder
        this.prep.trashFolderAsync = function (side, doc) {
          side.should.equal('local')
          doc.should.have.properties({
            path: 'ada'})
          done()
          return Promise.resolve()
        }
        fs.rmdirSync(path.join(this.syncPath, 'ada'))
        return Promise.resolve()
      }
      this.watcher.start()
    })
  })

  describe('onChange', () =>
    it('detects when a file is changed', function (done) {
      let src = path.join(__dirname, '../../fixtures/chat-mignon.jpg')
      let dst = path.join(this.syncPath, 'aea.jpg')
      fs.copySync(src, dst)
      this.prep.addFileAsync = () => {
        this.prep.updateFileAsync = function (side, doc) {
          side.should.equal('local')
          doc.should.have.properties({
            path: 'aea.jpg',
            docType: 'file',
            md5sum: 'tdmDwDisJe/rJn+2fV+rNA==',
            size: 36901
          })
          done()
          return Promise.resolve()
        }
        src = src.replace(/\.jpg$/, '-mod.jpg')
        dst = path.join(this.syncPath, 'aea.jpg')
        fs.copySync(src, dst)
        return Promise.resolve()
      }
      this.watcher.start()
    })
  )

  describe('when a file is moved', function () {
    // This integration test is unstable on travis + OSX (too often red).
    // It's disabled for the moment, but we should find a way to make it
    // more stable on travis, and enable it again.
    if (TRAVIS && (platform === 'darwin')) {
      it('is unstable on travis')
      return
    }

    beforeEach('reset pouchdb', function (done) {
      this.pouch.resetDatabase(done)
    })

    it.skip('deletes the source and adds the destination', function (done) {
      // This test does not create the file in pouchdb.
      // the watcher will not find a inode number for the unlink
      // and therefore discard it.
      let src = path.join(__dirname, '../../fixtures/chat-mignon.jpg')
      let dst = path.join(this.syncPath, 'afa.jpg')
      fs.copySync(src, dst)
      this.prep.addFileAsync = (side, doc) => {
        doc._id = doc.path
        return this.pouch.db.put(doc)
      }
      this.prep.updateFileAsync = sinon.stub().resolves()
      this.watcher.start().then(() => {
        setTimeout(() => {
          this.prep.deleteFileAsync = sinon.stub().resolves()
          this.prep.addFileAsync = sinon.stub().resolves()
          this.prep.moveFileAsync = (side, doc, was) => {
            this.prep.deleteFileAsync.called.should.be.false()
            this.prep.addFileAsync.called.should.be.false()
            side.should.equal('local')
            doc.should.have.properties({
              path: 'afb.jpg',
              docType: 'file',
              md5sum: '+HBGS7uN4XdB0blqLv5tFQ==',
              size: 29865
            })
            was.should.have.properties({
              path: 'afa.jpg',
              docType: 'file',
              md5sum: '+HBGS7uN4XdB0blqLv5tFQ==',
              size: 29865
            })
            done()
            return Promise.resolve()
          }
          fs.renameSync(dst, path.join(this.syncPath, 'afb.jpg'))
        }, 2000)
      })
    })
  })

  describe('when a directory is moved', function () {
        // This integration test is unstable on travis + OSX (too often red).
        // It's disabled for the moment, but we should find a way to make it
        // more stable on travis, and enable it again.
    if (TRAVIS && (platform === 'darwin')) {
      it('is unstable on travis')
      return
    }

    before('reset pouchdb', function (done) {
      this.pouch.resetDatabase(done)
    })

    it.skip('deletes the source and adds the destination', function (done) {
      // This test does not create the file in pouchdb.
      // the watcher will not find a inode number for the unlink
      // and therefore discard it.
      let src = path.join(this.syncPath, 'aga')
      let dst = path.join(this.syncPath, 'agb')
      fs.ensureDirSync(src)
      fs.writeFileSync(`${src}/agc`, 'agc')
      this.prep.addFileAsync = this.prep.putFolderAsync = (side, doc) => {
        doc._id = doc.path
        return this.pouch.db.put(doc)
      }
      this.prep.updateFileAsync = sinon.stub().resolves()
      this.watcher.start().then(() => {
        setTimeout(() => {
          this.prep.updateFileAsync = sinon.stub().resolves()
          this.prep.addFileAsync = sinon.stub().resolves()
          this.prep.deleteFileAsync = sinon.stub().resolves()
          this.prep.moveFileAsync = sinon.stub().resolves()
          this.prep.deleteFolderAsync = sinon.stub().resolves()
          this.prep.trashFolderAsync = sinon.stub().resolves()
          this.prep.putFolderAsync = (side, doc) => {
            side.should.equal('local')
            doc.should.have.properties({
              path: 'agb',
              docType: 'folder'
            })
            setTimeout(() => {
              this.prep.addFileAsync.called.should.be.false()
              this.prep.deleteFileAsync.called.should.be.false()
              this.prep.moveFileAsync.called.should.be.true()
              src = this.prep.moveFileAsync.args[0][2]
              src.should.have.properties({path: path.normalize('aga/agc')})
              dst = this.prep.moveFileAsync.args[0][1]
              dst.should.have.properties({path: path.normalize('agb/agc')})
              // FIXME: Delete moved dirs
              this.prep.trashFolderAsync.called.should.be.true()
              let args = this.prep.trashFolderAsync.args[0][1]
              args.should.have.properties({path: 'aga'})
              done()
            }, 5000)
            return Promise.resolve()
          }
          fs.renameSync(src, dst)
        }, 1800)
      })
    })
  })

  describe('detectOfflineUnlinkEvents', function () {
    beforeEach('reset pouchdb', function (done) {
      this.pouch.resetDatabase(done)
    })

    it('detects deleted files and folders', async function () {
      let folder1 = {
        _id: 'folder1',
        path: 'folder1',
        docType: 'folder'
      }
      let folder2 = {
        _id: 'folder2',
        path: 'folder2',
        docType: 'folder'
      }
      const folder3 = {
        _id: '.cozy_trash/folder3',
        path: '.cozy_trash/folder3',
        trashed: true,
        docType: 'folder'
      }
      let file1 = {
        _id: 'file1',
        path: 'file1',
        docType: 'file'
      }
      let file2 = {
        _id: 'file2',
        path: 'file2',
        docType: 'file'
      }
      const file3 = {
        _id: '.cozy_trash/folder3/file3',
        path: '.cozy_trash/folder3/file3',
        trashed: true,
        docType: 'file'
      }
      for (let doc of [folder1, folder2, folder3, file1, file2, file3]) {
        const {rev} = await this.pouch.db.put(doc)
        doc._rev = rev
      }
      const initialScan = {ids: ['folder1', 'file1'].map(metadata.id)}

      const {offlineEvents} = await this.watcher.detectOfflineUnlinkEvents(initialScan)

      should(offlineEvents).deepEqual([
        {type: 'unlinkDir', path: 'folder2', old: folder2},
        {type: 'unlink', path: 'file2', old: file2}
      ])
    })

    if (platform === 'win32' || platform === 'darwin') {
      it('ignores incompatible docs', async function () {
        await builders.file().incompatible().create()
        const initialScan = {ids: []}

        const {offlineEvents} = await this.watcher.detectOfflineUnlinkEvents(initialScan)
        should(offlineEvents).deepEqual([])
      })
    }
  })
})
