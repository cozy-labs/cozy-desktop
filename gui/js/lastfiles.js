/** Save/reload recently synchronized files between app run.
 *
 * @module gui/js/lastfiles
 */

const fs = require('fs')
const path = require('path')

const async = require('async')

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
  lastFilesPath = path.join(desktop.basePath, 'last-files')
  lastFiles = new Promise(resolve => {
    fs.readFile(lastFilesPath, 'utf-8', (err, data) => {
      if (!err && data) {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          log.warn('Failed loading last files', { err })
          resolve([])
        }
      } else {
        log.warn('Failed loading last files', { err })
        resolve([])
      }
    })
  })
}

const persist = async () => {
  const data = JSON.stringify(await lastFiles)
  if (persistQueue) {
    persistQueue.pushAsync(data).catch(err => {
      log.warn('Failed to persist last files', { err })
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
