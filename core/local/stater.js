/* @flow */

const fse = require('fs-extra')

let winfs
if (process.platform === 'win32') {
  // $FlowFixMe
  winfs = require('@gyselroth/windows-fsstat')
}

/*::
import type { Metadata } from '../metadata'
import type { Callback } from '../utils/func'
import type fs from 'fs'

export type WinStats = {
  fileid: string,
  ino: number,
  size: number,
  atime: Date,
  mtime: Date,
  ctime: Date,
  directory: bool,
  symbolicLink: bool
}
export type Stats = fs.Stats | WinStats
*/

module.exports = {
  stat: async function (filepath /*: string */) {
    if (!winfs) {
      return fse.stat(filepath)
    }
    return new Promise((resolve, reject) => {
      try {
        // XXX It would be better to avoid sync IO operations, but
        // before node 10.5.0, it's our only choice for reliable fileIDs.
        resolve(winfs.lstatSync(filepath))
      } catch (err) {
        reject(err)
      }
    })
  },

  withStats: function (filepath /*: string */, callback /*: Callback */) {
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

  isDirectory (stats /*: Stats */) {
    if (stats.isDirectory) {
      // $FlowFixMe
      return stats.isDirectory()
    } else {
      // $FlowFixMe
      return stats.directory
    }
  },

  kind (stats /*: Stats */) {
    return this.isDirectory(stats) ? 'directory' : 'file'
  },

  assignInoAndFileId (doc /*: Metadata */, stats /*: Stats */) {
    doc.ino = stats.ino
    // $FlowFixMe
    if (stats.fileid) { doc.fileid = stats.fileid }
  }
}
