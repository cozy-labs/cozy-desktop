'use strict'

const os = require('os')
const path = require('path')

const { DEFAULT_SYNC_DIR_NAME } = require('../../core/local/constants')

module.exports.syncPath = path.resolve(
  process.env.COZY_DESKTOP_DIR || os.homedir(),
  DEFAULT_SYNC_DIR_NAME
)
