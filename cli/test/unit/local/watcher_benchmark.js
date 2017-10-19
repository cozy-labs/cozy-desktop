/* eslint-env mocha */
/* @flow */

import Promise from 'bluebird'
import fs from 'fs-extra'
import path from 'path'

import Watcher from '../../../src/local/watcher'
import * as metadata from '../../../src/metadata'

import configHelpers from '../../helpers/config'
import pouchHelpers from '../../helpers/pouch'

class SpyPrep {
  calls: *

  constructor () {
    this.calls = []

    this.stub('addFileAsync')
    this.stub('moveFileAsync')
    this.stub('moveFolderAsync')
    this.stub('putFolderAsync')
    this.stub('trashFileAsync')
    this.stub('trashFolderAsync')
    this.stub('updateFileAsync')
  }

  stub (method: string) {
    // $FlowFixMe
    this[method] = (side, doc, was) => {
      if (was != null) {
        this.calls.push({method, dst: doc.path, src: was.path})
      } else {
        this.calls.push({method, path: doc.path})
      }
      return Promise.resolve()
    }
  }
}

let abspath

const createDoc = async (pouch, dir, relpath: string, ino) => {
  if (dir) {
    await pouch.put({
      _id: metadata.id(relpath),
      docType: 'folder',
      updated_at: new Date(),
      path: relpath,
      ino,
      tags: [],
      sides: {local: 1, remote: 1}
    })
  } else {
    await pouch.put({
      _id: metadata.id(relpath),
      md5sum: '1B2M2Y8AsgTpgAmY7PhCfg==', // ''
      class: 'text',
      docType: 'file',
      executable: false,
      updated_at: new Date(),
      mime: 'text/plain',
      path: relpath,
      ino,
      size: 0,
      tags: [],
      sides: {local: 1, remote: 1}
    })
  }
}

describe('LocalWatcher charge', () => {
  let watcher, prep
  before('instanciate config', configHelpers.createConfig)
  before('instanciate pouch', pouchHelpers.createDatabase)
  before('create outside dir', async function () {
    await fs.emptyDir(path.resolve(path.join(this.syncPath, '..', 'outside')))
  })
  before('instanciate local watcher', async function () {
    prep = new SpyPrep()
    // $FlowFixMe
    watcher = new Watcher(this.syncPath, prep, this.pouch)
  })

  before('cleanup test directory', async function () {
    await fs.emptyDir(this.syncPath)
  })

  before(function () {
    abspath = (relpath) => path.join(this.syncPath, relpath.replace(/\//g, path.sep))
  })

  let events
  before('prepare FS', async function () {
    let N = 1000
    const now = new Date()
    events = new Array(N)
    for (let i = 0; i < N; i++) {
      const type = (i % 2 ? 'add' : 'unlink') + (i % 3 ? 'Dir' : '')
      const p = (i % 4) + '/' + (i % 5) + '/' + (i % 6) + '/' + i
      const stats = {ino: i, mtime: now, ctime: now}
      if (i % 2) { // type.startsWith('add')
        if (i % 3) {
          await fs.ensureDir(abspath(p))
        } else {
          await fs.ensureDir(path.dirname(abspath(p)))
          await fs.writeFileSync(abspath(p))
        }
      } else {
        await createDoc(this.pouch, i % 3, p, i)
      }
      // $FlowFixMe
      events[i] = {type, path: p, stats}
    }
  })

  after('destroy pouch', pouchHelpers.cleanDatabase)
  after('clean config', configHelpers.cleanConfig)

  describe('with 1000 events', () => {
    it('takes less than 30s with 1000 events', async function () {
      this.timeout(30000)
      await watcher.onFlush(events)
    })
  })
})
