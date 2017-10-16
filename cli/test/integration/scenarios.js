/* eslint-env mocha */
/* @flow */

import fs from 'fs-extra'
import path from 'path'
import should from 'should'
import sinon from 'sinon'

import { scenarios, loadFSEventFiles, runActions, init } from '../helpers/scenarios'
import configHelpers from '../helpers/config'
import * as cozyHelpers from '../helpers/cozy'
import { IntegrationTestHelpers } from '../helpers/integration'
import pouchHelpers from '../helpers/pouch'

describe('test/scenarios/', () => {
  let helpers

  // Spies
  let sendToPrep

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
    sendToPrep = sinon.spy(helpers.local.local.watcher, 'sendToPrep')

    // TODO: helpers.setup()
    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  afterEach(function () {
    // TODO: Include in custom assertion
    if (this.currentTest.state === 'failed') {
      console.log('Prep actions:', sendToPrep.getCalls().map(c => c.args[0]))
      // TODO: dump logs
    }
  })

  for (let scenario of scenarios) {
    describe(`${scenario.name}/`, () => {
      describe('local/', () => {
        if (scenario.init) {
          beforeEach('init', async function () {
            await init(scenario, this.pouch, helpers.local.syncDir.abspath)
          })
        }

        beforeEach('actions', () => runActions(scenario, helpers.local.syncDir.abspath))

        for (let eventsFile of loadFSEventFiles(scenario)) {
          it(eventsFile.name, async function () {
            await helpers.local.simulateEvents(eventsFile.events)
            await helpers.syncAll()

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
      }) // local → remote
    }) // scenario
  } // scenarios
})
