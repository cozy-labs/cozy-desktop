/* eslint-env mocha */
/* @flow */

import Promise from 'bluebird'
import fs from 'fs-extra'

import { scenarios, runActions, applyInit } from '../../fixtures/remote_watcher'
import should from 'should'
import { Client as CozyClient } from 'cozy-client-js'

import configHelpers from '../../helpers/config'
import pouchHelpers from '../../helpers/pouch'
import EventEmitter from 'events'

import RemoteCozy from '../../../src/remote/cozy'
import Watcher from '../../../src/remote/watcher'

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
    this.stub('deleteFolderAsync')
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

describe('RemoteWatcher fixtures', function () {
  let watcher, prep, remoteCozy, pouch
  beforeEach('instanciate config', configHelpers.createConfig)
  beforeEach('register OAuth client', configHelpers.registerClient)
  beforeEach('instanciate pouch', pouchHelpers.createDatabase)
  beforeEach('instanciate remote watcher', function () {
    prep = new SpyPrep()
    // $FlowFixMe
    prep.config = this.config
    remoteCozy = new RemoteCozy(this.config)
    remoteCozy.client = new CozyClient({
      cozyURL: this.config.config.url,
      token: process.env.COZY_STACK_TOKEN
    })
    pouch = this.pouch
    // $FlowFixMe
    watcher = new Watcher(this.pouch, prep, remoteCozy, new EventEmitter())
  })

  beforeEach('cleanup test directory', async function () {
    await fs.emptyDir(this.syncPath)
  })

  beforeEach('destroy cozy data', async function () {
    for (let f of (await remoteCozy.client.files.statById('io.cozy.files.root-dir')).relations('contents')) {
      await remoteCozy.client.files.trashById(f._id)
      await remoteCozy.client.files.destroyById(f._id)
    }
  })

  afterEach('destroy cozy data', async function () {
    for (let f of (await remoteCozy.client.files.statById('io.cozy.files.root-dir')).relations('contents')) {
      await remoteCozy.client.files.trashById(f._id)
      await remoteCozy.client.files.destroyById(f._id)
    }
  })

  afterEach('destroy pouch', pouchHelpers.cleanDatabase)
  afterEach('clean config', configHelpers.cleanConfig)

  for (let scenario of scenarios) {
    describe(scenario.name, () => {
      if (scenario.init != null) {
        beforeEach('init', () => {
          return applyInit({remoteCozy, pouch}, scenario)
        })
      }

      beforeEach('flush watcher', () => watcher.watch())
      beforeEach('fetch clear calls', () => { prep.calls = [] })

      it('works', async function () {
        console.log('########################################""')
        console.log('########    start  #####################""')
        console.log('########################################""')
        await runActions(remoteCozy.client, scenario)
        await watcher.watch()
        if (scenario.expected && scenario.expected.prepCalls) {
          should(prep.calls).deepEqual(scenario.expected.prepCalls)
        }
      })
    })
  }
})
