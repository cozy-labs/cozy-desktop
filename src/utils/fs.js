const ILLEGAL_CHARACTERS = '/?<>\\:*|"'
const ILLEGAL_CHARACTERS_REGEXP = new RegExp(`[${ILLEGAL_CHARACTERS}]`, 'g')
const REPLACEMENT_CHARACTER = '_'

// Return a new name compatible with target filesystems by replacing invalid
// characters from the given file/dir name.
export function validName (name: string) {
  return name.replace(ILLEGAL_CHARACTERS_REGEXP, REPLACEMENT_CHARACTER)
}
