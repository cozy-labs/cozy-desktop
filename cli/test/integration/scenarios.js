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

// describe('test/scenarios/', () => {
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
    // describe(`${scenario.name}/`, () => {
    //   describe('local/', () => {
        // if (scenario.init) {
        //   beforeEach('init', async function () {
        //     let relpathFix = _.identity
        //     if (process.platform === 'win32' && this.currentTest.title.match(/win32/)) {
        //       relpathFix = (relpath) => relpath.replace(/\//g, '\\').toUpperCase()
        //     }
        //     await init(scenario, this.pouch, helpers.local.syncDir.abspath, relpathFix)
        //   })
        // }
        //
        // beforeEach('actions', () => runActions(scenario, helpers.local.syncDir.abspath))

        for (let eventsFile of loadFSEventFiles(scenario)) {
          if (process.platform === 'win32' && eventsFile.name.indexOf('win32') === -1) {
            it.skip(`${eventsFile.name}`, () => {})
            continue
          }

          it(`test/scenarios/${scenario.name}/local/${eventsFile.name}`, async function () {
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
      // }) // local

      if (scenario.name.indexOf('outside') !== -1) {
        it.skip(`no outside on remote`, () => {})
        continue
      }

      // describe('remote/', () => {
      it(`test/scenarios/${scenario.name}/remote/`, async function () {
        if (scenario.init) {
          // beforeEach('init', async function () {
            await init(scenario, this.pouch, helpers.local.syncDir.abspath, _.identity)
            await helpers.remote.ignorePreviousChanges()
          // })
        }

        // beforeEach('actions', async () => {
          await remoteCaptureHelpers.runActions(scenario, cozyHelpers.cozy)
        // })

        // if (scenario.name.indexOf('outside') !== -1) {
        //   it.skip(`no outside on remote`, () => {})
        //   return
        // }

        // it('works', async function () {
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
        // }) // changes file test
      }) // describe remote
    // }) // scenario
  } // scenarios
// })
