/**
 * @module core/utils/fs
 */

const Promise = require('bluebird')
const childProcess = require('child_process')
const { shell } = require('electron')
const fse = require('fs-extra')

const logger = require('./logger')

Promise.promisifyAll(childProcess)

const log = logger({
  component: 'Fs'
})

/** Hide a directory on Windows.
 *
 * Errors are logged, not thrown.
 */
async function hideOnWindows(fullpath /*: string */) /*: Promise<void> */ {
  if (process.platform !== 'win32') return
  try {
    await childProcess.execAsync(`attrib +h "${fullpath}"`)
  } catch (err) {
    log.warn(err)
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

async function sendToTrash(fullpath /*: string */) {
  try {
    await shell.trashItem(fullpath)
  } catch (err) {
    if (await fse.exists(fullpath)) {
      throw err
    } else {
      const error = new Error()
      error.code = 'ENOENT'
      error.path = fullpath
      error.message = `${error.code}: No such file or directory, sendToTrash '${error.path}'`
      throw error
    }
  }
}

module.exports = {
  hideOnWindows,
  sendToTrash,
  validName
}
