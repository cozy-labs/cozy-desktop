/* eslint-env mocha */
/* @flow */

import fs from 'fs-extra'
import _ from 'lodash'
import path from 'path'
import should from 'should'
import sinon from 'sinon'

import { scenarios, loadFSEventFiles, runActions, init } from '../helpers/scenarios'
import configHelpers from '../helpers/config'
import * as cozyHelpers from '../helpers/cozy'
import { IntegrationTestHelpers } from '../helpers/integration'
import pouchHelpers from '../helpers/pouch'
import remoteCaptureHelpers from '../../dev/capture/remote'

let helpers

// Spies
let prepCalls

before(configHelpers.createConfig)
before(configHelpers.registerClient)
beforeEach(pouchHelpers.createDatabase)
beforeEach(cozyHelpers.deleteAll)
beforeEach('set up synced dir', async function () {
  await fs.emptyDir(this.syncPath)
})
beforeEach('set up outside dir', async function () {
  await fs.emptyDir(path.resolve(path.join(this.syncPath, '..', 'outside')))
})

afterEach(pouchHelpers.cleanDatabase)
after(configHelpers.cleanConfig)

beforeEach(async function () {
  helpers = new IntegrationTestHelpers(this.config, this.pouch, cozyHelpers.cozy)
  // TODO: Spy in IntegrationTestHelpers by default
  prepCalls = []

  for (let method of ['addFileAsync', 'putFolderAsync', 'updateFileAsync',
    'moveFileAsync', 'moveFolderAsync', 'deleteFolderAsync', 'trashFileAsync',
    'trashFolderAsync', 'restoreFileAsync', 'restoreFolderAsync']) {
    // $FlowFixMe
    const origMethod = helpers.prep[method]
    sinon.stub(helpers.prep, method).callsFake(async (...args) => {
      const call: Object = {method}
      if (method.startsWith('move') || method.startsWith('restore')) {
        call.dst = args[1].path
        call.src = args[2].path
      } else {
        call.path = args[1].path
      }
      prepCalls.push(call)

      // Call the actual method so we can make assertions on metadata & FS
      return origMethod.apply(helpers.prep, args)
    })
  }

  // TODO: helpers.setup()
  await helpers.local.setupTrash()
  await helpers.remote.ignorePreviousChanges()
})

afterEach(function () {
  // TODO: Include prep actions in custom assertion
  if (this.currentTest.state === 'failed') {
    // TODO: dump logs
  }
})

for (let scenario of scenarios) {

  it(`test/scenarios/${scenario.name}/local/initial-scan`, async function () {
    if (scenario.init) {
      let relpathFix = _.identity
      if (process.platform === 'win32' && this.currentTest.title.match(/win32/)) {
        relpathFix = (relpath) => relpath.replace(/\//g, '\\').toUpperCase()
      }
      await init(scenario, this.pouch, helpers.local.syncDir.abspath, relpathFix)
    }

    await runActions(scenario, helpers.local.syncDir.abspath)
    helpers.local.local.watcher.start()
    // TODO: await helpers.syncAll()

    if (scenario.expected && scenario.expected.prepCalls) {
      should(prepCalls).deepEqual(scenario.expected.prepCalls)
    }
  })

  for (let eventsFile of loadFSEventFiles(scenario)) {
    const localTestName = `test/scenarios/${scenario.name}/local/${eventsFile.name}`
    if (eventsFile.disabled) {
      it.skip(`${localTestName}  (${eventsFile.disabled})`, () => {})
      continue
    }

    it(localTestName, async function () {
      if (scenario.init) {
        let relpathFix = _.identity
        if (process.platform === 'win32' && this.currentTest.title.match(/win32/)) {
          relpathFix = (relpath) => relpath.replace(/\//g, '\\').toUpperCase()
        }
        await init(scenario, this.pouch, helpers.local.syncDir.abspath, relpathFix)
      }

      await runActions(scenario, helpers.local.syncDir.abspath)
      await helpers.local.simulateEvents(eventsFile.events)
      await helpers.syncAll()

      // TODO: Bring back Prep expectations for local tests?
      // TODO: Wrap in custom expectation
      if (scenario.expected) {
        const expectedLocalTree = scenario.expected.tree || scenario.expected.localTree
        const expectedRemoteTree = scenario.expected.tree || scenario.expected.remoteTree
        delete scenario.expected.tree
        delete scenario.expected.prepCalls // TODO: expect prep actions
        const actual = {}

        if (expectedLocalTree) {
          scenario.expected.localTree = expectedLocalTree
          actual.localTree = await helpers.local.tree()
        }
        if (expectedRemoteTree) {
          scenario.expected.remoteTree = expectedRemoteTree
          actual.remoteTree = await helpers.remote.treeWithoutTrash()
        }
        if (scenario.expected.remoteTrash) {
          actual.remoteTrash = await helpers.remote.trash()
        }

        should(actual).deepEqual(scenario.expected)
      }

      // TODO: pull
    })
  } // event files

  const remoteTestName = `test/scenarios/${scenario.name}/remote/`
  if (scenario.name.indexOf('outside') !== -1) {
    it.skip(`${remoteTestName}  (skip outside case)`, () => {})
    continue
  } else if (scenario.disabled) {
    it.skip(`${remoteTestName}  (${scenario.disabled})`, () => {})
    continue
  }

  it(remoteTestName, async function () {
    if (scenario.init) {
      await init(scenario, this.pouch, helpers.local.syncDir.abspath, _.identity)
      await helpers.remote.ignorePreviousChanges()
    }

    await remoteCaptureHelpers.runActions(scenario, cozyHelpers.cozy)

    await helpers.remote.pullChanges()
    for (let i = 0; i < scenario.actions.length + 1; i++) {
      await helpers.syncAll()
    }

    if (scenario.expected && scenario.expected.tree) {
      if (scenario.expected.prepCalls) {
        should(prepCalls).deepEqual(scenario.expected.prepCalls)
      }
      should(await helpers.local.treeWithoutTrash())
        .deepEqual(scenario.expected.tree)
    }
  }) // describe remote
} // scenarios
