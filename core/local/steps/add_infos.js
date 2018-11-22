/* @flow */

const fse = require('fs-extra') // Used for await
const path = require('path')
const { id } = require('../../metadata')

/*::
import type Buffer from './buffer'
import type { Checksumer } from '../checksumer'
*/

module.exports = function (buffer /*: Buffer */, opts /*: { syncPath: string } */) /*: Buffer */ {
  return buffer.asyncMap(async (events) => {
    const batch = []
    for (const event of events) {
      try {
        event._id = id(event.path)
        if (['created', 'modified'].includes(event.action)) {
          event.stats = await fse.stats(path.join(opts.syncPath, event.path))
        }
        if (event.stats) { // created, modified, scan
          event.docType = event.stats.isDirectory() ? 'directory' : 'file'
        } else { // deleted, renamed
          // If kind is unknown, we say it's a file arbitrary
          event.docType = event.kind === 'directory' ? 'directory' : 'file'
        }
        batch.push(event)
      } catch (err) {
        // TODO error handling
      }
    }
    return batch
  })
}
