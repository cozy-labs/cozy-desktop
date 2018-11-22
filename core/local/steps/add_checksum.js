/* @flow */

const path = require('path')

/*::
import type Buffer from './buffer'
import type { Checksumer } from '../checksumer'
*/

// This step adds md5sum for created and updated files.
module.exports = function (buffer /*: Buffer */, opts /*: { syncPath: string , checksumer: Checksumer } */) /*: Buffer */ {
  return buffer.asyncMap(async (events) => {
    const batch = []
    for (const event of events) {
      try {
        if (['created', 'updated'].includes(event.action) && event.docType === 'file') {
          const absPath = path.join(opts.syncPath, event.path)
          event.md5sum = await opts.checksumer.push(absPath)
        }
        batch.push(event)
      } catch (err) {
        // TODO Currently, we ignore events when there is an error for
        // computing the checksum as it is often just because the file has been
        // deleted since. But we should have a more fine-grained error handling
        // here.
      }
    }
    return batch
  })
}
