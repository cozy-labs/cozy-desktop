/* eslint-env mocha */

const fs = require('fs')
const fse = require('fs-extra')
const path = require('path')
const sinon = require('sinon')
const should = require('should')
const EventEmitter = require('events')

const { FOLDER } = require('../../../../core/metadata')
const { TMP_DIR_NAME } = require('../../../../core/local/constants')
const Watcher = require('../../../../core/local/chokidar/watcher')
const chokidarEvent = require('../../../../core/local/chokidar/event')

const Builders = require('../../../support/builders')
const configHelpers = require('../../../support/helpers/config')
const { ContextDir } = require('../../../support/helpers/context_dir')
const { onPlatform } = require('../../../support/helpers/platform')
const pouchHelpers = require('../../../support/helpers/pouch')

// TODO: run on darwin platform instead?
onPlatform('linux', () => {
  describe('ChokidarWatcher Tests', function () {
    let builders

    before('instanciate config', configHelpers.createConfig)
    before('instanciate pouch', pouchHelpers.createDatabase)
    beforeEach('instanciate local watcher', function () {
      builders = new Builders({ pouch: this.pouch })
      this.prep = {}
      this.watcher = new Watcher(
        this.syncPath,
        this.prep,
        this.pouch,
        sinon.createStubInstance(EventEmitter)
      )
    })
    afterEach('stop watcher and clean path', function (done) {
      this.watcher.stop(true)
      this.watcher.checksumer.kill()
      fse.emptyDir(this.syncPath, done)
    })
    after('clean pouch', pouchHelpers.cleanDatabase)
    after('clean config directory', configHelpers.cleanConfig)

    describe('start', function () {
      it('calls the callback when initial scan is done', function () {
        this.watcher.start()
      })

      it('calls addFile/putFolder for files that are aleady here', async function () {
        fse.ensureDirSync(path.join(this.syncPath, 'aa'))
        fse.ensureFileSync(path.join(this.syncPath, 'aa/ab'))
        this.prep.putFolderAsync = sinon.stub().resolves()
        this.prep.addFileAsync = sinon.stub().resolves()
        await this.watcher.start()
        this.prep.putFolderAsync.called.should.be.true()
        this.prep.putFolderAsync.args[0][0].should.equal('local')
        this.prep.putFolderAsync.args[0][1].path.should.equal('aa')
        this.prep.addFileAsync.called.should.be.true()
        this.prep.addFileAsync.args[0][0].should.equal('local')
        this.prep.addFileAsync.args[0][1].path.should.equal(
          path.normalize('aa/ab')
        )
      })

      it('only recomputes checksums of changed files', async function () {
        const unchangedFilename = 'unchanged-file.txt'
        const changedFilename = 'changed-file.txt'
        const unchangedPath = path.join(this.syncPath, unchangedFilename)
        const changedPath = path.join(this.syncPath, changedFilename)
        const unchangedData = 'Unchanged file content'
        const changedData = 'Changed file initial content'
        await fse.outputFile(unchangedPath, unchangedData)
        await fse.outputFile(changedPath, changedData)
        const unchangedStats = await fse.stat(unchangedPath)
        const { ino: changedIno } = await fse.stat(changedPath)
        const unchangedDoc = await builders
          .metafile()
          .upToDate()
          .path(unchangedFilename)
          .data(unchangedData)
          .stats(unchangedStats)
          .create()
        const changedDoc = await builders
          .metafile()
          .upToDate()
          .path(changedFilename)
          .data(changedData)
          .ino(changedIno)
          .updatedAt(new Date('2017-03-19T16:44:39.102Z'))
          .create()

        await fse.outputFile(changedPath, 'Changed file NEW content')
        this.prep.addFileAsync = sinon.stub().resolves()
        sinon.spy(this.watcher, 'checksum')

        try {
          await this.watcher.start()

          should(this.watcher.checksum.args).deepEqual([[changedFilename]])
          should(await this.pouch.db.get(unchangedDoc._id)).have.properties(
            unchangedDoc
          )
          should(await this.pouch.db.get(changedDoc._id)).have.properties(
            changedDoc
          )
        } finally {
          await this.pouch.db.remove(unchangedDoc)
          await this.pouch.db.remove(changedDoc)
        }
      })

      it('ignores the temporary directory', async function () {
        fse.ensureDirSync(path.join(this.syncPath, TMP_DIR_NAME))
        fse.ensureFileSync(path.join(this.syncPath, TMP_DIR_NAME, 'ac'))
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
        await fse.outputFile(abspath, 'foo')
        await should(this.watcher.checksum(relpath)).be.fulfilledWith(
          'rL0Y20zC+Fzt72VPzMSk2A=='
        ) // foo
      })

      it('does not swallow errors', async function () {
        await should(this.watcher.checksum(relpath)).be.rejectedWith({
          code: 'ENOENT'
        })
      })
    })

    describe('onFlush', () => {
      beforeEach(function () {
        this.prep.addFileAsync = sinon.stub().resolves()
        this.prep.putFolderAsync = sinon.stub().resolves()
      })
      afterEach(function () {
        delete this.prep.addFileAsync
        delete this.prep.putFolderAsync
      })

      it('switches buffer mode to idle then back to timeout', async function () {
        const bufferSpy = sinon.spy(this.watcher.buffer, 'switchMode')

        try {
          // Not an initial scan flush
          this.watcher.initialScanParams = null

          this.watcher.buffer.push({
            type: 'addDir',
            path: __dirname,
            stats: builders.stats().build()
          })
          await this.watcher.buffer.flush()

          should(bufferSpy).have.been.calledTwice()
          should(bufferSpy.firstCall.calledWith('idle')).be.true()
          should(bufferSpy.secondCall.calledWith('timeout')).be.true()
          should(this.watcher.buffer.mode).equal('timeout')
        } finally {
          bufferSpy.restore()
        }
      })

      context(
        'when processing the initial events of an empty sync directory',
        () => {
          it('calls the initial scan step', async function () {
            sinon.spy(this.watcher.pouch, 'initialScanDocs')

            try {
              // Make sure we're in initial scan mode
              this.watcher.initialScanParams = {
                paths: [],
                emptyDirRetryCount: 3,
                resolve: Promise.resolve,
                flushed: false
              }

              this.watcher.buffer.push({
                type: 'addDir',
                path: '' // XXX: events on the sync directory have an empty path
              })
              await this.watcher.buffer.flush()

              // XXX: Called by initialScan.detectOfflineUnlinkEvents()
              should(this.watcher.pouch.initialScanDocs).have.been.calledOnce()
            } finally {
              this.watcher.pouch.initialScanDocs.restore()
            }
          })

          it('switches buffer mode to idle then back to timeout', async function () {
            const bufferSpy = sinon.spy(this.watcher.buffer, 'switchMode')

            try {
              // Make sure we're in initial scan mode
              this.watcher.initialScanParams = {
                paths: [],
                emptyDirRetryCount: 3,
                resolve: Promise.resolve,
                flushed: false
              }

              this.watcher.buffer.push({
                type: 'addDir',
                path: '' // XXX: events on the sync directory have an empty path
              })
              await this.watcher.buffer.flush()

              should(bufferSpy).have.been.calledTwice()
              should(bufferSpy.firstCall.calledWith('idle')).be.true()
              should(bufferSpy.secondCall.calledWith('timeout')).be.true()
              should(this.watcher.buffer.mode).equal('timeout')
            } finally {
              bufferSpy.restore()
            }
          })
        }
      )

      // TODO: refactor to test that buffer is not flushed while another batch
      // is being processed.
      context('while an initial scan is being processed', () => {
        const trigger = new EventEmitter()
        const SECOND_FLUSH_TRIGGER = 'second-flush'
        beforeEach(function () {
          // Make sure we're in initial scan mode
          this.watcher.initialScanParams = {
            paths: [],
            emptyDirRetryCount: 3,
            resolve: Promise.resolve,
            flushed: false
          }
          // Switch events buffer to manual flushing
          this.watcher.buffer.switchMode('idle')

          // Make sure the first initial scan does not end until we've flushed a
          // second time.
          const originalInitialScanDocs = this.watcher.pouch.initialScanDocs
          sinon.stub(this.watcher.pouch, 'initialScanDocs').callsFake(() => {
            return new Promise(resolve => {
              trigger.on(SECOND_FLUSH_TRIGGER, async () => {
                const data = await originalInitialScanDocs()
                resolve(data)
              })
            })
          })

          // Flush an initial scan event
          this.watcher.buffer.push({
            type: 'addDir',
            path: __dirname,
            stats: builders.stats().build()
          })
          this.watcher.buffer.flush()
        })
        afterEach(function () {
          this.watcher.pouch.initialScanDocs.restore()
        })

        it('does not trigger a new initial scan', async function () {
          this.watcher.buffer.push({
            type: 'add',
            path: __filename,
            stats: builders.stats().build()
          })
          await new Promise(resolve => {
            const flushDone = this.watcher.buffer.flush()
            trigger.emit(SECOND_FLUSH_TRIGGER)
            return flushDone.then(resolve())
          })

          should(this.watcher.pouch.initialScanDocs).have.been.calledOnce()
        })
      })
    })

    describe('onAddFile', () => {
      it('detects when a file is created', function () {
        return this.watcher.start().then(() => {
          this.prep.addFileAsync = function (side, doc) {
            side.should.equal('local')
            doc.should.have.properties({
              path: 'aaa.jpg',
              docType: 'file',
              md5sum: '+HBGS7uN4XdB0blqLv5tFQ==',
              size: 29865
            })
            return
          }
          let src = path.join(__dirname, '../../../fixtures/chat-mignon.jpg')
          let dst = path.join(this.syncPath, 'aaa.jpg')
          fse.copySync(src, dst)
          return
        })
      })

      it('does not skip checksum computation when an identity conflict could occur during initial scan', async function () {
        const syncDir = new ContextDir(this.syncPath)
        const existing = await builders
          .metafile()
          .path('Alfred')
          .data('Alfred content')
          .sides({ remote: 1 })
          .create()
        this.prep.addFileAsync = sinon.stub().resolves()

        await syncDir.outputFile('alfred', 'alfred content')
        await this.watcher.start()
        await this.watcher.stop()

        should(this.prep.addFileAsync).have.been.calledOnce()
        const doc = this.prep.addFileAsync.args[0][1]
        should(doc.md5sum).not.equal(existing.md5sum)
      })
    })

    describe('onAddDir', function () {
      it('detects when a folder is created', function () {
        return this.watcher.start().then(() => {
          this.prep.putFolderAsync = function (side, doc) {
            side.should.equal('local')
            doc.should.have.properties({
              path: 'aba',
              docType: FOLDER
            })
            doc.should.have.properties(['updated_at', 'ino'])
            return
          }
          fse.mkdirSync(path.join(this.syncPath, 'aba'))
          return
        })
      })

      it('detects when a sub-folder is created', function () {
        return this.watcher.start().then(() => {
          this.prep.putFolderAsync = () => {
            // For abb folder
            this.prep.putFolderAsync = function (side, doc) {
              side.should.equal('local')
              doc.should.have.properties({
                path: path.normalize('abb/abc'),
                docType: FOLDER
              })
              doc.should.have.properties(['updated_at'])
              return
            }
            fse.mkdirSync(path.join(this.syncPath, 'abb/abc'))
            return
          }
          fse.mkdirSync(path.join(this.syncPath, 'abb'))
          return
        })
      })
    })

    describe('onUnlinkFile', () => {
      it('detects when a file is deleted', function () {
        // This test does not create the file in pouchdb.
        // the watcher will not find a inode number for the unlink
        // and therefore discard it.
        fse.ensureFileSync(path.join(this.syncPath, 'aca'))
        this.prep.addFileAsync = () => {
          // For aca file
          this.prep.trashFileAsync = function (side, doc) {
            side.should.equal('local')
            doc.should.have.properties({
              path: 'aca'
            })
            return Promise.resolve()
          }
          fse.unlinkSync(path.join(this.syncPath, 'aca'))
          return Promise.resolve()
        }
        this.watcher.start()
      })
    })

    describe('onUnlinkDir', () => {
      it('detects when a folder is deleted', function () {
        // This test does not create the file in pouchdb.
        // the watcher will not find a inode number for the unlink
        // and therefore discard it.
        fse.mkdirSync(path.join(this.syncPath, 'ada'))
        this.prep.putFolderAsync = () => {
          // For ada folder
          this.prep.trashFolderAsync = function (side, doc) {
            side.should.equal('local')
            doc.should.have.properties({
              path: 'ada'
            })
            return Promise.resolve()
          }
          fse.rmdirSync(path.join(this.syncPath, 'ada'))
          return Promise.resolve()
        }
        this.watcher.start()
      })
    })

    describe('onChange', () =>
      it('detects when a file is changed', function () {
        let src = path.join(__dirname, '../../../fixtures/chat-mignon.jpg')
        let dst = path.join(this.syncPath, 'aea.jpg')
        fse.copySync(src, dst)
        this.prep.addFileAsync = () => {
          this.prep.updateFileAsync = function (side, doc) {
            side.should.equal('local')
            doc.should.have.properties({
              path: 'aea.jpg',
              docType: 'file',
              md5sum: 'tdmDwDisJe/rJn+2fV+rNA==',
              size: 36901
            })
            return Promise.resolve()
          }
          src = src.replace(/\.jpg$/, '-mod.jpg')
          dst = path.join(this.syncPath, 'aea.jpg')
          const content = fs.readFileSync(src)
          fs.writeFileSync(dst, content)
          return Promise.resolve()
        }
        this.watcher.start()
      }))

    describe('when a file is moved', function () {
      it('deletes the source and adds the destination', function () {
        // This test does not create the file in pouchdb.
        // the watcher will not find a inode number for the unlink
        // and therefore discard it.
        let src = path.join(__dirname, '../../../fixtures/chat-mignon.jpg')
        let dst = path.join(this.syncPath, 'afa.jpg')
        fse.copySync(src, dst)
        this.prep.addFileAsync = (side, doc) => {
          doc._id = doc.path
          return this.pouch.db.put(doc)
        }
        this.prep.updateFileAsync = sinon.stub().resolves()
        return this.watcher.start().then(() => {
          return new Promise(resolve => {
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
                return
              }
              fse.renameSync(dst, path.join(this.syncPath, 'afb.jpg'))
              resolve()
            }, 2000)
          })
        })
      })
    })

    describe('when a directory is moved', function () {
      beforeEach('instanciate pouch', pouchHelpers.createDatabase)
      afterEach('clean pouch', pouchHelpers.cleanDatabase)

      it.skip('deletes the source and adds the destination', function () {
        // This test does not create the file in pouchdb.
        // the watcher will not find a inode number for the unlink
        // and therefore discard it.
        let src = path.join(this.syncPath, 'aga')
        let dst = path.join(this.syncPath, 'agb')
        fse.ensureDirSync(src)
        fse.writeFileSync(`${src}/agc`, 'agc')
        this.prep.addFileAsync = this.prep.putFolderAsync = (side, doc) => {
          doc._id = doc.path
          return this.pouch.db.put(doc)
        }
        this.prep.updateFileAsync = sinon.stub().resolves()
        return this.watcher.start().then(() => {
          return new Promise(resolve => {
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
                  docType: FOLDER
                })
                setTimeout(() => {
                  this.prep.addFileAsync.called.should.be.false()
                  this.prep.deleteFileAsync.called.should.be.false()
                  this.prep.moveFileAsync.called.should.be.true()
                  src = this.prep.moveFileAsync.args[0][2]
                  src.should.have.properties({
                    path: path.normalize('aga/agc')
                  })
                  dst = this.prep.moveFileAsync.args[0][1]
                  dst.should.have.properties({
                    path: path.normalize('agb/agc')
                  })
                  // FIXME: Delete moved dirs
                  this.prep.trashFolderAsync.called.should.be.true()
                  let args = this.prep.trashFolderAsync.args[0][1]
                  args.should.have.properties({ path: 'aga' })
                }, 5000)
                return Promise.resolve()
              }
              fse.renameSync(src, dst)
              resolve()
            }, 1800)
          })
        })
      })
    })

    describe('when a rescan request event is fired', function () {
      it('drops buffered events', async function () {
        await this.watcher.start()

        const filePath = path.join(this.syncPath, 'added')
        const stats = builders.stats().kind('file').build()
        this.watcher.watcher.emit('add', filePath, stats)

        should(this.watcher.buffer.events).deepEqual([
          chokidarEvent.build('add', filePath, stats)
        ])

        this.watcher.watcher.emit('raw', 'unknown', this.syncPath, {
          path: this.syncPath,
          flags: 5,
          event: 'unknown',
          changes: {
            inode: false,
            finder: false,
            access: false,
            xattrs: false
          }
        })

        should(this.watcher.buffer.events).be.empty()
      })

      it('restarts the watcher', async function () {
        await this.watcher.start()

        sinon.spy(this.watcher, 'stop')
        sinon.spy(this.watcher, 'start')

        try {
          this.watcher.watcher.emit('raw', 'unknown', this.syncPath, {
            path: this.syncPath,
            flags: 5,
            event: 'unknown',
            changes: {
              inode: false,
              finder: false,
              access: false,
              xattrs: false
            }
          })
          // Give some time to the watcher to restart
          await Promise.delay(2000)

          should(this.watcher.stop).have.been.calledOnce()
          should(this.watcher.start).have.been.calledOnce()
        } finally {
          this.watcher.stop.restore()
          this.watcher.start.restore()
        }
      })
    })
  })
})
