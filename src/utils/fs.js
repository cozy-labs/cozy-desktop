import logger from '../logger'

const log = logger({
  component: 'FS'
})

// The fswin module can only be loaded on Windows
let fswin
if (process.platform === 'win32') {
  fswin = require('fswin')
}

// Hides a file or directory on Windows.
// Async so it doesn't block more useful operations.
// No failure handling because we can't / don't want to do anything anyway.
export function hideOnWindows (path: string): void {
  if (!fswin) return
  fswin.setAttributes(path, {IS_HIDDEN: true}, (succeeded) => {
    if (!succeeded) log.warn(`Could not set IS_HIDDEN flag on ${path}`)
  })
}

const ILLEGAL_CHARACTERS = '/?<>\\:*|"'
const ILLEGAL_CHARACTERS_REGEXP = new RegExp(`[${ILLEGAL_CHARACTERS}]`, 'g')
const REPLACEMENT_CHARACTER = '_'

// Return a new name compatible with target filesystems by replacing invalid
// characters from the given file/dir name.
export function validName (name: string) {
  return name.replace(ILLEGAL_CHARACTERS_REGEXP, REPLACEMENT_CHARACTER)
}
