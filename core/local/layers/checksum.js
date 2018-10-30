/* @flow */

/*::
import type { Checksumer } from '../checksumer'
import type { Layer } from './events'
*/

module.exports = class ChecksumLayer {
  /*::
  next: Layer
  checksumer: Checksumer
  */

  constructor (next /*: Layer */, checksumer /*: Checksumer */) {
    this.next = next
    this.checksumer = checksumer
  }

  initial () {
    // TODO wait that the batches of events are finished
    return this.next.initial()
  }

  async process (events /*: Array<*> */) {
    // TODO we should not start processing a batch of events before the previous one has finished
    for (const event of events) {
      if (event.docType === 'file' && ['add', 'update'].includes(event.action)) {
        try {
          event.doc.checksum = await this.checksumer.push(event.doc.path)
        } catch (err) {
          // TODO
        }
      }
    }
    return this.next.process(events)
  }
}
