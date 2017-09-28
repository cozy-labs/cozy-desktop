#!/usr/bin/env node

var Promise = require('bluebird')
var chokidar = require('chokidar')
var fs = require('fs-extra')
var _ = require('lodash')
var path = require('path')
var fixturesHelpers = require('../test/fixtures/local_watcher')

var cliDir = path.resolve(path.join(__dirname, '..'))
var fixturesDir = path.join(cliDir, 'test', 'fixtures', 'local_watcher')
var syncPath = path.join(cliDir, 'tmp', 'local_watcher')
var abspath = (relpath) => path.join(syncPath, relpath.replace(/\//g, path.sep))
var chokidarOptions = {
  cwd: syncPath,
  ignored: /(^|[\/\\])\.system-tmp-cozy-drive/,
  followSymlinks: false,
  alwaysStat: true,
  usePolling: (process.platform === 'win32'),
  atomic: true,
  awaitWriteFinish: {
    pollInterval: 200,
    stabilityThreshold: 1000
  },
  interval: 1000,
  binaryInterval: 2000,
}

var watcher, state, scenarios
if (watcher != null) { watcher.close(); delete watcher }
if (state != null) delete state

scenarios = _.chain(fs.readdirSync(fixturesDir))
  .filter(name => name.endsWith('.scenario.js'))
  .map(name => {
    const scenarioPath = path.join(fixturesDir, name)
    return _.merge({name, path: scenarioPath}, require(scenarioPath))
  })
  .value()

var DONE_FILE = '.done'

var setupInitialState = (scenario) => {
  if (scenario.init == null) return
  console.log('init:')
  return Promise.each(scenario.init, relpath => {
    if (relpath.endsWith('/')) {
      console.log('- mkdir', relpath)
      return fs.ensureDir(abspath(relpath))
    } else {
      console.log('- >', relpath)
      return fs.outputFile(abspath(relpath), 'whatever')
    }
  })
}

var isRootDir = (relpath) => {
  relpath === ''
}

var buildFSEvent = (type, relpath, stats) => {
  const event = {type, path: relpath}
  if (stats != null) event.stats = _.pick(stats, ['ino', 'size', 'mtime', 'ctime'])
  return event
}

var triggerEventsSaving = () => {
  return fs.outputFile(path.join(syncPath, DONE_FILE), '')
}

var shouldSaveEvents = (relpath) => {
  return relpath === DONE_FILE
}

var saveFSEventsToFile = (scenario, events) => {
  const json = JSON.stringify(events, null, 2)
  const eventsFile = scenario.path
    .replace(/\.scenario\.js/, `.fsevents.${process.platform}.json`)

  return fs.outputFile(eventsFile, json)
}

var logFSEvents = (events) => {
  console.log('events:')
  for (let e of events) {
    console.log('-', e.type, e.path, `[${e.stats ? e.stats.ino : 'N/A'}]`)
  }
}

var runAndRecordFSEvents = (scenario) => {
  return new Promise((_resolve, _reject) => {
    const watcher = chokidar.watch('.', chokidarOptions)
    const cleanCallback = cb => function () {
      watcher.close()
      cb.apply(arguments)
    }
    const resolve = cleanCallback(_resolve)
    const reject = cleanCallback(_reject)
    const events = []
    let record = false

    for (let eventType of ['add', 'addDir', 'change', 'unlink', 'unlinkDir']) {
      watcher.on(eventType, (relpath, stats) => {
        if (record) {
          if (shouldSaveEvents(relpath)) {
            logFSEvents(events)
            return saveFSEventsToFile(scenario, events)
              .then(resolve)
              .catch(reject)
          } else {
            events.push(buildFSEvent(eventType, relpath, stats))
          }
        }
      })
    }

    watcher.on('ready', () => {
      record = true
      fixturesHelpers.runActions(scenario, abspath)
        .delay(1000)
        .then(triggerEventsSaving)
        .catch(reject)
    })

    watcher.on('error', reject)
  })
}

var runAllScenarios = () => {
  return Promise.each(scenarios, (scenario) => {
    console.log(`----- ${scenario.name} -----`)
    return fs.emptyDir(syncPath)
      .then(() => setupInitialState(scenario))
      .then(() => runAndRecordFSEvents(scenario))
  })
}
fs.emptyDir(syncPath)
  .then(runAllScenarios)
  .then(() => { console.log('Done with all scenarios.')})
  .catch(console.error.bind(console))
