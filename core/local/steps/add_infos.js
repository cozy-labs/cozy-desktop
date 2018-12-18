/* @flow */

const fse = require('fs-extra') // Used for await
const path = require('path')

const { id } = require('../../metadata')
const logger = require('../../logger')
const log = logger({
  component: 'addInfos'
})

let winfs
if (process.platform === 'win32') {
  winfs = require('@gyselroth/windows-fsstat')
}

/*::
import type Buffer from './buffer'
import type { Checksumer } from '../checksumer'
*/

// This step adds some basic informations about events: _id, docType and stats.
module.exports = function (buffer /*: Buffer */, opts /*: { syncPath: string } */) /*: Buffer */ {
  return buffer.asyncMap(async (events) => {
    const batch = []
    for (const event of events) {
      try {
        if (event.action !== 'initial-scan-done') {
          event._id = id(event.path)
          if (['created', 'modified', 'renamed'].includes(event.action)) {
            log.debug({path: event.path, action: event.action}, 'stat')
            if (winfs) {
              // XXX It would be better to avoid sync IO operations, but
              // before node 10.5.0, it's our only choice for reliable fileIDs
              event.stats = winfs.lstatSync(path.join(opts.syncPath, event.path))
            } else {
              event.stats = await fse.stat(path.join(opts.syncPath, event.path))
            }
          }
          if (event.stats) { // created, modified, renamed, scan
            let isDir
            if (winfs) {
              isDir = event.stats.directory
            } else {
              isDir = event.stats.isDirectory()
            }
            event.docType = isDir ? 'directory' : 'file'
          } else { // deleted
            // If kind is unknown, we say it's a file arbitrary
            event.docType = event.kind === 'directory' ? 'directory' : 'file'
          }
        }
        batch.push(event)
      } catch (err) {
        log.info({err, event}, 'Cannot get infos')
        console.log('stats', err) // TODO error handling
      }
    }
    return batch
  })
}
