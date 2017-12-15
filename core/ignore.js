/* @flow weak */

import { basename, dirname } from 'path'
import { matcher, makeRe } from 'micromatch'

export type IgnorePattern = {
  match: (string) => boolean,
  basename: boolean,
  folder: boolean,
  negate: boolean
}

// Cozy-desktop can ignore some files and folders from a list of patterns in the
// cozyignore file. This class can be used to know if a file/folder is ignored.
//
// See https://git-scm.com/docs/gitignore/#_pattern_format
let DefaultRules
let MicromatchOptions
class Ignore {
  static initClass () {
    // See https://github.com/github/gitignore/tree/master/Global
    DefaultRules = [
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
      'Icon\r',

      // Vim
      '*.sw[px]',

      // Windows
      'Thumbs.db',
      'ehthumbs.db'
    ]

    // See https://github.com/jonschlinkert/micromatch#options
    MicromatchOptions =
            {noextglob: true}
  }

  patterns: IgnorePattern[]

  // Load patterns for detecting ignored files and folders
  constructor (lines) {
    this.patterns = []
    for (let line of Array.from(lines)) {
      if (line === '') { continue }          // Blank line
      if (line[0] === '#') { continue }      // Comments
      this.patterns.push(this.buildPattern(line))
    }
  }

  // Parse a line and build the corresponding pattern
  buildPattern (line) {
    let folder = false
    let negate = false
    let noslash = line.indexOf('/') === -1
    if (line.indexOf('**') !== -1) {   // Detect two asterisks
      noslash = false
    }
    if (line[0] === '!') {               // Detect bang prefix
      line = line.slice(1)
      negate = true
    }
    if (line[0] === '/') {               // Detect leading slash
      line = line.slice(1)
    }
    if (line[line.length - 1] === '/') {   // Detect trailing slash
      line = line.slice(0, line.length - 1)
      folder = true
    }
    line = line.replace(/^\\/, '')   // Remove leading escaping char
    line = line.replace(/\s*$/, '')  // Remove trailing spaces
    // Ignore case for case insensitive file-systems
    if (process.platform === 'darwin') {
      line = makeRe(line, {nocase: true})
    }
    let pattern = {
      match: matcher(line, MicromatchOptions),
      basename: noslash,   // The pattern can match only the basename
      folder,    // The pattern will only match a folder
      negate    // The pattern is negated
    }
    return pattern
  }

  // Add some rules for things that should be always ignored (temporary
  // files, thumbnails db, trash, etc.)
  addDefaultRules () {
    let morePatterns = (Array.from(DefaultRules).map((rule) => this.buildPattern(rule)))
    this.patterns = morePatterns.concat(this.patterns)
    return this
  }

  // Return true if the doc matches the pattern
  match (path, isFolder, pattern) {
    if (pattern.basename) {
      if (pattern.match(basename(path))) { return true }
    }
    if (isFolder || !pattern.folder) {
      if (pattern.match(path)) { return true }
    }
    let parent = dirname(path)
    if (parent === '.') { return false }
    return this.match(parent, true, pattern)
  }

  // Return true if the given file/folder path should be ignored
  isIgnored (doc) {
    let result = false
    for (let pattern of Array.from(this.patterns)) {
      if (pattern.negate) {
        if (result) { result = !this.match(doc._id, doc.docType === 'folder', pattern) }
      } else {
        if (!result) { result = this.match(doc._id, doc.docType === 'folder', pattern) }
      }
    }
    return result
  }
}
Ignore.initClass()

export default Ignore
