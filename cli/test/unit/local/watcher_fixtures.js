/* eslint-env mocha */
/* @flow */

import Promise from 'bluebird'
import fs from 'fs-extra'
import _ from 'lodash'
import path from 'path'
import should from 'should'

import Watcher from '../../../src/local/watcher'
import * as metadata from '../../../src/metadata'

import { scenarios, loadFSEventFiles, runActions } from '../../fixtures/local_watcher'
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

const pathFix = (scenario, p) =>
  (process.platform === 'win32' || scenario.name.indexOf('win32') === -1) ? p : p.replace(/\\/g, '/')

const fixExpectations = (prepCall) =>
  (process.platform === 'win32') ? Object.assign({}, prepCall,
      prepCall.src ? {src: prepCall.src.split('/').join('\\').toUpperCase()} : null, // @TODO why is src in maj
      prepCall.path ? {path: prepCall.path.split('/').join('\\')} : null,
      prepCall.dst ? {dst: prepCall.dst.split('/').join('\\')} : null
    ) : prepCall

describe('LocalWatcher fixtures', () => {
  let watcher, prep
  beforeEach('instanciate config', configHelpers.createConfig)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('create outside dir', async function () {
    await fs.emptyDir(path.resolve(path.join(this.syncPath, '..', 'outside')))
  })
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
          for (let {path: relpath, ino} of scenario.init) {
            if (relpath.endsWith('/')) {
              relpath = _.trimEnd(relpath, '/') // XXX: Check in metadata.id?
              if (this.currentTest.title.match(/win32/)) relpath = relpath.replace(/\//g, '\\').toUpperCase()
              await fs.ensureDir(abspath(relpath))
              await this.pouch.put({
                _id: metadata.id(relpath),
                docType: 'folder',
                updated_at: new Date(),
                path: relpath,
                ino,
                tags: [],
                sides: {local: 1, remote: 1}
              })
            } else {
              if (this.currentTest.title.match(/win32/)) relpath = relpath.replace(/\//g, '\\').toUpperCase()
              await fs.outputFile(abspath(relpath), '')
              await this.pouch.put({
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
        })
      }

      beforeEach('actions', () => runActions(scenario, abspath))

      for (let eventsFile of loadFSEventFiles(scenario)) {
        it(eventsFile.name, async function () {
          for (let e of eventsFile.events) {
            if (e.stats) {
              e.stats.mtime = new Date(e.stats.mtime)
              e.stats.ctime = new Date(e.stats.ctime)
            }
            e.path = pathFix(eventsFile, e.path)
          }
          await watcher.onFlush(eventsFile.events)
          if (scenario.expected && scenario.expected.prepCalls) {
            const expected = scenario.expected.prepCalls.map(eventsFile.name.match(/win32/) ? fixExpectations : (x) => x)
            should(prep.calls).deepEqual(expected)
          }
        })
      }
    })
  }
})
