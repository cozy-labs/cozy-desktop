/** Capture local events to be replayed in test scenarios.
 *
 * @module dev/capture/local
 * @flow
 */

const EventEmitter = require('events')
const path = require('path')

const Promise = require('bluebird')
const chokidar = require('chokidar')
const fse = require('fs-extra')
const sinon = require('sinon')

const { Config, watcherType } = require('../../core/config')
const { Ignore } = require('../../core/ignore')
const { INITIAL_SCAN_DONE } = require('../../core/local/channel_watcher/event')
const ParcelProducer = require('../../core/local/channel_watcher/parcel_producer')
const fixturesHelpers = require('../../test/support/helpers/scenarios')

/*::
import type { Scenario } from '../../test/scenarios'
*/

const cliDir = path.resolve(path.join(__dirname, '..', '..'))
const syncDir = process.env.COZY_DESKTOP_DIR || cliDir
const config = new Config(path.join(syncDir, 'tmp', '.cozy-desktop'))
const syncPath = (config.syncPath = path.resolve(
  syncDir,
  'tmp',
  'local_watcher',
  'synced_dir'
))
const outsidePath = path.resolve(syncDir, 'tmp', 'local_watcher', 'outside')

const abspath = relpath => path.join(syncPath, relpath.replace(/\//g, path.sep))

const chokidarOptions = {
  cwd: syncPath,
  ignored: /(^|[\/\\])\.system-tmp-cozy-drive/, // eslint-disable-line no-useless-escape
  followSymlinks: false,
  alwaysStat: true,
  usePolling: process.platform === 'win32',
  atomic: true,
  awaitWriteFinish: {
    pollInterval: 200,
    stabilityThreshold: 1000
  },
  interval: 1000,
  binaryInterval: 2000
}

const DONE_FILE = '.done'

const mapInode = {}

// eslint-disable-next-line no-console,no-unused-vars
const debug = process.env.DEBUG != null ? console.log : (...args) => {}

const setupInitialState = (scenario /*: Scenario */) => {
  if (scenario.init == null) return
  debug('[init]')
  return Promise.each(scenario.init, opts => {
    let { ino, path: relpath, content } = opts
    if (relpath.endsWith('/')) {
      debug('- mkdir', relpath)
      return fse
        .ensureDir(abspath(relpath))
        .then(() => fse.stat(abspath(relpath)))
        .then(stats => {
          mapInode[stats.ino] = ino
          return
        })
    } else {
      debug('- >', relpath)
      return fse
        .outputFile(
          abspath(relpath),
          content || fixturesHelpers.DEFAULT_FILE_CONTENT
        )
        .then(() => fse.stat(abspath(relpath)))
        .then(stats => {
          mapInode[stats.ino] = ino
          return
        })
    }
  })
}

const buildFSEvent = (type, relpath, stats) => {
  const event /*: Object */ = { type, path: relpath }
  if (stats != null) event.stats = stats
  return event
}

const triggerDone = () => {
  return fse.outputFile(path.join(syncPath, DONE_FILE), '')
}

const isDone = relpath => {
  return relpath === DONE_FILE
}

const saveFSEventsToFile = (scenario, events, subdir = 'local') => {
  const json = JSON.stringify(events, null, 2)
  const eventsFile = scenario.path.replace(
    /scenario\.js/,
    path.join(subdir, `${process.platform}.json`)
  )

  return fse
    .outputFile(eventsFile, json)
    .then(() => subdir + path.sep + path.basename(eventsFile))
}

const logFSEvents = events => {
  if (process.env.DEBUG == null) return
  // eslint-disable-next-line no-console
  console.log('events:')
  for (let e of events) {
    // eslint-disable-next-line no-console
    console.log('-', e.type, e.path, `[${e.stats ? e.stats.ino : 'N/A'}]`)
  }
}

const replaceFSEventIno = event => {
  if (!event.stats) return
  if (mapInode[event.stats.ino]) event.stats.ino = mapInode[event.stats.ino]
  if (mapInode[event.stats.fileid])
    event.stats.fileid = mapInode[event.stats.fileid]
}

const runAndRecordChokidarEvents = scenario => {
  return new Promise((resolve, reject) => {
    const watcher = chokidar.watch('.', chokidarOptions)
    const cleanCallback = cb =>
      function() {
        return watcher
          .close()
          .then(cb.apply(null, arguments), cb.apply(null, arguments))
      }
    resolve = cleanCallback(resolve)
    reject = cleanCallback(reject)
    const events = []
    let record = false

    for (let eventType of ['add', 'addDir', 'change', 'unlink', 'unlinkDir']) {
      watcher.on(eventType, (relpath, stats) => {
        if (record) {
          if (isDone(relpath)) {
            logFSEvents(events)
            return saveFSEventsToFile(scenario, events)
              .then(resolve)
              .catch(reject)
          } else {
            if (stats != null && mapInode[stats.ino]) {
              stats.ino = mapInode[stats.ino]
            }
            events.push(buildFSEvent(eventType, relpath, stats))
          }
        }
      })
    }

    watcher.on('ready', async () => {
      record = true
      await fixturesHelpers.runActions(scenario, abspath, {
        saveInodeChanges: false
      })
      await Promise.delay(1000)
      triggerDone()
    })

    watcher.on('error', reject)
  })
}

const runAndRecordParcelEvents = async scenario => {
  const producer = new ParcelProducer({
    config,
    ignore: new Ignore([]),
    events: new EventEmitter()
  })
  const fakePush = sinon.stub(producer.channel, 'push')

  const capturedBatches = []
  try {
    // Complete producer start after processing the initial-scan-done event
    const scanDone = new Promise(resolve => {
      fakePush.withArgs([INITIAL_SCAN_DONE]).callsFake(() => {
        resolve()
      })
    })
    await producer.start()

    fakePush.callsFake(batch => {
      batch.forEach(replaceFSEventIno)
      capturedBatches.push(batch)
    })

    await fixturesHelpers.runActions(scenario, abspath, {
      saveInodeChanges: false
    })
    await scanDone
    await Promise.delay(1000)
    return saveFSEventsToFile(scenario, capturedBatches, 'channel')
  } finally {
    await producer.stop()
    fakePush.restore()
  }
}

const runAndRecordFSEvents =
  watcherType() === 'channel'
    ? runAndRecordParcelEvents
    : runAndRecordChokidarEvents

const captureScenario = (scenario /*: Scenario & {path: string} */) => {
  if (
    (scenario.platforms && !scenario.platforms.includes(process.platform)) ||
    (scenario.side && scenario.side !== 'local')
  ) {
    return
  }

  return fse
    .emptyDir(config.syncPath)
    .then(() => fse.emptyDir(outsidePath))
    .then(() => setupInitialState(scenario))
    .then(() => runAndRecordFSEvents(scenario))
}

module.exports = {
  name: 'local',
  setupInitialState,
  syncPath,
  mapInode,
  captureScenario
}
