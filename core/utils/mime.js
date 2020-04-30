const mime = require('mime')
const path = require('path')

const { NOTE_MIME_TYPE } = require('../remote/constants')

function lookup(filepath) {
  if (path.extname(filepath) === '.cozy-note') {
    return NOTE_MIME_TYPE
  }
  return mime.lookup(filepath)
}

module.exports = {
  lookup
}
