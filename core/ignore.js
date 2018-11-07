// @flow

const { basename, dirname, resolve } = require('path')
const { matcher, makeRe } = require('micromatch')
const fs = require('fs')

/*::
export type IgnorePattern = {
  match: (string) => boolean,
  basename: boolean,
  folder: boolean,
  negate: boolean
}
*/

/* ::
import type {Metadata} from './metadata.js'
*/

// Parse a line and build the corresponding pattern
function buildPattern (line) {
  let folder = false
  let negate = false
  let noslash = line.indexOf('/') === -1
  if (line.indexOf('**') !== -1) {
    // Detect two asterisks
    noslash = false
  }
  if (line[0] === '!') {
    // Detect bang prefix
    line = line.slice(1)
    negate = true
  }
  if (line[0] === '/') {
    // Detect leading slash
    line = line.slice(1)
  }
  if (line[line.length - 1] === '/') {
    // Detect trailing slash
    line = line.slice(0, line.length - 1)
    folder = true
  }
  line = line.replace(/^\\/, '') // Remove leading escaping char
  line = line.replace(/( |\t)*$/, '') // Remove trailing spaces
  // Ignore case for case insensitive file-systems
  if (process.platform === 'darwin' || process.platform === 'win32') {
    line = makeRe(line, { nocase: true })
  }
  let pattern = {
    match: matcher(line, {}),
    basename: noslash, // The pattern can match only the basename
    folder, // The pattern will only match a folder
    negate // The pattern is negated
  }
  return pattern
}

function isNotBlankOrComment (line /*: string */) /*: boolean */ {
  return line !== '' && line[0] !== '#'
}

function match (path, isFolder, pattern /*: IgnorePattern */) {
  if (pattern.basename) {
    if (pattern.match(basename(path))) {
      return true
    }
  }
  if (isFolder || !pattern.folder) {
    if (pattern.match(path)) {
      return true
    }
  }
  let parent = dirname(path)
  if (parent === '.') {
    return false
  }
  return match(parent, true, pattern)
}

// Cozy-desktop can ignore some files and folders from a list of patterns in the
// cozyignore file. This class can be used to know if a file/folder is ignored.
//
// See https://git-scm.com/docs/gitignore/#_pattern_format
class Ignore {
  /*::
  patterns: IgnorePattern[]
  match: (string, boolean, IgnorePattern) => boolean
  */

  // Load patterns for detecting ignored files and folders
  constructor (lines /*: string[] */) {
    this.patterns = Array.from(lines)
      .filter(isNotBlankOrComment)
      .map(buildPattern)
    this.match = match
  }

  // Add some rules for things that should be always ignored (temporary
  // files, thumbnails db, trash, etc.)
  addDefaultRules () {
    // TODO: split on return char depending on the OS
    const DefaultRules = fs
      .readFileSync(resolve(__dirname, './config/.cozyignore'), 'utf8')
      .split(/\r?\n/)
    let morePatterns = Array.from(DefaultRules).map(buildPattern)
    this.patterns = morePatterns.concat(this.patterns)
    return this
  }

  // Return true if the given file/folder path should be ignored
  isIgnored (doc /*: Metadata */) {
    let result = false
    for (let pattern of Array.from(this.patterns)) {
      if (pattern.negate) {
        if (result) {
          result = !this.match(doc._id, doc.docType === 'folder', pattern)
        }
      } else {
        if (!result) {
          result = this.match(doc._id, doc.docType === 'folder', pattern)
        }
      }
    }
    return result
  }
}

module.exports = {
  Ignore
}
