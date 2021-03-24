/** Provide reliable file stats for every supported platform.
 *
 * @module core/local/stater
 * @flow
 */

const fs = require('fs')
const fse = require('fs-extra')

let winfs
if (process.platform === 'win32') {
  // $FlowFixMe
  winfs = require('@gyselroth/windows-fsstat')
}

/*::
import type { Metadata, MetadataLocalInfo } from '../metadata'
import type { Callback } from '../utils/func'

export type WinStats = {|
  fileid: string,
  ino: number,
  size: number,
  atime: Date,
  mtime: Date,
  ctime: Date,
  directory: bool,
  symbolicLink: bool
|}
export type Stats = fs.Stats | WinStats
*/

/** @gyselroth/windows-fsstat errors are strings -_-' */
const isMissingFileError = err =>
  err.code === 'ENOENT' || (err.startsWith && err.startsWith('ENOENT'))

module.exports = {
  async stat(filepath /*: string */) {
    if (!winfs) {
      return fse.stat(filepath)
    }
    return new Promise((resolve, reject) => {
      try {
        // XXX It would be better to avoid sync IO operations, but
        // before node 10.5.0, it's our only choice for reliable fileIDs.
        // TODO move to node v10.5.0+ when a release of electron supports it
        // FIXME: this `stat` does not provide the same functionnality as
        // `fs.stat`: fields are missing (e.g. `mode`) and the date fields don't
        // have the same values (i.e. the `winfs` version truncates the time to
        // the second while the `fs` version provides milliseconds).
        resolve(winfs.lstatSync(filepath))
      } catch (err) {
        reject(err)
      }
    })
  },

  async statMaybe(absPath /*: string */) /*: Promise<?Stats> */ {
    try {
      return await this.stat(absPath)
    } catch (err) {
      if (!isMissingFileError(err)) {
        throw err
      }
    }
  },

  withStats(filepath /*: string */, callback /*: Callback */) {
    if (winfs) {
      try {
        const stats = winfs.lstatSync(filepath)
        callback(null, stats)
      } catch (err) {
        callback(err, {})
      }
    } else {
      fse.stat(filepath, callback)
    }
  },

  isDirectory(stats /*: Stats */) {
    if (stats instanceof fs.Stats) {
      return stats.isDirectory()
    } else if (stats.directory) {
      return stats.directory
    }
    return false
  },

  kind(stats /*: Stats */) {
    return this.isDirectory(stats) ? 'directory' : 'file'
  },

  assignInoAndFileId(
    doc /*: Metadata|MetadataLocalInfo */,
    stats /*: Stats */
  ) {
    doc.ino = stats.ino
    if (typeof stats.fileid === 'string') {
      doc.fileid = stats.fileid
    }
  }
}
