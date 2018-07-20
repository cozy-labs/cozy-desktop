/* eslint-env mocha */
/* @flow */

const Promise = require('bluebird')
const fs = require('fs-extra')
const _ = require('lodash')
const path = require('path')
const should = require('should')
const sinon = require('sinon')

const { scenarios, loadFSEventFiles, runActions, init } = require('../support/helpers/scenarios')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const { IntegrationTestHelpers } = require('../support/helpers/integration')
const pouchHelpers = require('../support/helpers/pouch')
const remoteCaptureHelpers = require('../../dev/capture/remote')

let helpers

// Spies
let prepCalls

describe('Test scenarios', function () {
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
        const call /*: Object */ = {method}
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
    for (let eventsFile of loadFSEventFiles(scenario)) {
      const localTestName = `test/scenarios/${scenario.name}/local/${eventsFile.name}`
      if (eventsFile.disabled) {
        it.skip(`${localTestName}  (${eventsFile.disabled})`, () => {})
        continue
      }

      let breakpoints = []
      if (eventsFile.events[0] && eventsFile.events[0].breakpoints) {
        breakpoints = eventsFile.events[0].breakpoints
        eventsFile.events = eventsFile.events.slice(1)
      } else {
        // break between each events
        for (let i = 0; i < eventsFile.events.length; i++) breakpoints.push(i)
      }

      if (process.env.NO_BREAKPOINTS) breakpoints = [0]

      for (let flushAfter of breakpoints) {
        it(localTestName + ' flushAfter=' + flushAfter, async function () {
          if (scenario.init) {
            let relpathFix = _.identity
            if (process.platform === 'win32' && localTestName.match(/win32/)) {
              relpathFix = (relpath) => relpath.replace(/\//g, '\\')
            }
            await init(scenario, this.pouch, helpers.local.syncDir.abspath, relpathFix)
          }

          const eventsBefore = eventsFile.events.slice(0, flushAfter)
          const eventsAfter = eventsFile.events.slice(flushAfter)

          await runActions(scenario, helpers.local.syncDir.abspath)
          await helpers.local.simulateEvents(eventsBefore)
          await helpers.syncAll()
          await helpers.local.simulateEvents(eventsAfter)
          await helpers.syncAll()

          // TODO: Bring back Prep expectations for local tests?
          // TODO: Wrap in custom expectation
          if (scenario.expected) {
            const expectedLocalTree = scenario.expected.tree || scenario.expected.localTree
            const expectedRemoteTree = scenario.expected.tree || scenario.expected.remoteTree
            const expected = _.pick(scenario.expected, ['remoteTrash'])
            const actual = {}

            // TODO: expect prep actions
            if (expectedLocalTree) {
              expected.localTree = expectedLocalTree
              actual.localTree = await helpers.local.tree()
            }
            if (expectedRemoteTree) {
              expected.remoteTree = expectedRemoteTree
              actual.remoteTree = await helpers.remote.treeWithoutTrash()
            }
            if (scenario.expected.remoteTrash) {
              actual.remoteTrash = await helpers.remote.trash()
            }
            if (scenario.expected.contents) {
              expected.localContents = scenario.expected.contents
              expected.remoteContents = scenario.expected.contents
              actual.localContents = {}
              actual.remoteContents = {}
              for (const relpath of _.keys(scenario.expected.contents)) {
                actual.localContents[relpath] = await helpers.local.readFile(relpath)
                    .catch(err => `Error Reading Local(${relpath}): ${err.message}`)
                actual.remoteContents[relpath] = await helpers.remote.readFile(relpath)
                    .catch(err => `Error Reading Remote(${relpath}): ${err.message}`)
              }
            }

            should(actual).deepEqual(expected)
          }

          // TODO: pull
        })
      } // event files
    }

    const stoppedTestName = `test/scenarios/${scenario.name}/local/stopped`
    const stoppedEnvVar = 'STOPPED_CLIENT'

    if (scenario.disabled) {
      it.skip(`${stoppedTestName} (${scenario.disabled})`, () => {})
    } else if (process.env[stoppedEnvVar] == null) {
      it.skip(`${stoppedTestName} (${stoppedEnvVar} is not set)`, () => {})
    } else {
      it(stoppedTestName, async function () {
        this.timeout(3 * 60 * 1000)
        // TODO: Find why we need this to prevent random failures and fix it.
        await Promise.delay(500)
        if (scenario.init) {
          let relpathFix = _.identity
          if (process.platform === 'win32' && this.currentTest.title.match(/win32/)) {
            relpathFix = (relpath) => relpath.replace(/\//g, '\\')
          }
          await init(scenario, this.pouch, helpers.local.syncDir.abspath, relpathFix, true)
        }

        await runActions(scenario, helpers.local.syncDir.abspath)

        await helpers.local.local.watcher.start()
        await helpers.local.local.watcher.stop(true)

        await helpers.syncAll()

        if (scenario.expected) {
          const expectedLocalTree = scenario.expected.tree || scenario.expected.localTree
          const expectedRemoteTree = scenario.expected.tree || scenario.expected.remoteTree
          const expected = _.pick(scenario.expected, ['remoteTrash'])
          const actual = {}

           // TODO: expect prep actions
          if (expectedLocalTree) {
            expected.localTree = expectedLocalTree
            actual.localTree = await helpers.local.tree()
          }
          if (expectedRemoteTree) {
            expected.remoteTree = expectedRemoteTree
            actual.remoteTree = await helpers.remote.treeWithoutTrash()
          }
          if (scenario.expected.remoteTrash) {
            actual.remoteTrash = await helpers.remote.trash()
          }

          should(actual).deepEqual(expected)
        } // scenario.expected
      }) // test
    } // !eventsFile.disabled

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
        let relpathFix = _.identity
        if (process.platform === 'win32') {
          relpathFix = (relpath) => relpath.replace(/\//g, '\\')
        }
        await init(scenario, this.pouch, helpers.local.syncDir.abspath, relpathFix)
        await helpers.remote.ignorePreviousChanges()
      }

      await remoteCaptureHelpers.runActions(scenario, cozyHelpers.cozy)

      // TODO: Don't actually merge when scenario has only Prep assertions?
      await helpers.remote.pullChanges()
      // TODO: Don't sync when scenario doesn't have target FS/trash assertions?
      for (let i = 0; i < scenario.actions.length + 1; i++) {
        await helpers.syncAll()
      }

      // TODO: Merge local/stopped/remote expectations
      if (scenario.expected && scenario.expected.tree) {
        if (scenario.expected.prepCalls) {
          should(prepCalls).deepEqual(scenario.expected.prepCalls)
        }
        should(await helpers.local.treeWithoutTrash())
          .deepEqual(scenario.expected.tree)
      }
      if (scenario.expected && scenario.expected.contents) {
        const expected = {
          localContents: scenario.expected.contents,
          remoteContents: scenario.expected.contents
        }
        const actual = {
          localContents: {},
          remoteContents: {}
        }
        for (const relpath of _.keys(scenario.expected.contents)) {
          actual.localContents[relpath] = await helpers.local.readFile(relpath)
          actual.remoteContents[relpath] = await helpers.remote.readFile(relpath)
        }
        should(actual).deepEqual(expected)
      }

      // TODO: Local trash assertions
    }) // describe remote
  } // scenarios
})
