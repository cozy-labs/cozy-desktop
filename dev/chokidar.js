#!/usr/bin/env node
const chokidar = require('chokidar')
const program = require('commander')
const local = require('./capture/local')
const fs = require('fs-extra')
const path = require('path')
const opn = require('opn')
const scenarioHelpers = require('../test/support/helpers/scenarios')

program
  .description('Prepare FS for capture')
  .arguments('scenario')
  .parse(process.argv)

const scenarioArg = program.args[0]

if (scenarioArg) {
  const match = scenarioArg.match(new RegExp(path.posix.join(
    '^.*', '?test', 'scenarios', `([^${path.posix.sep}]+)`, '?.*$')))

  if (!match) throw new Error(`Invalid argument: ${scenarioArg}`)
  const scenario = scenarioHelpers.scenarioByPath(path.join(
      __dirname, '..', 'test', 'scenarios', match[1], 'scenario.js'))

  local.setupInitialState(scenario)
  .then(() => console.log('Inodes :', local.mapInode))
  .then(startChokidar)
} else {
  startChokidar()
}

function startChokidar () {
  const syncPath = local.syncPath
  opn(syncPath)

  fs.ensureDirSync(syncPath)

  const watcher = chokidar.watch('.', {
    cwd: syncPath,
    ignored: /(^|[\/\\])\.system-tmp-cozy-drive/, // eslint-disable-line no-useless-escape
    followSymlinks: false,
    alwaysStat: true,
    usePolling: (process.platform === 'win32'),
    atomic: true,
    awaitWriteFinish: {
      pollInterval: 200,
      stabilityThreshold: 1000
    },
    interval: 1000,
    binaryInterval: 2000
  })
  for (let eventType of ['add', 'addDir', 'change', 'unlink', 'unlinkDir']) {
    watcher.on(eventType, (relpath, stats) => {
      const {ino} = stats || {}
      console.log(eventType, relpath, `[${ino}]`)
    })
  }
  watcher.on('error', (err) => console.error('error', err))
  watcher.on('raw', (event, path, details) => {
    console.log('raw:' + event, path, details)
  })

  console.log(`Watching ${syncPath}`)
}
