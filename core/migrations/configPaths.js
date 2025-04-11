/** Utilities to handle config paths during the migration from Cozy Desktop to
 * Twake Desktop.
 *
 * @module core/migrations
 * @flow
 */

const path = require('path')

const fse = require('fs-extra')

const BASE_DIR_NAME = '.twake-desktop'
const LEGACY_BASE_DIR_NAME = '.cozy-desktop'

function findBasePath(basePath /*: string */) /*: string */ {
  return getPath(basePath, {
    newName: BASE_DIR_NAME,
    legacyName: LEGACY_BASE_DIR_NAME
  })
}

function getPath(
  basePath /*: string */,
  { newName, legacyName } /*: { newName: string, legacyName: string } */
) /*: string */ {
  const legacyPath = path.join(basePath, legacyName)
  const newPath = path.join(basePath, newName)

  if (fse.existsSync(legacyPath)) {
    return legacyPath
  }
  return newPath
}

module.exports = {
  BASE_DIR_NAME,
  findBasePath,
  getPath
}
