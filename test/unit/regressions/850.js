/* Fixes issue https://github.com/cozy-labs/cozy-desktop/issues/850 */
/* eslint-env mocha */

const fse = require('fs-extra')
const path = require('path')
const sinon = require('sinon')
const EventEmitter = require('events')

// import { TMP_DIR_NAME } from '../../../core/local/constants'
const ChokidarEvent = require('../../../core/local/chokidar/event')
const Watcher = require('../../../core/local/chokidar/watcher')
const { Merge } = require('../../../core/merge')
const Prep = require('../../../core/prep')
const { Ignore } = require('../../../core/ignore')
const Sync = require('../../../core/sync')
const metadata = require('../../../core/metadata')

const configHelpers = require('../../support/helpers/config')
const pouchHelpers = require('../../support/helpers/pouch')
const { onPlatform } = require('../../support/helpers/platform')
const Builders = require('../../support/builders')

onPlatform('darwin', () => {
  describe('issue 850', function() {
    this.timeout(10000)

    let builders

    before('instanciate config', configHelpers.createConfig)
    before('instanciate pouch', pouchHelpers.createDatabase)
    before('prepare builders', function() {
      builders = new Builders({ pouch: this.pouch })
    })
    before('instanciate local watcher', function() {
      this.merge = new Merge(this.pouch)
      this.local = {
        start: sinon.stub().resolves(),
        stop: sinon.stub().resolves()
      }
      this.remote = {
        start: sinon.stub().returns({
          started: Promise.resolve(),
          running: new Promise(() => {})
        }),
        stop: sinon.stub().resolves()
      }
      this.events = new EventEmitter()
      this.ignore = new Ignore([])
      this.sync = new Sync(
        this.pouch,
        this.local,
        this.remote,
        this.ignore,
        this.events
      )
      // this.sync.sync = sinon.stub().rejects(new Error('stopped'))
      this.prep = new Prep(this.merge, this.ignore)
      this.watcher = new Watcher(
        this.syncPath,
        this.prep,
        this.pouch,
        this.events
      )
    })
    after('stop watcher and clean path', async function() {
      this.watcher.stop(true)
      this.watcher.checksumer.kill()
      await fse.emptyDir(this.syncPath)
    })
    after('clean pouch', pouchHelpers.cleanDatabase)
    after('clean config directory', configHelpers.cleanConfig)

    before('create dst dir', async function() {
      const dirPath = path.join(this.syncPath, 'dst')
      await fse.mkdirp(dirPath)
      const stat = await fse.stat(dirPath)
      await builders
        .metadir()
        .path(dirPath)
        .ino(stat.ino)
        .upToDate()
        .create()
      await this.sync.sync()
    })

    it('is fixed', async function() {
      let filePath = path.join(this.syncPath, 'file')
      let dstPath = path.join(this.syncPath, 'dst', 'file')
      await fse.outputFile(filePath, 'whatever')
      await this.watcher.onFlush([
        ChokidarEvent.build('add', 'file', await fse.stat(filePath))
      ])
      await fse.rename(filePath, dstPath)

      const doMove = async () => {
        // let _resolve
        // let ret = new Promise((resolve) => { _resolve = resolve })
        // let oldLock = that.pouch.lock
        // that.pouch.lock = async function () {
        //   _resolve()
        //   that.pouch.lock = oldLock
        //   return that.pouch.lock()
        // }
        this.watcher.onFlush([
          ChokidarEvent.build('add', 'dst/file', await fse.stat(dstPath)),
          ChokidarEvent.build('unlink', 'file')
        ])

        return Promise.delay(2000)
      }

      this.remote.addFileAsync = async doc => {
        await doMove() // move occurs while the file is uploading
        // Promise.delay()
        doc.remote = {
          _id: 'fakeID',
          _rev: '1-fakeRev'
        }
        return metadata.fromRemoteDoc({
          type: 'file',
          path: '/file',
          updated_at: new Date(),
          _id: 'fakeID',
          _rev: '1-fakeRev',
          size: '8'
        })
      }

      await this.sync.sync() // create file
    })
  })
})
