/* @flow */

const Sequential = require('./sequential')

/*::
import type { Checksumer } from '../checksumer'
import type { Layer, LayerEvent } from './events'
*/

// This layer computes the md5sum for added and updated files.
module.exports = class ChecksumLayer extends Sequential /*:: implements Layer */ {
  /*::
  checksumer: Checksumer
  */

  constructor (next /*: Layer */, checksumer /*: Checksumer */) {
    super(next)
    this.checksumer = checksumer
  }

  async doProcess (events /*: LayerEvent[] */) {
    const batch = []
    for (const event of events) {
      try {
        if (['add', 'update'].includes(event.action) && event.doc.docType === 'file') {
          event.doc.md5sum = await this.checksumer.push(event.abspath)
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
  }
}
