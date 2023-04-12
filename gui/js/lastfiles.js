/** Save/reload recently synchronized files between app run.
 *
 * @module gui/js/lastfiles
 */

const fs = require('fs')
const os = require('os')
const async = require('async')
const envPaths = require('../../core/utils/xdg');
const path = require('path')
const fse = require('fs-extra')

let lastFilesPath = ''
let lastFiles = Promise.resolve([])
let persistQueue = null

const log = require('../../core/app').logger({
  component: 'GUI'
})

const writeJSON = (data, callback) => {
  fs.writeFile(lastFilesPath, data, callback)
}

const init = desktop => {
  persistQueue = async.queue(writeJSON)


  lastFilesPath = findLastFilesPath()
  lastFiles = new Promise(resolve => {
    fs.readFile(lastFilesPath, 'utf-8', (err, data) => {
      if (!err && data) {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          log.warn({ err }, 'Failed loading last files')
          resolve([])
        }
      } else {
        log.warn({ err }, 'Failed loading last files')
        resolve([])
      }
    })
  })
}

const findLastFilesPath = () => {
    const xdgPaths = envPaths('cozy-desktop')

  // All the possible directories where the config file can be in
  // priority order
  const paths = [
    process.env.COZY_DESKTOP_DIR, // The user specified folder
    path.join(os.homedir(), '.cozy-desktop'), // The legacy folder
    xdgPaths.data, // The XDG spec case
  ]

  for (const p of paths) {
    if (fse.existsSync(p)) {
      return path.join(p, 'last-files')
    }
  }

  // No config dir exist, we need to create one following the XDG spec 
  // if no folder is specified by the user.
  const dataDir = process.env.COZY_DESKTOP_DIR || xdgPaths.log
  fse.ensureFileSync(dataDir)
  hideOnWindows(dataDir)

  return path.Join(dataDir, 'last-files')
}

const persist = async () => {
  const data = JSON.stringify(await lastFiles)
  if (persistQueue) {
    persistQueue.pushAsync(data).catch(err => {
      log.warn({ err }, 'Failed to persist last files')
    })
  }
}

const list = async () => await lastFiles
const add = async file => {
  const previousList = await remove(file)
  lastFiles = Promise.resolve(previousList.concat(file).slice(-250))
  return lastFiles
}
const remove = async file => {
  const previousList = await lastFiles
  lastFiles = Promise.resolve(previousList.filter(f => f.path !== file.path))
  return lastFiles
}
const reset = () => {
  lastFiles = Promise.resolve([])
  return lastFiles
}

module.exports = {
  init,
  list,
  add,
  remove,
  persist,
  reset
}
