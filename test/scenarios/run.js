/* eslint-env mocha */
/* @flow */

const Promise = require('bluebird')
const fse = require('fs-extra')
const _ = require('lodash')
const path = require('path')
const chai = require('chai')
const chaiLike = require('chai-like')
chai.use(chaiLike)
chai.Should()

const config = require('../../core/config')

const {
  disabledScenarioTest,
  init,
  loadFSEventFiles,
  loadAtomCaptures,
  runActions,
  scenarios,
  runWithBreakpoints,
  runWithStoppedClient
} = require('../support/helpers/scenarios')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const TestHelpers = require('../support/helpers')
const pouchHelpers = require('../support/helpers/pouch')
const remoteCaptureHelpers = require('../../dev/capture/remote')

const { platform } = process

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
    } else if (!runWithStoppedClient()) {
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
            await runLocalChokidar(
              scenario,
              _.cloneDeep(eventsFile),
              flushAfter,
              helpers
            )
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

    if (runWithStoppedClient()) continue
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

function shouldSkipLocalStopped(scenario) {
  const disabled = disabledScenarioTest(scenario, 'stopped')
  if (disabled) {
    return disabled
  } else if (!runWithStoppedClient()) {
    return `STOPPED_CLIENT is not set`
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

  if (!runWithBreakpoints()) breakpoints = [0]
  return breakpoints
}

async function runLocalAtom(scenario, atomCapture, helpers) {
  if (scenario.init) {
    await init(
      scenario,
      helpers.pouch,
      helpers.local.syncDir.abspath,
      atomCapture
    )
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
    // Wait for all local events to be flushed or a 10s time limit in case no
    // events are fired.
    await Promise.race([
      new Promise(resolve => {
        helpers.local.side.events.on('local-end', resolve)
      }),
      new Promise(resolve => {
        setTimeout(resolve, 10000)
      })
    ])
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
    await init(
      scenario,
      helpers.pouch,
      helpers.local.syncDir.abspath,
      eventsFile
    )
  }

  const eventsBefore = eventsFile.events.slice(0, flushAfter)
  const eventsAfter = eventsFile.events.slice(flushAfter)

  const inodeChanges = await runActions(
    scenario,
    helpers.local.syncDir.abspath,
    {
      skipWait: scenario.useCaptures
    }
  )

  if (eventsBefore.length) {
    for (const event of eventsBefore.reverse()) {
      for (const change of inodeChanges) {
        if (
          change.ino &&
          event.stats &&
          event.stats.ino &&
          event.path === change.path
        ) {
          event.stats.ino = change.ino
          break
        }
      }
    }

    await helpers.local.simulateEvents(eventsBefore.reverse())
    await helpers.syncAll()
  }
  if (eventsAfter.length) {
    for (const event of eventsAfter.reverse()) {
      for (const change of inodeChanges) {
        if (
          change.ino &&
          event.stats &&
          event.stats.ino &&
          event.path === change.path
        ) {
          event.stats.ino = change.ino
          break
        }
      }
    }

    await helpers.local.simulateEvents(eventsAfter.reverse())
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
    await init(scenario, helpers.pouch, helpers.local.syncDir.abspath)
  }

  await runActions(scenario, helpers.local.syncDir.abspath, {
    skipWait: true
  })

  await helpers.local.scan()
  await helpers.syncAll()

  await verifyExpectations(scenario, helpers, {
    includeLocalTrash: false,
    includeRemoteTrash: true
  })
}

async function runRemote(scenario, helpers) {
  if (scenario.init) {
    await init(scenario, helpers.pouch, helpers.local.syncDir.abspath)
    await helpers.remote.ignorePreviousChanges()
  }

  await remoteCaptureHelpers.runActions(scenario, cozyHelpers.cozy)

  await helpers.local.side.watcher.start()
  await helpers.remote.pullChanges()
  // TODO: Don't sync when scenario doesn't have target FS/trash assertions?
  await helpers.syncAll()
  // Wait for all local events to be flushed or a 10s time limit in case no
  // events are fired.
  await Promise.race([
    new Promise(resolve => {
      helpers.local.side.events.on('local-end', resolve)
    }),
    new Promise(resolve => {
      setTimeout(resolve, 10000)
    })
  ])
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

    const localTree = await helpers.local.treeWithoutTrash({ withIno: true })
    const pouchTree = await helpers.pouch.allDocs()
    const remoteTree = await helpers.remote.treeWithoutTrash()

    if (expectedLocalTree) {
      expected.localTree = expectedLocalTree.map(fpath => {
        const isFolder = fpath.endsWith('/')
        const localPath = path.normalize(isFolder ? fpath.slice(0, -1) : fpath)

        const pouchItem = pouchTree.find(
          // FIXME: we should not have to compare `localPath` with the
          // normalized form of `local.path` but `local.path` is normalized on
          // macOS since it's derived from local events' paths which are
          // normalized by `Chokidar.normalizedPaths` and so does not always
          // reflect the local path but the one that should be stored as the
          // main PouchDB record `path` attribute.
          d => d.local && d.local.path.normalize() === localPath.normalize()
        )
        return helpers.local.isIgnored(localPath, isFolder)
          ? { path: fpath }
          : {
              path: fpath,
              ino: pouchItem && pouchItem.local && pouchItem.local.ino,
              fileid: pouchItem && pouchItem.local && pouchItem.local.fileid // undefined if not running on Windows
            }
      })
      actual.localTree = localTree
    }
    if (expectedRemoteTree) {
      // TODO: fetch tree with id and rev to compare them
      expected.remoteTree = expectedRemoteTree
      actual.remoteTree = remoteTree
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

    actual.should.be.like(expected)
  }
}
