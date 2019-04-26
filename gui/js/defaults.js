'use strict'

const os = require('os')
const path = require('path')

module.exports.syncPath = path.resolve(
  process.env.COZY_DESKTOP_DIR || os.homedir(),
  'Cozy Drive'
)
