/* @flow */

const Sequential = require('./sequential')

/*::
import type { Checksumer } from '../checksumer'
import type { Layer } from './events'
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

  async doProcess (events /*: Array<*> */) {
    for (const event of events) {
      if (event.docType === 'file' && ['add', 'update'].includes(event.action)) {
        try {
          event.doc.md5sum = await this.checksumer.push(event.doc.path)
        } catch (err) {
          // TODO
          console.error(err)
        }
      }
    }
    return events
  }
}
