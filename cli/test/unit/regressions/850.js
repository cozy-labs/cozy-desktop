/* eslint-env mocha */

import fs from 'fs-extra'
import path from 'path'
import sinon from 'sinon'
// import should from 'should'

// import { TMP_DIR_NAME } from '../../../src/local/constants'
import * as ChokidarEvent from '../../../src/local/chokidar_event'
import Watcher from '../../../src/local/watcher'
import Merge from '../../../src/merge'
import Prep from '../../../src/prep'
import Ignore from '../../../src/ignore'
import Sync from '../../../src/sync'
import * as metadata from '../../../src/metadata'
import * as conversion from '../../../src/conversion'

import configHelpers from '../../helpers/config'
import pouchHelpers from '../../helpers/pouch'

describe('issue 850', function () {
  this.timeout(10000)

  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  before('instanciate local watcher', function () {
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
    this.events = {emit: () => {}}
    this.ignore = new Ignore([])
    this.sync = new Sync(this.pouch, this.local, this.remote, this.ignore, this.events)
    // this.sync.sync = sinon.stub().rejects(new Error('stopped'))
    this.prep = new Prep(this.merge, this.ignore)
    this.watcher = new Watcher(this.syncPath, this.prep, this.pouch)
  })
  after('stop watcher and clean path', function (done) {
    if (this.watcher.watcher) {
      this.watcher.watcher.close()
    }
    this.watcher.checksumer.kill()
    fs.emptyDir(this.syncPath, done)
  })
  after('clean pouch', pouchHelpers.cleanDatabase)
  after('clean config directory', configHelpers.cleanConfig)

  before('create dst dir', async function () {
    let dirPath = path.join(this.syncPath, 'dst')
    await fs.mkdirp(dirPath)
    let stat = await fs.stat(dirPath)
    await this.pouch.put({
      _id: metadata.id('dst'),
      docType: 'folder',
      updated_at: new Date(),
      path: 'dst',
      ino: stat.ino,
      tags: [],
      sides: {local: 1, remote: 1}
    })
    await this.sync.sync()
  })

  it('is fixed', async function () {
    let filePath = path.join(this.syncPath, 'file')
    let dstPath = path.join(this.syncPath, 'dst', 'file')
    await fs.outputFile(filePath, 'whatever')
    await this.watcher.onFlush([
      ChokidarEvent.build('add', 'file', await fs.stat(filePath))
    ])
    await fs.move(filePath, dstPath)

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
        ChokidarEvent.build('add', 'dst/file', await fs.stat(dstPath)),
        ChokidarEvent.build('unlink', 'file')
      ])

      return Promise.delay(2000)
    }

    this.remote.addFileAsync = async (doc) => {
      await doMove() // move occurs while the file is uploading
      // Promise.delay()
      doc.remote = {
        _id: 'fakeID',
        _rev: '1-fakeRev'
      }
      return conversion.createMetadata({
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
