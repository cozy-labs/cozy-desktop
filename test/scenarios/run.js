/* eslint-env mocha */
/* @flow */

const path = require('path')

const Promise = require('bluebird')
const chai = require('chai')
const chaiLike = require('chai-like')
const fse = require('fs-extra')
const _ = require('lodash')
chai.use(chaiLike)
chai.Should()

const config = require('../../core/config')
const { logger } = require('../../core/utils/logger')
const remoteCaptureHelpers = require('../../dev/capture/remote')
const TestHelpers = require('../support/helpers')
const configHelpers = require('../support/helpers/config')
const cozyHelpers = require('../support/helpers/cozy')
const pouchHelpers = require('../support/helpers/pouch')
const {
  disabledScenarioTest,
  init,
  loadFSEventFiles,
  loadParcelCaptures,
  runActions,
  scenarios,
  runWithBreakpoints,
  runWithStoppedClient,
  fsStatsFromObj
} = require('../support/helpers/scenarios')

const {
  env: { CI: isCI },
  platform
} = process

const log = new logger({ component: 'TEST' })

describe('Scenario', function() {
  let helpers

  beforeEach(configHelpers.createConfig)
  beforeEach(configHelpers.registerClient)
  beforeEach(pouchHelpers.createDatabase)
  beforeEach(cozyHelpers.deleteAll)
  beforeEach('set up outside dir', async function() {
    await fse.emptyDir(path.resolve(path.join(this.syncPath, '..', 'outside')))
  })
  beforeEach(async function() {
    helpers = TestHelpers.init(this)

    // TODO: helpers.setup()
    await helpers.local.setupTrash()
    await helpers.remote.ignorePreviousChanges()
  })

  afterEach(async function() {
    await helpers.stop()
  })
  afterEach(pouchHelpers.cleanDatabase)
  afterEach(configHelpers.cleanConfig)

  for (let scenario of scenarios) {
    if (scenario.platforms && !scenario.platforms.includes(platform)) {
      it.skip(`test/scenarios/${scenario.name}/  (skip on ${platform})`, () => {})
      continue
    }

    if (scenario.side === 'remote') {
      it.skip(`test/scenarios/${scenario.name}/local/  (skip remote only test)`, () => {})
    } else if (!runWithStoppedClient()) {
      for (let parcelCapture of loadParcelCaptures(scenario)) {
        const localTestName = `test/scenarios/${scenario.name}/parcel/${parcelCapture.name}`
        if (config.watcherType() !== 'channel') {
          it.skip(localTestName, () => {})
          continue
        }

        if (parcelCapture.disabled) {
          it.skip(`${localTestName}  (${parcelCapture.disabled})`, () => {})
          continue
        }

        describe(localTestName, () => {
          if (scenario.init) {
            // Run the init phase outside the test itself to prevent timeouts on
            // long inits.
            // XXX: beforeEach is used to have access to async/await and helpers
            beforeEach(async () => {
              await init(
                scenario,
                helpers.pouch,
                helpers.local.syncDir.abspath,
                scenario.useCaptures ? parcelCapture : undefined
              )
            })
          }

          it('', async function() {
            await runLocalChannel(scenario, parcelCapture, helpers)
          })
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

        if (scenario.useCaptures) {
          const breakpoints = injectChokidarBreakpoints(eventsFile)

          for (let flushAfter of breakpoints) {
            it(localTestName + ' flushAfter=' + flushAfter, async function() {
              await runLocalChokidarWithCaptures(
                scenario,
                _.cloneDeep(eventsFile),
                flushAfter,
                helpers
              )
            })
          }
        } else {
          it(localTestName, async function() {
            if (isCI) this.timeout(3 * 60 * 1000)
            await runLocalChokidarWithoutCaptures(
              scenario,
              _.cloneDeep(eventsFile),
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
          if (isCI) this.timeout(60 * 1000)
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
      if (isCI && platform === 'darwin') this.timeout(60 * 1000)
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
  const { breakpoints = [] } = eventsFile.events[0] || {}

  if (breakpoints.length) {
    // Keep only actual events
    eventsFile.events = eventsFile.events.slice(1)
  }

  if (!runWithBreakpoints()) {
    // Flush only after all events were notified
    return [0]
  } else if (breakpoints.length) {
    // Flush after each requested breakpoint (i.e. specific numbers of events)
    return breakpoints
  } else {
    // Flush after each event
    return Object.keys(eventsFile.events)
  }
}

async function runLocalChannel(scenario, channelCapture, helpers) {
  if (scenario.useCaptures) {
    log.info('simulating channel watcher start')
    await helpers.local.simulateChannelWatcherStart()
  } else {
    await helpers.local.side.watcher.start()
  }

  const inodeChanges = await runActions(
    scenario,
    helpers.local.syncDir.abspath,
    {
      skipWait: scenario.useCaptures
    }
  )

  if (scenario.useCaptures) {
    for (const batch of channelCapture.batches) {
      for (const event of batch) {
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
        if (event.stats) {
          event.stats = fsStatsFromObj(event.stats, event.kind)
        }
      }
    }
    await helpers.local.simulateChannelEvents(channelCapture.batches)
  }

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

  if (!scenario.useCaptures) {
    await helpers.local.side.watcher.stop()
  }

  await helpers.syncAll()
  await helpers.pullAndSyncAll()

  await verifyExpectations(scenario, helpers, {
    includeLocalTrash: false,
    includeRemoteTrash: true
  })
}

async function runLocalChokidarWithCaptures(
  scenario,
  eventsFile,
  flushAfter,
  helpers
) {
  if (scenario.init) {
    await init(
      scenario,
      helpers.pouch,
      helpers.local.syncDir.abspath,
      eventsFile
    )
    // XXX: Run initial scan
    await helpers.local.scan()
  }

  const inodeChanges = await runActions(
    scenario,
    helpers.local.syncDir.abspath,
    {
      skipWait: true
    }
  )

  const eventsBefore = eventsFile.events.slice(0, flushAfter)
  const eventsAfter = eventsFile.events.slice(flushAfter)

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
}

async function runLocalChokidarWithoutCaptures(scenario, eventsFile, helpers) {
  if (scenario.init) {
    await init(scenario, helpers.pouch, helpers.local.syncDir.abspath)
  }

  await helpers.local.side.watcher.start()

  await runActions(scenario, helpers.local.syncDir.abspath)

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
