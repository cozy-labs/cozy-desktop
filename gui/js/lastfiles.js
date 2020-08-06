/** Save/reload recently synchronized files between app run.
 *
 * @module gui/js/lastfiles
 */

const fs = require('fs')
const path = require('path')

let lastFilesPath = ''
let lastFiles = Promise.resolve([])

const log = require('../../core/app').logger({
  component: 'GUI'
})

const init = desktop => {
  lastFilesPath = path.join(desktop.basePath, 'last-files')
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

const persist = async () => {
  const data = JSON.stringify(await lastFiles)
  fs.writeFile(lastFilesPath, data, err => {
    if (err) {
      log.warn({ err }, 'Failed to persist last files')
    }
  })
}

const list = async () => await lastFiles
const add = async file => {
  const previousList = await lastFiles
  previousList.push(file)
  lastFiles = Promise.resolve(previousList.slice(-250))
}
const remove = async file => {
  const previousList = await lastFiles
  lastFiles = Promise.resolve(previousList.filter(f => f.path !== file.path))
}

module.exports = {
  init,
  list,
  add,
  remove,
  persist
}
