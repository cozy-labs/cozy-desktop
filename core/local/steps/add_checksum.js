/* @flow */

const { asyncMap } = require('./utils')
const path = require('path')

/*::
import type { Checksumer } from '../checksumer'
*/

module.exports = async function* (generator /*: AsyncGenerator<*, void, void> */, opts /*: { syncPath: string , checksumer: Checksumer } */) /*: AsyncGenerator<*, void, void> */ {
  return asyncMap(generator, async (events) => {
    const batch = []
    for (const event of events) {
      try {
        if (['add', 'update'].includes(event.action) && event.docType === 'file') {
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
