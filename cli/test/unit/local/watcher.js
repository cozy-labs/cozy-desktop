/* eslint-env mocha */

import async from 'async'
import fs from 'fs-extra'
import path from 'path'
import sinon from 'sinon'
import should from 'should'

import { TMP_DIR_NAME } from '../../../src/local/constants'
import Watcher from '../../../src/local/watcher'
import { PendingMap } from '../../../src/utils/pending'

import configHelpers from '../../helpers/config'
import pouchHelpers from '../../helpers/pouch'

describe('LocalWatcher Tests', function () {
  this.timeout(10000)

  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('instanciate local watcher', function () {
    this.prep = {}
    this.watcher = new Watcher(this.syncPath, this.prep, this.pouch)
  })
  afterEach('stop watcher and clean path', function (done) {
    if (this.watcher.watcher) {
      this.watcher.watcher.close()
    }
    fs.emptyDir(this.syncPath, done)
  })
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  describe('start', function () {
    it('calls the callback when initial scan is done', function () {
      this.watcher.start()
    })

    it('calls addFile/putFolder for files that are aleady here', function (done) {
      fs.ensureDirSync(path.join(this.syncPath, 'aa'))
      fs.ensureFileSync(path.join(this.syncPath, 'aa/ab'))
      this.prep.putFolderAsync = sinon.stub().resolves()
      this.prep.addFileAsync = sinon.stub().resolves()
      setTimeout(() => {
        this.prep.putFolderAsync.called.should.be.true()
        this.prep.putFolderAsync.args[0][0].should.equal('local')
        this.prep.putFolderAsync.args[0][1].path.should.equal('aa')
        this.prep.addFileAsync.called.should.be.true()
        this.prep.addFileAsync.args[0][0].should.equal('local')
        this.prep.addFileAsync.args[0][1].path.should.equal(path.normalize('aa/ab'))
        done()
      }, 1100)
      this.watcher.start()
    })

    it('ignores the temporary directory', function (done) {
      fs.ensureDirSync(path.join(this.syncPath, TMP_DIR_NAME))
      fs.ensureFileSync(path.join(this.syncPath, TMP_DIR_NAME, 'ac'))
      this.prep.putFolder = sinon.spy()
      this.prep.addFile = sinon.spy()
      this.prep.updateFile = sinon.spy()
      setTimeout(() => {
        this.prep.putFolder.called.should.be.false()
        this.prep.addFile.called.should.be.false()
        this.prep.updateFile.called.should.be.false()
        done()
      }, 1000)
      this.watcher.start()
    })
  })

  describe('createDoc', function () {
    it('creates a document for an existing file', function (done) {
      let src = path.join(__dirname, '../../fixtures/chat-mignon.jpg')
      let dst = path.join(this.syncPath, 'chat-mignon.jpg')
      fs.copySync(src, dst)
      fs.stat(dst, (err, stats) => {
        should.not.exist(err)
        should.exist(stats)
        this.watcher.createDoc('chat-mignon.jpg', stats, function (err, doc) {
          should.not.exist(err)
          doc.should.have.properties({
            path: 'chat-mignon.jpg',
            docType: 'file',
            md5sum: '+HBGS7uN4XdB0blqLv5tFQ==',
            size: 29865
          })
          doc.should.have.properties([
            'updated_at'
          ])
          should.not.exist(doc.executable)
          done()
        })
      })
    })

    if (process.platform !== 'win32') {
      it('sets the executable bit', function (done) {
        let filePath = path.join(this.syncPath, 'executable')
        fs.ensureFileSync(filePath)
        fs.chmodSync(filePath, '755')
        fs.stat(filePath, (err, stats) => {
          should.not.exist(err)
          should.exist(stats)
          this.watcher.createDoc('executable', stats, function (err, doc) {
            should.not.exist(err)
            should(doc.executable).be.true()
            done()
          })
        })
      })
    }

    it('calls back with an error if the file is missing', function (done) {
      const whateverStats = {
        ctime: {getTime: () => {}},
        mtime: {getTime: () => {}}
      }
      this.watcher.createDoc('no/such/file', whateverStats, function (err, doc) {
        should.exist(err)
        err.code.should.equal('ENOENT')
        done()
      })
    })
  })

  describe('checksum', function () {
    it('returns the checksum of an existing file', function (done) {
      let filePath = 'test/fixtures/chat-mignon.jpg'
      this.watcher.checksum(filePath, function (err, sum) {
        should.not.exist(err)
        sum.should.equal('+HBGS7uN4XdB0blqLv5tFQ==')
        done()
      })
    })

    it('returns an error for a missing file', function (done) {
      let filePath = 'no/such/file'
      this.watcher.checksum(filePath, function (err, sum) {
        should.exist(err)
        err.code.should.equal('ENOENT')
        done()
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
        }
        let src = path.join(__dirname, '../../fixtures/chat-mignon.jpg')
        let dst = path.join(this.syncPath, 'aaa.jpg')
        fs.copySync(src, dst)
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
            'updated_at'
          ])
          done()
        }
        fs.mkdirSync(path.join(this.syncPath, 'aba'))
        return Promise.resolve()
      })
    })

    it('detects when a sub-folder is created', function (done) {
      fs.mkdirSync(path.join(this.syncPath, 'abb'))
      this.prep.putFolderAsync = () => {  // For aba folder
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
      this.watcher.start()
    })
  })

  describe('onUnlinkFile', () => {
    if (process.env.APPVEYOR) {
      it('is unstable on AppVeyor')
      return
    }

    it('detects when a file is deleted', function (done) {
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

    it('detects when a folder is deleted', function (done) {
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
    if (process.env.TRAVIS && (process.platform === 'darwin')) {
      it('is unstable on travis')
      return
    }

    beforeEach('reset pouchdb', function (done) {
      this.pouch.resetDatabase(done)
    })

    it('deletes the source and adds the destination', function (done) {
      let src = path.join(__dirname, '../../fixtures/chat-mignon.jpg')
      let dst = path.join(this.syncPath, 'afa.jpg')
      fs.copySync(src, dst)
      this.prep.addFileAsync = (side, doc) => {
        doc._id = doc.path
        return this.pouch.db.put(doc)
      }
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
    if (process.env.TRAVIS && (process.platform === 'darwin')) {
      it('is unstable on travis')
      return
    }

    before('reset pouchdb', function (done) {
      this.pouch.resetDatabase(done)
    })

    it('deletes the source and adds the destination', function (done) {
      let src = path.join(this.syncPath, 'aga')
      let dst = path.join(this.syncPath, 'agb')
      fs.ensureDirSync(src)
      fs.writeFileSync(`${src}/agc`, 'agc')
      this.prep.addFileAsync = this.prep.putFolderAsync = (side, doc) => {
        doc._id = doc.path
        return this.pouch.db.put(doc)
      }
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
            }, 4000)
            return Promise.resolve()
          }
          fs.renameSync(src, dst)
        }, 1800)
      })
    })
  })

  describe('onReady', function () {
    before('reset pouchdb', function (done) {
      this.pouch.resetDatabase(done)
    })

    it('detects deleted files and folders', function (done) {
      let tfile = this.prep.trashFileAsync = sinon.stub().resolves()
      let tfolder = this.prep.trashFolderAsync = sinon.stub().resolves()
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
      async.each([folder1, folder2, folder3, file1, file2, file3], (doc, next) => {
        this.pouch.db.put(doc, next)
      }, () => {
        this.watcher.pending = new PendingMap()
        this.watcher.checksums = 0
        this.watcher.paths = ['folder1', 'file1']
        let cb = this.watcher.onReady(function () {
          tfolder.calledOnce.should.be.true()
          tfolder.calledWithMatch('local', folder1).should.be.false()
          tfolder.calledWithMatch('local', { path: folder2.path }).should.be.true()
          tfolder.calledWithMatch('local', folder3).should.be.false()
          tfile.calledOnce.should.be.true()
          tfile.calledWithMatch('local', file1).should.be.false()
          tfile.calledWithMatch('local', { path: file2.path }).should.be.true()
          tfile.calledWithMatch('local', file3).should.be.false()
          done()
        })
        cb()
      })
    })
  })
})
