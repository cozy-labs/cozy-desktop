/**
 * @module core/utils/fs
 */

const Promise = require('bluebird')
const childProcess = require('child_process')

const logger = require('./logger')

Promise.promisifyAll(childProcess)

module.exports = {
  hideOnWindows,
  validName
}

const log = logger({
  component: 'Fs'
})

/** Hide a directory on Windows.
 *
 * Errors are logged, not thrown.
 */
async function hideOnWindows(path /*: string */) /*: Promise<void> */ {
  if (process.platform !== 'win32') return
  try {
    await childProcess.execAsync(`attrib +h "${path}"`)
  } catch (err) {
    log.error(err)
  }
}

const ILLEGAL_CHARACTERS = '/?<>\\:*|"'
const ILLEGAL_CHARACTERS_REGEXP = new RegExp(`[${ILLEGAL_CHARACTERS}]`, 'g')
const REPLACEMENT_CHARACTER = '_'

// Return a new name compatible with target filesystems by replacing invalid
// characters from the given file/dir name.
function validName(name /*: string */) {
  return name.replace(ILLEGAL_CHARACTERS_REGEXP, REPLACEMENT_CHARACTER)
}
