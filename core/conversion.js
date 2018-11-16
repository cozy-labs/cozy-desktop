/* @flow */

const path = require('path')

module.exports = {
  extractDirAndName
}

// Extract the remote path and name from a local id
function extractDirAndName (id /*: string */) /*: [string, string] */ {
  const dir = '/' + id.split(path.sep).slice(0, -1).join('/')
  const name = path.basename(id)
  return [dir, name]
}
