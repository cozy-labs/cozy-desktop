import Promise from 'bluebird'
import childProcess from 'child_process'

import logger from '../logger'

Promise.promisifyAll(childProcess)

const log = logger({
  component: 'FS'
})

// Hides a directory on Windows.
// Errors are logged, not thrown.
export async function hideOnWindows (path: string): Promise<void> {
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
export function validName (name: string) {
  return name.replace(ILLEGAL_CHARACTERS_REGEXP, REPLACEMENT_CHARACTER)
}
