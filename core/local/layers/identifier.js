/* @flow */

const { assignId } = require('../../metadata')

/*::
import type { Layer } from './events'
*/

// Identifier just adds IDs to the documents in the events.
// TODO call metadata.assignPlatformIncompatibilities from here?
module.exports = class Identifier {
  /*::
  next: Layer
  */

  constructor (next /*: Layer */) {
    this.next = next
  }

  initial () {
    return this.next.initial()
  }

  process (events /*: Array<*> */) {
    for (const event of events) {
      if (event.doc) {
        assignId(event.doc)
      }
      if (event.was) {
        assignId(event.was)
      }
    }
    return this.next.process(events)
  }
}
