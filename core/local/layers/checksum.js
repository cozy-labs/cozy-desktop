/* @flow */

const Sequential = require('./sequential')

/*::
import type { Checksumer } from '../checksumer'
import type { Layer, LayerEvent } from './events'
*/

// This layer computes the md5sum for added and updated files.
module.exports = class ChecksumLayer extends Sequential {
  /*::
  next: Layer
  task : Promise<*>
  checksumer: Checksumer
  */

  constructor (next /*: Layer */, checksumer /*: Checksumer */) {
    super(next)
    this.checksumer = checksumer
  }

  async doProcess (events /*: LayerEvent[] */) {
    for (const event of events) {
      if (['add', 'update'].includes(event.action) && event.doc.docType === 'file') {
        try {
          event.doc.md5sum = await this.checksumer.push(event.abspath)
        } catch (err) {
          // TODO
          console.error(err)
        }
      }
    }
    return events
  }
}
