/* @flow */

const path = require('path')

const fsutils = require('./fs')

const DATE_REGEXP = '\\d{4}(?:-\\d{2}){2}T(?:\\d{2}_?){3}\\.\\d{3}Z'
const SEPARATOR_REGEXP = `(?!.*\\${path.sep}.*)`
const CONFLICT_REGEXP = new RegExp(
  `-conflict-${DATE_REGEXP}${SEPARATOR_REGEXP}`
)

function conflictSuffix() /*: string */ {
  const date = fsutils.validName(new Date().toISOString())
  return `-conflict-${date}`
}

function replacePreviousConflictSuffix(filePath /*: string */) /*: string */ {
  return filePath.replace(CONFLICT_REGEXP, conflictSuffix())
}

function addConflictSuffix(filePath /*: string */) /*: string */ {
  const dirname = path.dirname(filePath)
  const extname = path.extname(filePath)
  const filename = path.basename(filePath, extname)
  const notTooLongFilename = filename.slice(0, 180)
  return `${path.join(
    dirname,
    notTooLongFilename
  )}${conflictSuffix()}${extname}`
}

function generateConflictPath(fpath /*: string */) /*: string */ {
  return CONFLICT_REGEXP.test(fpath)
    ? replacePreviousConflictSuffix(fpath)
    : addConflictSuffix(fpath)
}

module.exports = {
  CONFLICT_REGEXP,
  generateConflictPath
}
