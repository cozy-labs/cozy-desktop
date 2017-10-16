#!/usr/bin/env babel-node

import Promise from 'bluebird'
import chokidar from 'chokidar'
import fs from 'fs-extra'
import _ from 'lodash'
import path from 'path'
import fixturesHelpers from '../test/fixtures/local_watcher'

const cliDir = path.resolve(path.join(__dirname, '..'))
const syncPath = path.join(cliDir, 'tmp', 'local_watcher', 'synced_dir')
const outsidePath = path.join(cliDir, 'tmp', 'local_watcher', 'outside')
const abspath = (relpath) => path.join(syncPath, relpath.replace(/\//g, path.sep))
const chokidarOptions = {
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

const DONE_FILE = '.done'

const mapInode = {}

const setupInitialState = (scenario) => {
  if (scenario.init == null) return
  console.log('init:')
  let resolve
  const donePromise = new Promise((_resolve) => { resolve = _resolve })
  const watcher = chokidar.watch('.', chokidarOptions)
  watcher.on('error', console.log.bind(console))
  watcher.on('add', relpath => {
    if (isDone(relpath)) {
      watcher.close()
      resolve()
    }
  })
  return Promise.each(scenario.init, (opts) => {
    let {ino, path: relpath} = opts
    if (relpath.endsWith('/')) {
      console.log('- mkdir', relpath)
      return fs.ensureDir(abspath(relpath))
             .then(() => fs.stat(abspath(relpath)))
             .then((stats) => mapInode[stats.ino] = ino)
    } else {
      console.log('- >', relpath)
      return fs.outputFile(abspath(relpath), 'whatever')
             .then(() => fs.stat(abspath(relpath)))
             .then((stats) => mapInode[stats.ino] = ino)
    }
  })
  .delay(1000)
  .then(triggerDone)
  .then(() => donePromise)
}

const isRootDir = (relpath) => {
  relpath === ''
}

const buildFSEvent = (type, relpath, stats) => {
  const event = {type, path: relpath}
  if (stats != null) event.stats = _.pick(stats, ['ino', 'size', 'mtime', 'ctime'])
  return event
}

const triggerDone = () => {
  return fs.outputFile(path.join(syncPath, DONE_FILE), '')
}

const isDone = (relpath) => {
  return relpath === DONE_FILE
}

const saveFSEventsToFile = (scenario, events) => {
  const json = JSON.stringify(events, null, 2)
  const eventsFile = scenario.path
    .replace(/scenario\.js/, `fsevents.${process.platform}.json`)

  return fs.outputFile(eventsFile, json)
}

const logFSEvents = (events) => {
  console.log('events:')
  for (let e of events) {
    console.log('-', e.type, e.path, `[${e.stats ? e.stats.ino : 'N/A'}]`)
  }
}

const runAndRecordFSEvents = (scenario) => {
  return new Promise((_resolve, _reject) => {
    const watcher = chokidar.watch('.', chokidarOptions)
    const cleanCallback = cb => function () {
      watcher.close()
      cb.apply(null, arguments)
    }
    const resolve = cleanCallback(_resolve)
    const reject = cleanCallback(_reject)
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
            if(stats != null && mapInode[stats.ino]) stats.ino = mapInode[stats.ino]
            events.push(buildFSEvent(eventType, relpath, stats))
          }
        }
      })
    }

    watcher.on('ready', () => {
      record = true
      fixturesHelpers.runActions(scenario, abspath)
        .delay(1000)
        .then(triggerDone)
        .catch(reject)
    })

    watcher.on('error', reject)
  })
}

const runAllScenarios = () => {
  return Promise.each(fixturesHelpers.scenarios, (scenario) => {
    console.log(`----- ${scenario.name} -----`)
    return fs.emptyDir(syncPath)
      .then(() => fs.emptyDir(outsidePath))
      .then(() => setupInitialState(scenario))
      .then(() => runAndRecordFSEvents(scenario))
  })
}
runAllScenarios()
  .then(() => { console.log('Done with all scenarios.')})
  .catch(error => console.error({error}))
