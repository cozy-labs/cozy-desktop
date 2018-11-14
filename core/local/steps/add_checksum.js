/* @flow */

/*::
import type { Checksumer } from '../checksumer'
*/

module.exports = async function* (generator, checksumer /*: Checksumer */) {
  for await (const batch of generator) {
    const batch = []
    for (const event of events) {
      try {
        if (['add', 'update'].includes(event.action) && event.docType === 'file') {
          event.md5sum = await this.checksumer.push(event.abspath)
        }
        batch.push(event)
      } catch (err) {
        // TODO Currently, we ignore events when there is an error for
        // computing the checksum as it is often just because the file has been
        // deleted since. But we should have a more fine-grained error handling
        // here.
      }
    }
    yield batch
  }
}
