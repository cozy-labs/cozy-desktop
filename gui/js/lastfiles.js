const fs = require('fs')
const path = require('path')

let lastFilesPath = ''
let lastFiles = []

const log = require('../../core/app').logger({
  component: 'GUI'
})

module.exports.init = (desktop) => {
  lastFilesPath = path.join(desktop.basePath, 'last-files')
  fs.readFile(lastFilesPath, 'utf-8', (err, data) => {
    if (!err && data) {
      try {
        lastFiles = JSON.parse(data)
      } catch (err) {}
    }
  })
}

module.exports.persists = () => {
  const data = JSON.stringify(lastFiles)
  fs.writeFile(lastFilesPath, data, (err) => {
    if (err) {
      log.error(err)
    }
  })
}

module.exports.list = () => lastFiles
module.exports.add = (file) => {
  lastFiles.push(file)
  lastFiles = lastFiles.slice(-250)
}
module.exports.remove = (file) => {
  lastFiles = lastFiles.filter((f) => f.path !== file.path)
}
