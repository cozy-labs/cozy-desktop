/* @flow weak */

const { basename, dirname } = require('path')
const { matcher, makeRe } = require('micromatch')

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

function isNotBlankOrComment (line) {
  return line !== '' && line[0] !== '#'
}

function match (path, isFolder, pattern) {
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

// See https://github.com/github/gitignore/tree/master/Global
const DefaultRules = [
  // all hidden files
  '.*',

  // Dropbox
  '.dropbox',
  '.dropbox.attr',
  '.dropbox.cache',

  // Eclipse, SublimeText and many others
  '*.tmp',
  '*.bak',

  // Emacs
  '*~',
  '\\#*\\#',

  // LibreOffice
  '.~lock.*#',

  // Linux
  '.fuse_hidden*',
  '.Trash-*',

  // Microsoft Office
  '~$*.{doc,xls,ppt}*',

  // OSX
  '.DS_Store',
  '.DocumentRevisions-V100',
  '.fseventsd',
  '.Spotlight-V100',
  '.TemporaryItems',
  '.Trashes',
  '.VolumeIcon.icns',
  // Pattern must be escaped twice on case-insensitive plateforms in order
  // for makeRe() to work
  process.platform === 'darwin' || process.platform === 'win32'
    ? 'Icon\\r'
    : 'Icon\r',

  // Vim
  '*.sw[px]',

  // Windows
  'Thumbs.db',
  'ehthumbs.db'
]

// Cozy-desktop can ignore some files and folders from a list of patterns in the
// cozyignore file. This class can be used to know if a file/folder is ignored.
//
// See https://git-scm.com/docs/gitignore/#_pattern_format
class Ignore {
  // Load patterns for detecting ignored files and folders
  constructor (lines) {
    this.patterns = Array.from(lines)
      .filter(isNotBlankOrComment)
      .map(buildPattern)
    this.match = match
  }

  // Add some rules for things that should be always ignored (temporary
  // files, thumbnails db, trash, etc.)
  addDefaultRules () {
    let morePatterns = Array.from(DefaultRules).map(buildPattern)
    this.patterns = morePatterns.concat(this.patterns)
    return this
  }

  // Return true if the given file/folder path should be ignored
  isIgnored (doc) {
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

module.exports = Ignore
