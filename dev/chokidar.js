const chokidar = require('chokidar')
const fs = require('fs-extra')
const path = require('path')

const syncPath = path.resolve(path.join(__dirname, '..', 'tmp', 'chokidar'))
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
