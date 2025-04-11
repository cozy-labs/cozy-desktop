/** Ignored files/directories handling.
 *
 * Cozy-desktop can ignore some files and folders with a `syncignore` file. This
 * file is read only at the startup of Cozy-desktop. So, if this file is
 * modified, cozy-desktop has to be relaunched for the changes to be effective.
 *
 * There 4 places where ignoring files and folders can have a meaning:
 *
 * - when a change is detected on the local file system and cozy-desktop is going
 *   to save it in its internal pouchdb
 * - when a change is detected on the remote cozy and cozy-desktop is going to
 *   save it in its internal pouchdb
 * - when a change is taken from the pouchdb and cozy-desktop is going to apply
 *   on the local file system
 * - when a change is taken from the pouchdb and cozy-desktop is going to apply
 *   on the remote cozy.
 *
 * Even with the first two checks, pouchdb can have a change for an ignored file
 * from a previous run of cozy-desktop where the file was not yet ignored. So, we
 * have to implement the last two checks. It is enough for a file created on one
 * side (local or remote) won't be replicated on the other side if it is ignored.
 *
 * But, there is a special case: conflicts are treated ahead of pouchdb. So, if a
 * file is created in both the local file system and the remote cozy (with
 * different contents) is ignored, the conflict will still be resolved by
 * renaming if we implement only the last two checks. We have to avoid that by
 * also implementing at least one of the first two checks.
 *
 * In practice, it's really convenient to let the changes from the remote couchdb
 * flows to pouchdb, even for ignored files, as it is very costly to find them
 * later if `syncignore` has changed. And it's a lot easier to detect local
 * files that were ignored but are no longer at the startup, as cozy-desktop
 * already does a full scan of the local file system at that moment.
 *
 * Thus, cozy-desktop has a check for ignored files and folder in three of the
 * four relevant places:
 *
 * - when a change is detected on the local file system and cozy-desktop is going
 *   to save it in its internal pouchdb
 * - when a change is taken from the pouchdb and cozy-desktop is going to apply
 *   on the local file system
 * - when a change is taken from the pouchdb and cozy-desktop is going to apply
 *   on the remote cozy.
 *
 * @module core/ignore
 * @see https://git-scm.com/docs/gitignore/#_pattern_format
 * @flow
 */

const fs = require('fs')
const { basename, dirname, resolve } = require('path')

const { matcher } = require('micromatch')

const { logger } = require('./utils/logger')

const log = logger({
  component: 'Ignore'
})

/*::
export type IgnorePattern = {
  match: (string) => boolean,
  basename: boolean,
  folder: boolean,
  negate: boolean
}
*/

/** Load both given file rules & default ones */
function loadSync(rulesFilePath /*: string */) /*: Ignore */ {
  let ignored
  try {
    ignored = readLinesSync(rulesFilePath)
  } catch (err) {
    if (err.code === 'ENOENT') {
      log.info('Skip loading of non-existent ignore rules file', {
        rulesFilePath
      })
    } else {
      log.warn('Failed loading ignore rules file', { rulesFilePath, err })
    }
    ignored = []
  }
  return new Ignore(ignored).addDefaultRules()
}

/** Read lines from a file.
 */
function readLinesSync(filePath /*: string */) /*: string[] */ {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
}

// Parse a line and build the corresponding pattern
function buildPattern(line /*: string */) /*: IgnorePattern */ {
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
  const nocase = process.platform === 'darwin' || process.platform === 'win32'
  const pattern = {
    match: matcher(line, { nocase }),
    basename: noslash, // The pattern can match only the basename
    folder, // The pattern will only match a folder
    negate // The pattern is negated
  }
  return pattern
}

/** Parse many lines and build the corresponding pattern array */
function buildPatternArray(lines /*: string[] */) /*: IgnorePattern[] */ {
  return Array.from(lines)
    .filter(isNotBlankOrComment)
    .map(buildPattern)
}

function isNotBlankOrComment(line /*: string */) /*: boolean */ {
  return line !== '' && line[0] !== '#'
}

function match(
  path /*: string */,
  isFolder /*: boolean */,
  pattern /*: IgnorePattern */
) /*: boolean */ {
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
  // On Windows, the various `path.*()` functions don't play well with
  // relative paths where the top-level file or directory name includes a
  // forbidden `:` character and looks like a drive letter, even without a
  // separator. Better make sure we don't end up in an infinite loop.
  if (parent === path) {
    return false
  }
  return match(parent, true, pattern)
}

/** The default rules included in the repo */
const defaultRulesPath = resolve(__dirname, './config/syncignore')

/**
 * Cozy-desktop can ignore some files and folders from a list of patterns in the
 * syncignore file. This class can be used to know if a file/folder is ignored.
 */
class Ignore {
  /*::
  patterns: IgnorePattern[]
  */

  // Load patterns for detecting ignored files and folders
  constructor(lines /*: string[] */) {
    this.patterns = buildPatternArray(lines)
  }

  // Add some rules for things that should be always ignored (temporary
  // files, thumbnails db, trash, etc.)
  addDefaultRules() /*: this */ {
    const defaultPatterns = buildPatternArray(readLinesSync(defaultRulesPath))
    this.patterns = defaultPatterns.concat(this.patterns)
    return this
  }

  // Return true if the given file/folder path should be ignored
  isIgnored(
    { relativePath, isFolder } /*: {relativePath: string, isFolder: boolean} */
  ) /*: boolean */ {
    let result = false
    for (let pattern of Array.from(this.patterns)) {
      if (pattern.negate) {
        if (result) {
          result = !match(relativePath, isFolder, pattern)
        }
      } else {
        if (!result) {
          result = match(relativePath, isFolder, pattern)
        }
      }
    }
    return result
  }
}

module.exports = {
  Ignore,
  loadSync
}
