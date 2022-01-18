const mime = require('mime')
const path = require('path')

const { NOTE_MIME_TYPE } = require('../remote/constants')

function lookup(filepath) {
  if (path.extname(filepath) === '.cozy-note') {
    return NOTE_MIME_TYPE
  }
  // Sinve mime v2.x, no default type is returned when none can be found for the
  // given path.
  // We re-introduce the previous default type, `bin`, for backwards
  // compatibility.
  return mime.getType(filepath) || mime.getType('bin')
}

module.exports = {
  lookup
}
