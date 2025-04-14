#!/usr/bin/env node
const path = require('path')

const chokidar = require('chokidar')
const program = require('commander')
const fse = require('fs-extra')
const open = require('open')

const local = require('./capture/local')
const scenarioHelpers = require('../test/support/helpers/scenarios')

program
  .description('Prepare FS for capture')
  .arguments('[scenario]')
  .parse(process.argv)

const scenarioArg = program.args[0]

if (scenarioArg) {
  const match = scenarioArg.match(
    new RegExp(
      path.posix.join(
        '^.*',
        '?test',
        'scenarios',
        `([^${path.posix.sep}]+)`,
        '?.*$'
      )
    )
  )

  if (!match) throw new Error(`Invalid argument: ${scenarioArg}`)
  const scenario = scenarioHelpers.scenarioByPath(
    path.join(__dirname, '..', 'test', 'scenarios', match[1], 'scenario.js')
  )

  return local
    .setupInitialState(scenario)
    .then(() => {
      // eslint-disable-next-line no-console
      console.log('Inodes :', local.mapInode)
      return
    })
    .then(startChokidar)
} else {
  startChokidar()
}

function startChokidar() {
  const syncPath = process.env.COZY_DESKTOP_DIR || local.syncPath
  open(syncPath)

  fse.ensureDirSync(syncPath)

  const watcher = chokidar.watch('.', {
    cwd: syncPath,
    ignored: /(^|[\/\\])\.system-tmp-twake-desktop/, // eslint-disable-line no-useless-escape
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
  })
  for (let eventType of ['add', 'addDir', 'change', 'unlink', 'unlinkDir']) {
    watcher.on(eventType, (relpath, stats) => {
      const { ino } = stats || {}
      // eslint-disable-next-line no-console
      console.log(eventType, relpath, `[${ino}]`)
    })
  }
  watcher.on('error', err => {
    // eslint-disable-next-line no-console
    console.error('error', err)
  })
  watcher.on('raw', (event, path, details) => {
    // eslint-disable-next-line no-console
    console.log('raw:' + event, path, details)
  })

  // eslint-disable-next-line no-console
  console.log(`Watching ${syncPath}`)
  return
}
