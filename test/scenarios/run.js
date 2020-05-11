/* eslint-env mocha */
/* @flow */

const Promise = require('bluebird')
const fse = require('fs-extra')
const _ = require('lodash')
const path = require('path')
const should = require('should')

const config = require('../../core/config')

const {
  disabledScenarioTest,
  init,
  loadFSEventFiles,
  loadAtomCaptures,
  runActions,
  scenarios
} = require('../support/helpers/scenarios')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const TestHelpers = require('../support/helpers')
const pouchHelpers = require('../support/helpers/pouch')
const remoteCaptureHelpers = require('../../dev/capture/remote')

const { platform } = process

const stoppedEnvVar = 'STOPPED_CLIENT'

const logger = require('../../core/utils/logger')
const log = new logger({ component: 'TEST' })

describe('Test scenarios', function() {
  let helpers

  beforeEach(configHelpers.createConfig)
  beforeEach(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)
  beforeEach('set up outside dir', async function() {
    await fse.emptyDir(path.resolve(path.join(this.syncPath, '..', 'outside')))
  })

  afterEach(pouchHelpers.cleanDatabase)
  afterEach(configHelpers.cleanConfig)

  beforeEach(async function() {
    helpers = TestHelpers.init(this)

    // TODO: helpers.setup()
    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  for (let scenario of scenarios) {
    if (scenario.platforms && !scenario.platforms.includes(platform)) {
      it.skip(`test/scenarios/${scenario.name}/  (skip on ${platform})`, () => {})
      continue
    }

    if (scenario.side === 'remote') {
      it.skip(`test/scenarios/${scenario.name}/local/  (skip remote only test)`, () => {})
    } else if (process.env[stoppedEnvVar] == null) {
      for (let atomCapture of loadAtomCaptures(scenario)) {
        const localTestName = `test/scenarios/${scenario.name}/atom/${atomCapture.name}`
        if (config.watcherType() !== 'atom') {
          it.skip(localTestName, () => {})
          continue
        }

        if (atomCapture.disabled) {
          it.skip(`${localTestName}  (${atomCapture.disabled})`, () => {})
          continue
        }

        it(localTestName, async function() {
          await runLocalAtom(scenario, atomCapture, helpers)
        })
      }

      for (let eventsFile of loadFSEventFiles(scenario)) {
        const localTestName = `test/scenarios/${scenario.name}/local/${eventsFile.name}`
        if (config.watcherType() !== 'chokidar') {
          it.skip(localTestName, () => {})
          continue
        }
        if (eventsFile.disabled) {
          it.skip(`${localTestName}  (${eventsFile.disabled})`, () => {})
          continue
        }

        const breakpoints = injectChokidarBreakpoints(eventsFile)

        for (let flushAfter of breakpoints) {
          it(localTestName + ' flushAfter=' + flushAfter, async function() {
            await runLocalChokidar(scenario, eventsFile, flushAfter, helpers)
          })
        }
      }
    } else {
      const stoppedTestName = `test/scenarios/${scenario.name}/local/stopped`
      const stoppedTestSkipped = shouldSkipLocalStopped(scenario)
      if (stoppedTestSkipped) {
        it.skip(`${stoppedTestName} (${stoppedTestSkipped})`, () => {})
      } else {
        it(stoppedTestName, async function() {
          this.timeout(3 * 60 * 1000)
          await runLocalStopped(scenario, helpers)
        })
      }
    }

    if (process.env[stoppedEnvVar]) continue
    const remoteTestName = `test/scenarios/${scenario.name}/remote/`
    const remoteTestSkipped = shouldSkipRemote(scenario)
    if (remoteTestSkipped) {
      it.skip(`${remoteTestName}  (${remoteTestSkipped})`, () => {})
      continue
    }

    it(remoteTestName, async function() {
      await runRemote(scenario, helpers)
    })
  }
})

function shouldSkipLocalStopped(scenario, env = process.env) {
  const disabled = disabledScenarioTest(scenario, 'stopped')
  if (disabled) {
    return disabled
  } else if (env[stoppedEnvVar] == null) {
    return `${stoppedEnvVar} is not set`
  }
}

function shouldSkipRemote(scenario) {
  if (scenario.name.indexOf('outside') !== -1) {
    return 'skip outside case'
  }
  const disabled = disabledScenarioTest(scenario, 'remote')
  if (disabled) {
    return disabled
  } else if (scenario.side === 'local') {
    return 'skip local only test'
  }
}

function injectChokidarBreakpoints(eventsFile) {
  let breakpoints = []
  if (eventsFile.events[0] && eventsFile.events[0].breakpoints) {
    breakpoints = eventsFile.events[0].breakpoints
    eventsFile.events = eventsFile.events.slice(1)
  } else {
    // break between each events
    for (let i = 0; i < eventsFile.events.length; i++) breakpoints.push(i)
  }

  if (process.env.NO_BREAKPOINTS) breakpoints = [0]
  return breakpoints
}

async function runLocalAtom(scenario, atomCapture, helpers) {
  if (scenario.init) {
    await init(scenario, helpers.pouch, helpers.local.syncDir.abspath, true)
  }

  if (scenario.useCaptures) {
    log.info('simulating atom start')
    await helpers.local.simulateAtomStart()
  } else {
    await helpers.local.side.watcher.start()
  }

  await runActions(scenario, helpers.local.syncDir.abspath, {
    skipWait: scenario.useCaptures
  })

  if (scenario.useCaptures) {
    await helpers.local.simulateAtomEvents(atomCapture.batches)
  } else {
    await helpers.local.side.watcher.stop()
  }

  await helpers.syncAll()
  await helpers.pullAndSyncAll()

  await verifyExpectations(scenario, helpers, {
    includeLocalTrash: false,
    includeRemoteTrash: true
  })
}

async function runLocalChokidar(scenario, eventsFile, flushAfter, helpers) {
  if (scenario.init) {
    await init(scenario, helpers.pouch, helpers.local.syncDir.abspath)
  }

  const eventsBefore = eventsFile.events.slice(0, flushAfter)
  const eventsAfter = eventsFile.events.slice(flushAfter)

  await runActions(scenario, helpers.local.syncDir.abspath, { skipWait: true })
  if (eventsBefore.length) {
    await helpers.local.simulateEvents(eventsBefore)
    await helpers.syncAll()
  }
  if (eventsAfter.length) {
    await helpers.local.simulateEvents(eventsAfter)
    await helpers.syncAll()
  }
  await helpers.pullAndSyncAll()

  await verifyExpectations(scenario, helpers, {
    includeLocalTrash: false,
    includeRemoteTrash: true
  })

  // TODO: pull
}

async function runLocalStopped(scenario, helpers) {
  // TODO: Find why we need this to prevent random failures and fix it.
  await Promise.delay(500)
  if (scenario.init) {
    await init(scenario, helpers.pouch, helpers.local.syncDir.abspath, true)
  }

  await runActions(scenario, helpers.local.syncDir.abspath, { skipWait: true })

  await helpers.local.scan()
  await helpers.syncAll()

  await verifyExpectations(scenario, helpers, {
    includeLocalTrash: false,
    includeRemoteTrash: true
  })
}

async function runRemote(scenario, helpers) {
  if (scenario.init) {
    const useRealInodes = true
    await init(
      scenario,
      helpers.pouch,
      helpers.local.syncDir.abspath,
      useRealInodes
    )
    await helpers.remote.ignorePreviousChanges()
  }

  await remoteCaptureHelpers.runActions(scenario, cozyHelpers.cozy)

  await helpers.local.side.watcher.start()
  await helpers.remote.pullChanges()
  // TODO: Don't sync when scenario doesn't have target FS/trash assertions?
  await helpers.syncAll()
  if (process.platform === 'darwin') {
    // Wait for all local events to be dispatched
    await Promise.delay(1500)
    // $FlowFixMe buffer is defined in ChokidarWatcher
    await helpers.local.side.watcher.buffer.flush()
  } else {
    // Wait for all local events to be dispatched
    await Promise.delay(500)
    await helpers.local.simulateAtomEvents([])
  }
  await helpers.local.side.watcher.stop()
  await helpers.syncAll()

  await verifyExpectations(scenario, helpers, {
    includeLocalTrash: true,
    includeRemoteTrash: false
  })

  // TODO: Local trash assertions
}

async function verifyExpectations(
  scenario,
  helpers,
  { includeLocalTrash, includeRemoteTrash }
) {
  // TODO: Wrap in custom expectation
  if (scenario.expected) {
    const expectedLocalTree =
      scenario.expected.tree || scenario.expected.localTree
    const expectedRemoteTree =
      scenario.expected.tree || scenario.expected.remoteTree
    const expectedLocalTrash =
      scenario.expected.trash || scenario.expected.localTrash
    const expectedRemoteTrash =
      scenario.expected.trash || scenario.expected.remoteTrash
    const expected = {}
    const actual = {}

    if (expectedLocalTree) {
      if (process.env.COZY_DESKTOP_FS === 'HFS+') {
        expected.localTree = expectedLocalTree.map(relpath =>
          relpath.normalize ? relpath.normalize('NFD') : relpath
        )
      } else {
        expected.localTree = expectedLocalTree
      }
      actual.localTree = await helpers.local.treeWithoutTrash()
    }
    if (expectedRemoteTree) {
      expected.remoteTree = expectedRemoteTree
      actual.remoteTree = await helpers.remote.treeWithoutTrash()
    }
    if (expectedLocalTrash && includeLocalTrash) {
      expected.localTrash = expectedLocalTrash
      actual.localTrash = await helpers.local.trash()
    }
    if (expectedRemoteTrash && includeRemoteTrash) {
      expected.remoteTrash = expectedRemoteTrash
      actual.remoteTrash = await helpers.remote.trash()
    }
    if (scenario.expected.contents) {
      expected.localContents = scenario.expected.contents
      expected.remoteContents = scenario.expected.contents
      actual.localContents = {}
      actual.remoteContents = {}
      for (const relpath of _.keys(scenario.expected.contents)) {
        actual.localContents[relpath] = await helpers.local
          .readFile(relpath)
          .catch(err => `Error Reading Local(${relpath}): ${err.message}`)
        actual.remoteContents[relpath] = await helpers.remote
          .readFile(relpath)
          .catch(err => `Error Reading Remote(${relpath}): ${err.message}`)
      }
    }

    should(actual).deepEqual(expected)
  }
}
