/* eslint-env mocha */
/* @flow */

import Promise from 'bluebird'
import fs from 'fs-extra'
import _ from 'lodash'
import path from 'path'
import should from 'should'

import Watcher from '../../../src/local/watcher'
import * as metadata from '../../../src/metadata'

import { scenarios, loadFSEvents, runActions } from '../../fixtures/local_watcher'
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

describe('LocalWatcher fixtures', () => {
  let watcher, prep
  beforeEach('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('instanciate local watcher', async function () {
    prep = new SpyPrep()
    // $FlowFixMe
    watcher = new Watcher(this.syncPath, prep, this.pouch)
  })

  beforeEach('cleanup test directory', async function () {
    await fs.emptyDir(this.syncPath)
  })

  let abspath

  beforeEach(function () {
    abspath = (relpath) => path.join(this.syncPath, relpath.replace(/\//g, path.sep))
  })

  afterEach('destroy pouch', pouchHelpers.cleanDatabase)
  afterEach('clean config', configHelpers.cleanConfig)

  for (let scenario of scenarios) {
    describe(scenario.name, () => {
      if (scenario.init != null) {
        beforeEach('init', async function () {
          for (let {path, ino} of scenario.init) {
            // FIXME: We may not need to create dirs/files in the synced dir
            // as soon as we stop using the checksum
            if (path.endsWith('/')) {
              path = _.trimEnd(path, '/') // XXX: Check in metadata.id?
              console.log('- mkdir', path)
              await fs.ensureDir(abspath(path))
              await this.pouch.put({
                _id: metadata.id(path),
                docType: 'folder',
                updated_at: new Date(),
                path,
                ino,
                tags: [],
                sides: {local: 1, remote: 1}
              })
            } else {
              console.log('- >', path)
              await fs.outputFile(abspath(path), '')
              await this.pouch.put({
                _id: metadata.id(path),
                md5sum: '1B2M2Y8AsgTpgAmY7PhCfg==', // ''
                class: 'text',
                docType: 'file',
                executable: false,
                updated_at: new Date(),
                mime: 'text/plain',
                path,
                ino,
                size: 0,
                tags: [],
                sides: {local: 1, remote: 1}
              })
            }
          }
        })
      }

      beforeEach('actions', () => runActions(scenario, abspath))

      for (let platform of ['linux', 'darwin']) { // TODO: 'win32'
        it(`runs on ${platform}`, async function () {
          let events
          try {
            events = await loadFSEvents(scenario, platform)
          } catch (err) {
            return this.skip()
          }

          for (let e of events) {
            if (e.stats) {
              e.stats.mtime = new Date(e.stats.mtime)
              e.stats.ctime = new Date(e.stats.ctime)
            }
          }
          await watcher.onFlush(events)
          if (scenario.expected && scenario.expected.prepCalls) {
            should(prep.calls).deepEqual(scenario.expected.prepCalls)
          }
        })
      }
    })
  }
})
